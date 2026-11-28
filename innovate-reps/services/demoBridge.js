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
        // Demo bridge failures must not break the smartphone preview.
      }
    },
    close() {
      channel?.close();
    },
  };
}