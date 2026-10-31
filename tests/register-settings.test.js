import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerSettings, NPCTokenReplacerController } from "../scripts/main.js";

/**
 * registerSettings wiring: the GM's overrides must take effect without a
 * page reload (Constitution IX.6 — the GM can always override detection).
 */
describe("registerSettings", () => {
  let registered;

  beforeEach(() => {
    registered = new Map();
    game.settings.register = vi.fn((ns, key, config) => registered.set(key, config));
    game.settings.registerMenu = vi.fn();
    game.i18n.localize = vi.fn(key => key);
  });

  it("re-detects sources when additionalSources changes", () => {
    const clear = vi.spyOn(NPCTokenReplacerController, "clearCache").mockImplementation(() => {});
    registerSettings();

    registered.get("additionalSources").onChange?.("my-new-book");

    expect(clear).toHaveBeenCalledTimes(1);
    clear.mockRestore();
  });

  it("registers the compendium picker menu with a constructible form class", () => {
    registerSettings();

    const [, key, menu] = game.settings.registerMenu.mock.calls[0];
    expect(key).toBe("compendiumSelector");
    expect(typeof menu.type).toBe("function");
    expect(menu.restricted).toBe(true);
  });
});
