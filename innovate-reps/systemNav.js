/** Bottom system bar: only Home is functional; Back and Recent apps are visual-only. */

export function handleSystemNav(action, { onHome } = {}) {
  if (action === "home" && typeof onHome === "function") {
    onHome();
    return true;
  }
  return false;
}