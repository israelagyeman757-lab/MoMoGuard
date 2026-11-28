import { apiUrl, getToken, setToken } from "./config.js";

const toastEl = document.getElementById("toast");
let toastTimer = null;
let questions = [];
let answers = [];
let qIndex = 0;
let assessmentType = "pre";
let trainUserId = "";

function showToast(message, tone = "info") {
  if (!toastEl) return;
  toastEl.hidden = false;
  toastEl.textContent = message;
  toastEl.dataset.tone = tone;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4200);
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), { ...opts, headers });
  if (!res.ok) throw new Error(await res.text() || res.statusText);
  return res.json();
}

function showPanel(name) {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.panel === name);
  });
  document.querySelectorAll(".panel").forEach((p) => {
    const active = p.dataset.panel === name;
    p.hidden = !active;
    p.classList.toggle("is-active", active);
  });
}

function nickUserId() {
  const nick = (document.getElementById("train_nick").value.trim() || "friend").toLowerCase().replace(/\s+/g, "-");
  trainUserId = `train-${nick}`;
  return nick;
}

function setSignedIn(on) {
  document.getElementById("auth_card").hidden = on;
  document.getElementById("rep_nav").hidden = !on;
  document.getElementById("rep_main").hidden = !on;
}

async function demoLogin() {
  const data = await api("/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ role: "rep" }),
  });
  setToken(data.token);
  document.getElementById("auth_status").textContent = "Signed in as demo community rep";
  setSignedIn(true);
  showToast("Welcome, community rep");
  await loadDashboard();
  await loadWarnings();
}

function renderDashboard(stats) {
  const items = [
    { label: "People trained", value: stats.people_trained ?? 0 },
    { label: "Avg improvement", value: stats.avg_improvement_pp != null ? `${stats.avg_improvement_pp} pts` : "—" },
    { label: "Reports assisted", value: stats.reports_assisted ?? 0 },
    { label: "Warnings shared", value: stats.warnings_shared ?? 0 },
  ];
  document.getElementById("dash_stats").innerHTML = items.map((s) => `
    <div class="stat"><strong>${s.value}</strong><span>${s.label}</span></div>`).join("");
}

async function loadDashboard() {
  try {
    renderDashboard(await api("/rep/dashboard"));
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function submitAssisted() {
  const phone = document.getElementById("assist_phone").value.trim();
  const scam_type = document.getElementById("assist_type").value;
  const description = document.getElementById("assist_desc").value.trim();
  if (!description) {
    showToast("Add a short description");
    return;
  }
  try {
    const res = await api("/rep/assisted-reports", {
      method: "POST",
      body: JSON.stringify({
        phone_number: phone,
        scam_type,
        description,
        loss_reported: document.getElementById("assist_loss").checked,
      }),
    });
    showToast(`Report #${res.id} filed — member stays anonymous`);
    document.getElementById("assist_desc").value = "";
    await loadDashboard();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function riskTone(result) {
  if (result === "WARNING_AVAILABLE" || result === "MULTIPLE_REPORTS") return "high";
  if (result === "UNDER_REVIEW") return "watch";
  return "clear";
}

async function runLookup() {
  const phone = document.getElementById("lookup_phone").value.trim();
  if (!phone) {
    showToast("Enter a phone number");
    return;
  }
  try {
    const data = await api(`/numbers/check/${encodeURIComponent(phone)}`);
    const card = document.getElementById("lookup_result");
    card.hidden = false;
    document.getElementById("lookup_badge").textContent = data.result || "—";
    document.getElementById("lookup_msg").textContent = data.message || "";
    document.getElementById("lookup_disc").textContent = data.disclaimer || "No reports found does not mean safe.";
    card.dataset.risk = riskTone(data.result);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function showQuestion() {
  const q = questions[qIndex];
  document.getElementById("quiz_card").hidden = false;
  document.getElementById("quiz_progress").textContent = `Question ${qIndex + 1} of ${questions.length}`;
  document.getElementById("quiz_question").textContent = q.question;
  document.getElementById("quiz_feedback").textContent = "";
  document.getElementById("quiz_next").hidden = true;
  const opts = document.getElementById("quiz_options");
  opts.innerHTML = "";
  q.answer_options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option";
    btn.textContent = opt;
    btn.addEventListener("click", () => {
      opts.querySelectorAll(".option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      answers[qIndex] = { question_id: q.id, selected_answer: opt };
      const ok = opt === q.correct_answer;
      document.getElementById("quiz_feedback").textContent = ok
        ? `Correct. ${q.explanation}`
        : `Safest: ${q.correct_answer}. ${q.explanation}`;
      document.getElementById("quiz_next").hidden = false;
    });
    opts.appendChild(btn);
  });
}

async function startQuiz(type) {
  assessmentType = type;
  nickUserId();
  const data = await api(`/training/questions?assessment_type=${type}`);
  questions = (data.questions || []).slice(0, 10);
  answers = [];
  qIndex = 0;
  if (!questions.length) {
    showToast("No questions loaded");
    return;
  }
  showQuestion();
}

async function finishQuiz() {
  const nick = nickUserId();
  const result = await api("/training/attempts", {
    method: "POST",
    body: JSON.stringify({
      user_id: trainUserId,
      display_name: nick,
      assessment_type: assessmentType,
      answers: answers.filter(Boolean),
    }),
  });
  document.getElementById("quiz_card").hidden = true;
  showToast(`Score: ${result.score}% (${result.correct}/${result.total_questions})`);
  await loadRecommendations();
  await loadDashboard();
}

async function loadRecommendations() {
  if (!trainUserId) nickUserId();
  try {
    const data = await api(`/training/recommendations/${encodeURIComponent(trainUserId)}`);
    document.getElementById("recommendations").innerHTML = (data.recommendations || [])
      .map((r) => `<li><strong>${r.category.replace(/_/g, " ")}</strong>: ${r.reason}</li>`)
      .join("") || "<li>Complete a quiz for recommendations.</li>";
  } catch {
    document.getElementById("recommendations").innerHTML = "<li>Sign in to record scores.</li>";
  }
}

async function viewProgress() {
  nickUserId();
  const data = await api(`/training/results/${encodeURIComponent(trainUserId)}`);
  const el = document.getElementById("train_history");
  el.hidden = false;
  el.textContent = JSON.stringify(data.history, null, 2);
  await loadRecommendations();
}

function drawQr(text) {
  const canvas = document.getElementById("share_qr");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  const seed = text.length * 97;
  const cell = 12;
  for (let y = 0; y < canvas.height; y += cell) {
    for (let x = 0; x < canvas.width; x += cell) {
      if (((x + y + seed) * 17) % 29 < 11) {
        ctx.fillRect(x, y, cell - 1, cell - 1);
      }
    }
  }
}

async function openShare(warningId, title) {
  const data = await api(`/rep/warnings/${warningId}/share`, { method: "POST" });
  document.getElementById("share_text").textContent = data.share_text;
  drawQr(data.share_text);
  document.getElementById("share_dialog").showModal();
  await loadDashboard();
}

async function queueStkTip(warning) {
  const text = `Walɔ: ${warning.title}`;
  try {
    await api("/rep/stk-tips", {
      method: "POST",
      body: JSON.stringify({ text, more: true, report: true }),
    });
    showToast("STK tip queued for moderator approval");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function loadWarnings() {
  const data = await api("/warnings?status=published");
  const list = document.getElementById("warnings_list");
  const items = data.warnings || [];
  if (!items.length) {
    list.innerHTML = "<p class=\"fine-print\">No published warnings yet.</p>";
    return;
  }
  list.innerHTML = items.map((w) => `
    <article class="warning-item" data-id="${w.id}">
      <strong>${w.title}</strong>
      <p class="fine-print">${w.description || ""}</p>
      <div class="warning-actions">
        <button type="button" class="btn secondary share-btn" data-id="${w.id}" data-title="${encodeURIComponent(w.title)}">Share</button>
        <button type="button" class="btn ghost stk-btn" data-id="${w.id}" data-title="${encodeURIComponent(w.title)}">Push STK tip (needs approval)</button>
      </div>
    </article>`).join("");

  list.querySelectorAll(".share-btn").forEach((btn) => {
    btn.addEventListener("click", () => openShare(Number(btn.dataset.id), decodeURIComponent(btn.dataset.title)));
  });
  list.querySelectorAll(".stk-btn").forEach((btn) => {
    btn.addEventListener("click", () => queueStkTip({
      id: Number(btn.dataset.id),
      title: decodeURIComponent(btn.dataset.title),
    }));
  });
}

document.getElementById("login_rep").addEventListener("click", () => demoLogin().catch((e) => showToast(e.message, "error")));
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showPanel(btn.dataset.panel));
});
document.getElementById("refresh_dash").addEventListener("click", () => loadDashboard());
document.getElementById("assist_submit").addEventListener("click", () => submitAssisted());
document.getElementById("lookup_btn").addEventListener("click", () => runLookup());
document.getElementById("start_pre").addEventListener("click", () => startQuiz("pre").catch((e) => showToast(e.message, "error")));
document.getElementById("start_post").addEventListener("click", () => startQuiz("post").catch((e) => showToast(e.message, "error")));
document.getElementById("view_progress").addEventListener("click", () => viewProgress().catch((e) => showToast(e.message, "error")));
document.getElementById("quiz_next").addEventListener("click", () => {
  qIndex += 1;
  if (qIndex >= questions.length) {
    finishQuiz().catch((e) => showToast(e.message, "error"));
    return;
  }
  showQuestion();
});

document.getElementById("share_copy").addEventListener("click", async () => {
  const text = document.getElementById("share_text").textContent;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard");
  } catch {
    showToast("Could not copy — select text manually", "error");
  }
});

document.getElementById("share_sheet").addEventListener("click", async () => {
  const text = document.getElementById("share_text").textContent;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Walɔ warning", text });
    } catch {
      /* cancelled */
    }
  } else {
    showToast("Web Share not available — use Copy");
  }
});