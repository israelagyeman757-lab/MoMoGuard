import { SIMULATED_CONTACTS } from "./contacts.js";
import { createDemoBridge } from "./demoBridge.js";
import { fetchCommunityIntelligence } from "./services/communityAdapter.js";

const bridge = createDemoBridge();
const pending = new Map();

const senderInput = document.querySelector("#sms_sender");
const textInput = document.querySelector("#sms_text");
const sendButton = document.querySelector("#sms_send");
const clearButton = document.querySelector("#sms_clear");
const contactsList = document.querySelector("#contacts_list");
const logList = document.querySelector("#activity_log");
const bridgeStatus = document.querySelector("#bridge_status");

function timeLabel() {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .format(new Date());
}

function log(text, kind = "info") {
  const entry = document.createElement("li");
  entry.className = `log-entry log-${kind}`;
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = timeLabel();
  const body = document.createElement("span");
  body.className = "log-text";
  body.textContent = text;
  entry.append(time, body);
  logList.prepend(entry);
  while (logList.children.length > 40) logList.lastChild.remove();
}

function newRequestId() {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sendEvent(event, description) {
  const requestId = newRequestId();
  log(description, "out");
  bridge.postMessage({ ...event, requestId, ts: new Date().toISOString() });
  pending.set(requestId, setTimeout(() => {
    if (pending.delete(requestId)) {
      log("No response from the phone preview. Is phone-page/index.html open, on the same origin?", "warn");
    }
  }, 4000));
}

const ACK_MESSAGES = {
  delivered: ["Phone: message delivered to the inbox.", "ack"],
  ringing: ["Phone: call is ringing on the open phone.", "ack"],
  busy: ["Phone: busy \u2014 press End on the phone, then try again.", "warn"],
};

bridge.onMessage(data => {
  if (!data || data.type !== "ack") return;
  const timer = pending.get(data.requestId);
  if (timer !== undefined) {
    clearTimeout(timer);
    pending.delete(data.requestId);
  }
  if (data.status === "rejected" && data.reason === "mock_mode") {
    log('Phone: running in mock mode \u2014 set MODE to "controller" in phone-page/config.js to try a call.', "warn");
    return;
  }
  const [text, kind] = ACK_MESSAGES[data.status] || [`Phone: ${data.status}.`, "warn"];
  log(text, kind);
});

function currentSmsPayload() {
  const sender = senderInput.value.trim();
  const text = textInput.value.trim();
  return { sender: sender || "UNKNOWN NUMBER", text };
}

function sendSms() {
  const { sender, text } = currentSmsPayload();
  if (!text) {
    textInput.focus();
    log("Type a message before sending.", "warn");
    return;
  }
  sendEvent(
    { type: "incoming-sms", sender, text, trust: "custom" },
    `Sending SMS as ${sender}: \u201C${text}\u201D`,
  );
}

sendButton.addEventListener("click", sendSms);
clearButton.addEventListener("click", () => {
  senderInput.value = "";
  textInput.value = "";
  textInput.focus();
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function contactCard(contact) {
  const trustBadge = contact.trust === "trusted" ? "Saved \u00b7 trusted" : "Not saved \u00b7 suspicious";
  const contactedLine = contact.savedContact
    ? `Saved contact \u00b7 contacted ${contact.timesContactedBefore} times before (${contact.lastContact})`
    : "Not in contacts \u00b7 never contacted before";
  const intelLine = contact.communityIntel?.message
    ? `<p class="contact-intel">Community intel: ${escapeHtml(contact.communityIntel.message)}</p>`
    : `<p class="contact-intel" data-intel-for="${escapeHtml(contact.number)}">Community intel: loading…</p>`;
  return `<li class="contact-card trust-${contact.trust}" data-id="${contact.id}">
    <div class="contact-head">
      <strong>${escapeHtml(contact.name)}</strong>
      <span class="trust-badge trust-badge-${contact.trust}">${trustBadge}</span>
    </div>
    <div class="contact-number">${escapeHtml(contact.number)}</div>
    <p class="contact-note">${escapeHtml(contact.note)}</p>
    ${intelLine}
    <div class="contact-meta">${escapeHtml(contactedLine)}</div>
    <div class="contact-actions">
      <button type="button" data-action="use-message" data-id="${contact.id}">Use this message \u2192</button>
      <button type="button" data-action="simulate-call" data-id="${contact.id}">Simulate incoming call</button>
    </div>
  </li>`;
}

contactsList.innerHTML = SIMULATED_CONTACTS.map(contactCard).join("");

contactsList.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const contact = SIMULATED_CONTACTS.find(candidate => candidate.id === button.dataset.id);
  if (!contact) return;

  if (button.dataset.action === "use-message") {
    senderInput.value = contact.number;
    textInput.value = contact.smsTemplate;
    textInput.focus();
    document.querySelector("#compose").scrollIntoView({ behavior: "smooth", block: "center" });
    log(`Loaded ${contact.name}'s message into the composer \u2014 edit it, then press "Send to phone".`, "info");
    return;
  }

  if (button.dataset.action === "simulate-call") {
    const intel = contact.communityIntel;
    const intelNote = intel?.message ? ` Community intel: ${intel.message}` : "";
    sendEvent(
      {
        type: "incoming-call",
        name: contact.name,
        number: contact.call.recipient,
        trust: contact.trust,
        note: contact.note + intelNote,
        amount: contact.call.amount,
        community_report_state: intel?.report_state,
      },
      `Simulating a call from ${contact.name} (${contact.number}), who ${contact.call.ask}.${intelNote}`,
    );
  }
});

async function hydrateCommunityIntel() {
  await Promise.all(SIMULATED_CONTACTS.map(async contact => {
    const intel = await fetchCommunityIntelligence(contact.number);
    contact.communityIntel = intel;
    const target = contactsList.querySelector(`[data-intel-for="${contact.number}"]`);
    if (target && intel?.message) {
      target.textContent = `Community intel: ${intel.message}`;
    } else if (target) {
      target.textContent = "Community intel: unavailable (is the controller running?)";
    }
  }));
}

hydrateCommunityIntel();

bridgeStatus.textContent = bridge.available
  ? "Live bridge ready. Open the feature-phone preview in another tab on this same address to connect it."
  : "This browser does not support live phone updates (BroadcastChannel unavailable). Open the phone preview and try a modern browser.";
bridgeStatus.classList.toggle("is-unavailable", !bridge.available);

log("Demo control ready. SMS is inbox-only; simulated calls use the controller's real /ussd and /assess endpoints.", "info");
