// Demo-control bridge: the control-panel half of the same BroadcastChannel
// contract used by phone-page/services/demoBridge.js (kept as a standalone
// copy here so this folder works on its own). Both pages must be served
// from the SAME origin for this to connect — see README.md.
//
// Message shapes carried on this channel:
//   { type: "incoming-sms", requestId, sender, text, trust }
//   { type: "incoming-call", requestId, name, number, trust, note, amount }
//   { type: "ack", requestId, status: "delivered"|"ringing"|"busy"|"rejected", reason? }

export const DEMO_CHANNEL_NAME = "momoguard-demo";

export function createDemoBridge(channelName = DEMO_CHANNEL_NAME) {
  let channel = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(channelName);
    }
  } catch {
    channel = null;
  }

  return {
    available: Boolean(channel),
    onMessage(handler) {
      if (!channel) return;
      channel.addEventListener("message", event => handler(event.data));
    },
    postMessage(data) {
      if (!channel) return;
      try {
        channel.postMessage(data);
      } catch {
        // Ignore: a demo bridge failure must never break the control page.
      }
    },
    close() {
      channel?.close();
    },
  };
}
