import { apiUrl, getToken, setToken } from "./config.js";

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), { ...opts, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function renderReports(reports) {
  const el = document.getElementById("reports_list");
  el.innerHTML = reports.map((r) => `
    <div class="report-card" data-id="${r.id}">
      <strong>#${r.id}</strong> ${r.phone_number || "(no number)"} · ${r.scam_type}
      <div>${r.description || ""}</div>
      <small>Status: ${r.status}</small>
      <input type="text" class="new-status" placeholder="CORROBORATED" aria-label="New status for report ${r.id}" />
      <button class="save-status">Update status</button>
    </div>`).join("");
  el.querySelectorAll(".save-status").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      const card = ev.target.closest(".report-card");
      const status = card.querySelector(".new-status").value.trim();
      if (!status) return;
      await api(`/reports/${card.dataset.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadReports();
    });
  });
}

async function loadReports() {
  const data = await api("/reports");
  renderReports(data.reports || []);
}

async function loadOverview() {
  document.getElementById("overview").textContent = JSON.stringify(
    await api("/moderator/overview"),
    null,
    2
  );
  document.getElementById("training_stats").textContent = JSON.stringify(
    (await api("/training/results/demo-user")).stats,
    null,
    2
  );
}

document.getElementById("login_mod").addEventListener("click", async () => {
  const data = await api("/auth/demo-login", { method: "POST", body: JSON.stringify({ role: "moderator" }) });
  setToken(data.token);
  document.getElementById("auth_token").value = data.token;
  document.getElementById("auth_status").textContent = `Signed in (${data.role})`;
});

document.getElementById("auth_token").addEventListener("change", (e) => setToken(e.target.value));

document.getElementById("load_overview").addEventListener("click", () => loadOverview().catch(alert));
document.getElementById("load_reports").addEventListener("click", () => loadReports().catch(alert));

document.getElementById("lookup_btn").addEventListener("click", async () => {
  const n = document.getElementById("lookup_number").value.trim();
  document.getElementById("lookup_out").textContent = JSON.stringify(
    await api(`/numbers/check/${encodeURIComponent(n)}`),
    null,
    2
  );
});

document.getElementById("create_warning").addEventListener("click", async () => {
  const title = document.getElementById("warn_title").value.trim();
  const description = document.getElementById("warn_body").value.trim();
  await api("/warnings", {
    method: "POST",
    body: JSON.stringify({ title, description, scam_type: "fake_mtn_rep", status: "draft" }),
  });
  await loadWarnings();
});

async function loadWarnings() {
  const data = await api("/warnings?status=all");
  const el = document.getElementById("warnings_list");
  el.innerHTML = (data.warnings || []).map((w) => `
    <div class="report-card" data-id="${w.id}">
      <strong>${w.title}</strong> (${w.status})
      <button class="publish">Publish</button>
    </div>`).join("");
  el.querySelectorAll(".publish").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      const id = ev.target.closest(".report-card").dataset.id;
      await api(`/warnings/${id}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) });
      await loadWarnings();
    });
  });
}

document.getElementById("load_warnings").addEventListener("click", () => loadWarnings().catch(alert));