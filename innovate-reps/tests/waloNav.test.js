import test from "node:test";
import assert from "node:assert/strict";
import { WaloNav, WALO_VIEWS, WALO_LAUNCH_MS } from "../waloNav.js";

test("Walo opens from dock via launching then open menu", () => {
  const nav = new WaloNav();
  assert.equal(nav.phase, "closed");
  const token = nav.openFromDock();
  assert.equal(nav.isLaunching(), true);
  assert.equal(nav.view, "menu");
  assert.equal(nav.finishLaunch(token), true);
  assert.equal(nav.isOpen(), true);
});

test("stale launch tokens are ignored", () => {
  const nav = new WaloNav();
  const first = nav.openFromDock();
  const second = nav.openFromDock();
  assert.equal(nav.finishLaunch(first), false);
  assert.equal(nav.isLaunching(), true);
  assert.equal(nav.finishLaunch(second), true);
});

test("menu actions open report, lookup, and profile views", () => {
  const nav = new WaloNav();
  nav.openFromDock();
  nav.finishLaunch(nav._launchToken);
  for (const view of ["report", "lookup", "profile"]) {
    assert.equal(nav.openView(view), true);
    assert.equal(nav.view, view);
    assert.equal(nav.backToMenu(), true);
    assert.equal(nav.view, "menu");
  }
});

test("invalid views are rejected", () => {
  const nav = new WaloNav();
  nav.openFromDock();
  nav.finishLaunch(nav._launchToken);
  assert.equal(nav.openView("settings"), false);
  assert.equal(nav.view, "menu");
});

test("close resets to closed", () => {
  const nav = new WaloNav();
  nav.openFromDock();
  nav.finishLaunch(nav._launchToken);
  nav.openView("report");
  nav.close();
  assert.equal(nav.phase, "closed");
  assert.equal(nav.view, "menu");
});

test("WALO_VIEWS lists menu plus three actions", () => {
  assert.deepEqual(WALO_VIEWS, ["menu", "report", "lookup", "profile"]);
});

test("launch duration is a short animation window", () => {
  assert.ok(WALO_LAUNCH_MS >= 200 && WALO_LAUNCH_MS <= 800);
});