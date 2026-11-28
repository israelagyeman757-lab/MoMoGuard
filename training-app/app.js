import { controllerBase } from "../shared/controllerUrl.js";

const base = () => controllerBase().replace(/\/$/, "");

let questions = [];
let answers = [];
let index = 0;
let assessmentType = "pre";
let userId = "train-user-1";

async function api(path, opts = {}) {
  const res = await fetch(`${base()}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function userFromInput() {
  const name = document.getElementById("user_name").value.trim() || "Ama";
  userId = `user-${name.toLowerCase().replace(/\s+/g, "-")}`;
  return name;
}

function showQuestion() {
  const q = questions[index];
  document.getElementById("quiz_card").hidden = false;
  document.getElementById("progress").textContent = `Question ${index + 1} of ${questions.length}`;
  document.getElementById("question_text").textContent = q.question;
  document.getElementById("feedback").textContent = "";
  document.getElementById("next_q").hidden = true;
  const opts = document.getElementById("options");
  opts.innerHTML = "";
  q.answer_options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option";
    btn.textContent = opt;
    btn.addEventListener("click", () => {
      opts.querySelectorAll(".option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      answers[index] = { question_id: q.id, selected_answer: opt };
      const ok = opt === q.correct_answer;
      document.getElementById("feedback").textContent = ok
        ? `Correct. ${q.explanation}`
        : `Not quite. Safest: ${q.correct_answer}. ${q.explanation}`;
      document.getElementById("next_q").hidden = false;
    });
    opts.appendChild(btn);
  });
}

async function startQuiz(type) {
  assessmentType = type;
  userFromInput();
  const data = await api(`/training/questions?assessment_type=${type}`);
  questions = (data.questions || []).slice(0, 10);
  answers = [];
  index = 0;
  if (!questions.length) {
    alert("No questions loaded.");
    return;
  }
  showQuestion();
}

document.getElementById("start_pre").addEventListener("click", () => startQuiz("pre").catch(alert));
document.getElementById("start_post").addEventListener("click", () => startQuiz("post").catch(alert));

document.getElementById("next_q").addEventListener("click", async () => {
  index += 1;
  if (index >= questions.length) {
    const result = await api("/training/attempts", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        display_name: document.getElementById("user_name").value.trim(),
        assessment_type: assessmentType,
        answers: answers.filter(Boolean),
      }),
    });
    document.getElementById("quiz_card").hidden = true;
    alert(`Score: ${result.score}% (${result.correct}/${result.total_questions} correct)`);
    await loadRecommendations();
    return;
  }
  showQuestion();
});

async function loadRecommendations() {
  const data = await api(`/training/recommendations/${encodeURIComponent(userId)}`);
  document.getElementById("recommendations").innerHTML = (data.recommendations || [])
    .map((r) => `<li><strong>${r.category}</strong>: ${r.reason}</li>`)
    .join("") || "<li>Complete a quiz to get recommendations.</li>";
}

document.getElementById("view_history").addEventListener("click", async () => {
  userFromInput();
  const data = await api(`/training/results/${encodeURIComponent(userId)}`);
  document.getElementById("history").textContent = JSON.stringify(data, null, 2);
  await loadRecommendations();
});

loadRecommendations().catch(() => {});