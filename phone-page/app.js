import { controllerBase } from "../shared/controllerUrl.js";

const sessionId = `ussd-${Date.now().toString(36)}`;
const sender = "0240000001";
let pending = "";

const textEl = document.getElementById("ussd_text");
const entryEl = document.getElementById("entry");

function base() {
  return controllerBase().replace(/\/$/, "");
}

async function ussd(key = "") {
  const res = await fetch(`${base()}/ussd`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, sender, key }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  textEl.textContent = data.text || "";
  pending = "";
  entryEl.value = "";
}

document.querySelectorAll(".keys button").forEach((btn) => {
  btn.addEventListener("click", () => {
    pending += btn.dataset.key;
    entryEl.value = pending;
  });
});

document.getElementById("send_key").addEventListener("click", () => {
  const val = entryEl.value.trim() || pending;
  ussd(val).catch((err) => { textEl.textContent = `Error: ${err.message}`; });
});

document.getElementById("start_session").addEventListener("click", () => ussd("start").catch(alert));
document.getElementById("end_session").addEventListener("click", () => ussd("5").catch(alert));

entryEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("send_key").click();
});

document.getElementById("start_session").click();