// Demo-control bridge: lets the separate demo-control page (a different tab,
// same browser origin) feed scenarios into this page's live flow without the
// two pages sharing any JS state. Uses BroadcastChannel, which only reaches
// other tabs on the *same origin* — see demo-control/README.md for how to
// serve both pages so this actually connects.
//
// This has nothing to do with the controller contract (CONTRACT.md): it is a
// browser-tab-to-browser-tab channel, not a network request. The controller
// never sees it.
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
        // Ignore: a demo bridge failure must never break the phone preview.
      }
    },
    close() {
      channel?.close();
    },
  };
}
