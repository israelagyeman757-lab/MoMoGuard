import { apiUrl, getToken, setToken } from "./config.js";

const REPORT_STATUSES = ["UNVERIFIED", "UNDER_REVIEW", "CORROBORATED", "DISPUTED", "ARCHIVED"];

const toastEl = document.getElementById("toast");
let toastTimer = null;

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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

function setLoading(id, on) {
  const el = document.getElementById(id);
  if (el) el.hidden = !on;
}

function showSection(name) {
  for (const tab of document.querySelectorAll(".nav-tab")) {
    tab.classList.toggle("is-active", tab.dataset.section === name);
  }
  for (const section of document.querySelectorAll(".section[data-section]")) {
    const active = section.dataset.section === name;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  }
}

function renderStatCards(overview) {
  const reports = overview.reports_by_status || {};
  const warnings = overview.warnings_by_status || {};
  const cards = [
    { label: "Reports (all)", value: Object.values(reports).reduce((a, b) => a + b, 0) },
    { label: "Under review", value: reports.UNDER_REVIEW || 0 },
    { label: "Corroborated", value: reports.CORROBORATED || 0 },
    { label: "Published warnings", value: warnings.published || 0 },
  ];
  document.getElementById("stat_cards").innerHTML = cards.map((c, i) => `
    <div class="stat-card" style="animation-delay:${i * 50}ms">
      <strong>${c.value}</strong>
      <span>${c.label}</span>
    </div>`).join("");
}

function renderTactics(overview) {
  const list = document.getElementById("top_tactics");
  const items = overview.top_tactics || [];
  if (!items.length) {
    list.innerHTML = "<li>No tactic clusters yet.</li>";
    return;
  }
  list.innerHTML = items.map(t => `<li><strong>${t.scam_type.replace(/_/g, " ")}</strong> — ${t.count} report(s)</li>`).join("");
}

function statusChip(status) {
  const cls = status.toLowerCase().replace(/_/g, "-");
  return `<span class="chip chip-${status}">${status.replace(/_/g, " ")}</span>`;
}

function renderReports(reports) {
  const body = document.getElementById("reports_body");
  const empty = document.getElementById("reports_empty");
  if (!reports.length) {
    body.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  body.innerHTML = reports.map(r => `
    <tr data-id="${r.id}">
      <td>#${r.id}</td>
      <td>${r.phone_number || "—"}</td>
      <td>${(r.scam_type || "").replace(/_/g, " ")}</td>
      <td>${statusChip(r.status)}</td>
      <td>${(r.description || "").slice(0, 120)}${(r.description || "").length > 120 ? "…" : ""}</td>
      <td>
        <div class="row-actions">
          <select aria-label="New status for report ${r.id}" data-id="${r.id}">
            ${REPORT_STATUSES.map(s => `<option value="${s}" ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
          <button type="button" class="btn ghost save-status" data-id="${r.id}">Save</button>
        </div>
      </td>
    </tr>`).join("");

  body.querySelectorAll(".save-status").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const select = body.querySelector(`select[data-id="${id}"]`);
      const status = select.value;
      btn.disabled = true;
      try {
        await api(`/reports/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        showToast(`Report #${id} → ${status}`);
        await loadReports();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function riskClass(result) {
  if (result === "WARNING_AVAILABLE" || result === "MULTIPLE_REPORTS") return "is-high";
  if (result === "UNDER_REVIEW") return "is-watch";
  return "is-clear";
}

function renderLookup(data) {
  const card = document.getElementById("lookup_card");
  const badge = document.getElementById("lookup_badge");
  const msg = document.getElementById("lookup_message");
  const disc = document.getElementById("lookup_disclaimer");
  card.hidden = false;
  badge.textContent = data.result || "—";
  badge.className = `risk-badge ${riskClass(data.result)}`;
  msg.textContent = data.message || "";
  disc.textContent = data.disclaimer || "No reports found does not mean safe.";
}

function renderWarnings(warnings) {
  const el = document.getElementById("warnings_list");
  if (!warnings.length) {
    el.innerHTML = '<p class="empty">No warnings in the database.</p>';
    return;
  }
  el.innerHTML = warnings.map(w => `
    <div class="warning-card" data-id="${w.id}">
      <div>
        <strong>${w.title}</strong>
        <p class="fine-print">${w.description || ""}</p>
        ${statusChip(w.status)}
      </div>
      <div class="row-actions">
        ${w.status === "draft" ? `<button type="button" class="btn primary publish-warning" data-id="${w.id}">Publish</button>` : ""}
        ${w.status === "published" ? `<button type="button" class="btn ghost archive-warning" data-id="${w.id}">Archive</button>` : ""}
      </div>
    </div>`).join("");

  el.querySelectorAll(".publish-warning").forEach(btn => {
    btn.addEventListener("click", async () => {
      await api(`/warnings/${btn.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "published" }),
      });
      showToast("Warning published to users");
      await loadWarnings();
    });
  });
  el.querySelectorAll(".archive-warning").forEach(btn => {
    btn.addEventListener("click", async () => {
      await api(`/warnings/${btn.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "archived" }),
      });
      showToast("Warning archived");
      await loadWarnings();
    });
  });
}

function renderTrainingChart(stats) {
  const chart = document.getElementById("training_chart");
  const byType = stats.by_assessment_type || stats.by_assessment || stats.by_type || {};
  const entries = Object.entries(byType);
  if (!entries.length) {
    chart.innerHTML = '<p class="empty">No quiz attempts recorded yet.</p>';
    return;
  }
  const max = Math.max(...entries.map(([, v]) => v.avg_score || v.avg || 0), 1);
  chart.innerHTML = entries.map(([type, v]) => {
    const score = v.avg_score ?? v.avg ?? 0;
    const height = Math.round((score / 100) * 120);
    return `<div class="chart-bar"><div class="bar" style="height:${height}px"></div><span>${type}</span><strong>${score}%</strong></div>`;
  }).join("");

  const dl = document.getElementById("training_stats");
  const training = stats;
  dl.innerHTML = `
    <div><dt>Users with pre + post</dt><dd>${training.users_with_both ?? training.users_completed_both ?? "—"}</dd></div>
    <div><dt>Avg improvement</dt><dd>${training.average_improvement_pp != null ? `${training.average_improvement_pp} pts` : "—"}</dd></div>
    <div><dt>Most missed</dt><dd>${Array.isArray(training.most_missed_categories) && training.most_missed_categories.length
      ? training.most_missed_categories.map(c => `${c.category} (${c.misses})`).join(", ")
      : "—"}</dd></div>
  `;
}

async function loadOverview() {
  setLoading("overview_loading", true);
  try {
    const overview = await api("/moderator/overview");
    renderStatCards(overview);
    renderTactics(overview);
    renderTrainingChart(overview.training || {});
  } finally {
    setLoading("overview_loading", false);
  }
}

async function loadReports() {
  setLoading("reports_loading", true);
  try {
    const data = await api("/reports");
    renderReports(data.reports || []);
  } finally {
    setLoading("reports_loading", false);
  }
}

async function loadWarnings() {
  const data = await api("/warnings?status=all");
  renderWarnings(data.warnings || []);
}

async function ensureDemoLogin(silent = false) {
  try {
    const data = await api("/auth/demo-login", {
      method: "POST",
      body: JSON.stringify({ role: "moderator" }),
    });
    setToken(data.token);
    document.getElementById("auth_token").value = data.token;
    document.getElementById("auth_status").textContent = "Signed in (demo moderator)";
    if (!silent) showToast("Demo moderator session ready");
    return true;
  } catch (err) {
    document.getElementById("auth_status").textContent = "Offline";
    if (!silent) showToast(err.message, "error");
    return false;
  }
}

document.querySelectorAll(".nav-tab").forEach(tab => {
  tab.addEventListener("click", () => showSection(tab.dataset.section));
});

document.getElementById("login_mod").addEventListener("click", () => {
  ensureDemoLogin().then(ok => {
    if (ok) {
      loadOverview();
      loadReports();
      loadWarnings();
    }
  });
});

document.getElementById("load_overview").addEventListener("click", () => loadOverview().catch(e => showToast(e.message, "error")));
document.getElementById("load_reports").addEventListener("click", () => loadReports().catch(e => showToast(e.message, "error")));
document.getElementById("load_warnings").addEventListener("click", () => loadWarnings().catch(e => showToast(e.message, "error")));

document.getElementById("lookup_btn").addEventListener("click", async () => {
  const n = document.getElementById("lookup_number").value.trim();
  if (!n) {
    showToast("Enter a phone number");
    return;
  }
  try {
    renderLookup(await api(`/numbers/check/${encodeURIComponent(n)}`));
  } catch (err) {
    showToast(err.message, "error");
  }
});

document.getElementById("create_warning").addEventListener("click", async () => {
  const title = document.getElementById("warn_title").value.trim();
  const description = document.getElementById("warn_body").value.trim();
  if (!title) {
    showToast("Title required");
    return;
  }
  try {
    await api("/warnings", {
      method: "POST",
      body: JSON.stringify({
        title,
        description,
        scam_type: "fake_mtn_rep",
        status: "draft",
      }),
    });
    document.getElementById("warn_title").value = "";
    document.getElementById("warn_body").value = "";
    showToast("Draft saved");
    await loadWarnings();
    await loadOverview();
  } catch (err) {
    showToast(err.message, "error");
  }
});

document.getElementById("stk_push_btn").addEventListener("click", async () => {
  const text = document.getElementById("stk_text").value.trim();
  try {
    await api("/stk/push", {
      method: "POST",
      body: JSON.stringify({
        text,
        more: document.getElementById("stk_more").checked,
        report: document.getElementById("stk_report").checked,
      }),
    });
    showToast("STK alert queued — open the feature phone on idle to see it");
  } catch (err) {
    showToast(err.message, "error");
  }
});

ensureDemoLogin(true).then(ok => {
  if (ok) {
    loadOverview();
    loadReports();
    loadWarnings();
  }
});