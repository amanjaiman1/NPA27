import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "./memory-storage";
import { readKey, setActiveAccount, setStorageBackend } from "@/lib/account/scope";
import { normalizeSnapshot } from "@/lib/account/normalize";
import { useChronicle, blankChronicleState, readCloudSnapshot } from "@/lib/store";
import { THEME_MODES, isThemeMode, surfaceFor, themeHasOwnColours } from "@/lib/theme";

const store = () => useChronicle.getState();

beforeEach(() => {
  setStorageBackend(new MemoryStorage() as unknown as Storage);
  setActiveAccount(null);
  useChronicle.setState(blankChronicleState());
});

test("Blue Glass is a third theme beside Light and Dark, with Auto still choosing between those two", () => {
  assert.deepEqual(
    THEME_MODES.map((m) => m.label),
    ["Light", "Dark", "Blue Glass", "Auto"],
  );
  assert.equal(isThemeMode("blue"), true);
  assert.equal(isThemeMode("ocean"), false);
  // Its own surface, whatever the device prefers.
  assert.equal(surfaceFor("blue", true), "blue");
  assert.equal(surfaceFor("blue", false), "blue");
  // Auto never lands on Blue Glass.
  assert.equal(surfaceFor("system", true), "black");
  assert.equal(surfaceFor("system", false), "white");
  // It brings its own colours and sky; Light and Dark use the palette and wallpaper.
  assert.equal(themeHasOwnColours("blue"), true);
  for (const m of ["light", "dark", "system"] as const) assert.equal(themeHasOwnColours(m), false);
});

test("Blue Glass and Liquid Glass are separate choices that never change each other", () => {
  store().setThemeMode("blue");
  assert.equal(store().material, "standard", "Blue Glass doesn't switch Liquid Glass on");
  store().setMaterial("glass");
  assert.equal(store().themeMode, "blue", "Liquid Glass keeps the theme");
  store().setMaterial("standard");
  assert.equal(store().themeMode, "blue", "turning Liquid Glass off keeps Blue Glass");
  store().setMaterial("glass");
  store().setThemeMode("dark");
  assert.equal(store().material, "glass", "leaving Blue Glass keeps Liquid Glass");
  // Reduce transparency is independent of both.
  store().setThemeMode("blue");
  store().setReduceTransparency(true);
  assert.equal(store().themeMode, "blue");
  assert.equal(store().material, "glass");
});

test("Blue Glass follows the account: synced, painted before load, and cleared on sign-out", () => {
  setActiveAccount("account-a");
  store().setThemeMode("blue");
  // Synced with the account's data, like every other appearance choice.
  assert.equal(readCloudSnapshot().themeMode, "blue");
  // Remembered under this account's own key for the next cold start's first paint.
  assert.equal(readKey("upsc-chronicle-theme:account-a"), "blue");
  assert.equal(readKey("upsc-chronicle-theme:account-b"), null, "no other account's key is touched");

  // Another device's choice arrives through the cloud and is kept as it is.
  useChronicle.setState(blankChronicleState());
  store().applyCloudSnapshot({ themeMode: "blue", material: "glass" });
  assert.equal(store().themeMode, "blue");
  assert.equal(store().material, "glass");
  assert.equal(normalizeSnapshot({ themeMode: "blue" as const }).themeMode, "blue");

  // Signing out (or switching account) goes back to the default look.
  useChronicle.setState(blankChronicleState());
  assert.equal(store().themeMode, "light");
  assert.equal(store().material, "standard");
});

test("the palette and wallpaper chosen on Light or Dark survive a spell on Blue Glass", () => {
  store().setPalette("lagoon");
  store().setWallpaper("ocean");
  store().setThemeMode("blue");
  store().setThemeMode("light");
  assert.equal(store().palette, "lagoon");
  assert.equal(store().wallpaper, "ocean");
});
