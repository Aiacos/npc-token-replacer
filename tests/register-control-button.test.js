import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerControlButton } from "../scripts/main.js";
import { Logger } from "../scripts/lib/logger.js";

/**
 * registerControlButton Unit Tests
 *
 * Tests the Foundry v12 (array) and v13 (object) scene control button
 * registration paths, plus error handling for unexpected formats.
 */

describe("registerControlButton", () => {

  beforeEach(() => {
    vi.restoreAllMocks();
    game.i18n.localize = vi.fn((key) => key);
    game.user.isGM = true;
  });

  // ─── Foundry v13 format (object with controls.tokens.tools) ──────────────

  it("v13 format: adds npcReplacer to controls.tokens.tools", () => {
    const controls = {
      tokens: {
        tools: {}
      }
    };

    registerControlButton(controls);

    expect(controls.tokens.tools.npcReplacer).toBeDefined();
    expect(controls.tokens.tools.npcReplacer.name).toBe("npcReplacer");
    expect(controls.tokens.tools.npcReplacer.icon).toBe("fas fa-sync-alt");
    expect(controls.tokens.tools.npcReplacer.button).toBe(true);
  });

  it("v13 format without tools: does NOT crash and logs error", () => {
    const controls = {
      tokens: {}
      // no tools property
    };

    const errorSpy = vi.spyOn(Logger, "error");

    expect(() => registerControlButton(controls)).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("tools")
    );
  });

  // ─── Foundry v12 format (array with token entry) ────────────────────────

  it("v12 format: pushes tool to token controls tools array", () => {
    const controls = [
      {
        name: "token",
        tools: []
      }
    ];

    registerControlButton(controls);

    expect(controls[0].tools).toHaveLength(1);
    expect(controls[0].tools[0].name).toBe("npcReplacer");
    expect(controls[0].tools[0].icon).toBe("fas fa-sync-alt");
  });

  it("v12 format without token entry: logs error", () => {
    const controls = [
      {
        name: "walls",
        tools: []
      }
    ];

    const errorSpy = vi.spyOn(Logger, "error");

    registerControlButton(controls);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("token controls")
    );
  });

  // ─── Unknown format ─────────────────────────────────────────────────────

  it("unknown format: logs error for non-object non-array input", () => {
    const errorSpy = vi.spyOn(Logger, "error");

    registerControlButton("unexpected");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unrecognized")
    );
  });

});
