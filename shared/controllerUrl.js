/** Local dev targets uvicorn on :8000; Vercel frontends use same-origin /api. */
export function resolveControllerUrl(defaultDev = "http://127.0.0.1:8000") {
  if (typeof window === "undefined") {
    return defaultDev;
  }
  const { hostname, protocol } = window.location;
  if (protocol === "file:" || hostname === "127.0.0.1" || hostname === "localhost") {
    return defaultDev;
  }
  return "/api";
}