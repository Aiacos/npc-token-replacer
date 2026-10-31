import { describe, it, expect, beforeEach, vi } from "vitest";
import { StartupNotices } from "../scripts/lib/startup-notices.js";
import { CODE_VERSION } from "../scripts/lib/version.js";

/**
 * After an update the browser can keep running cached module files while
 * module.json is already new: the module half-works on old code. The GM is
 * told to hard-reload instead.
 */
describe("StartupNotices.checkLoadedCodeVersion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    game.user.isGM = true;
    ui.notifications.warn = vi.fn();
  });

  it("stays silent when the running code matches the installed manifest", () => {
    game.modules.get = vi.fn(() => ({ version: CODE_VERSION }));

    expect(StartupNotices.checkLoadedCodeVersion()).toBe(true);
    expect(ui.notifications.warn).not.toHaveBeenCalled();
  });

  it("tells the GM to hard-reload when the browser runs older cached code", () => {
    game.modules.get = vi.fn(() => ({ version: "9.9.9" }));

    expect(StartupNotices.checkLoadedCodeVersion()).toBe(false);
    expect(ui.notifications.warn).toHaveBeenCalledWith("NPC_REPLACER.StaleCode", {
      localize: true,
      format: { installed: "9.9.9", running: CODE_VERSION },
      permanent: true
    });
  });

  it("does not bother players", () => {
    game.user.isGM = false;
    game.modules.get = vi.fn(() => ({ version: "9.9.9" }));

    StartupNotices.checkLoadedCodeVersion();

    expect(ui.notifications.warn).not.toHaveBeenCalled();
  });
});
