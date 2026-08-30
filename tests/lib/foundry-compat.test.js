import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FoundryCompat } from "../../scripts/lib/foundry-compat.js";

/**
 * FoundryCompat Unit Tests
 *
 * The point of this layer is that behaviour is chosen by API *shape*, never by
 * version number, so each test asserts which path runs given which APIs exist.
 */

let originalFoundry;
let originalDialog;

beforeEach(() => {
  originalFoundry = globalThis.foundry;
  originalDialog = globalThis.Dialog;
});

afterEach(() => {
  globalThis.foundry = originalFoundry;
  globalThis.Dialog = originalDialog;
  vi.restoreAllMocks();
});

describe("FoundryCompat", () => {

  describe("generation", () => {

    it("reads the release generation when Foundry exposes it", () => {
      globalThis.game.release = { generation: 14 };
      expect(FoundryCompat.generation).toBe(14);
      delete globalThis.game.release;
    });

    it("falls back to parsing game.version", () => {
      delete globalThis.game.release;
      globalThis.game.version = "13.346";
      expect(FoundryCompat.generation).toBe(13);
    });

    it("returns 0 rather than NaN when the version is unreadable", () => {
      delete globalThis.game.release;
      globalThis.game.version = "not-a-version";
      expect(FoundryCompat.generation).toBe(0);
    });

  });

  describe("API resolution", () => {

    it("prefers the namespaced Dialog over the deprecated global", () => {
      const namespaced = class NamespacedDialog {};
      globalThis.foundry = { appv1: { api: { Dialog: namespaced } } };
      globalThis.Dialog = class GlobalDialog {};
      expect(FoundryCompat.LegacyDialog).toBe(namespaced);
    });

    it("falls back to the global when no namespace exists (v12)", () => {
      globalThis.foundry = {};
      const global = class GlobalDialog {};
      globalThis.Dialog = global;
      expect(FoundryCompat.LegacyDialog).toBe(global);
    });

    it("reports ApplicationV2 support only when the mixin is present too", () => {
      globalThis.foundry = { applications: { api: { ApplicationV2: class {} } } };
      expect(FoundryCompat.supportsApplicationV2).toBe(false);

      globalThis.foundry = {
        applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: () => class {} } }
      };
      expect(FoundryCompat.supportsApplicationV2).toBe(true);
    });

  });

  describe("toElement", () => {

    it("passes an HTMLElement through unchanged", () => {
      const element = document.createElement("div");
      expect(FoundryCompat.toElement(element)).toBe(element);
    });

    it("unwraps a jQuery-like array (v12)", () => {
      const element = document.createElement("div");
      expect(FoundryCompat.toElement([element])).toBe(element);
    });

    it("returns null for nothing", () => {
      expect(FoundryCompat.toElement(null)).toBeNull();
    });

  });

  describe("confirmDialog on the DialogV2 path", () => {

    let waitConfig;

    beforeEach(() => {
      globalThis.foundry = {
        applications: {
          api: {
            DialogV2: {
              wait: config => {
                waitConfig = config;
                return Promise.resolve(true);
              }
            }
          }
        }
      };
    });

    it("resolves true when the yes button submits", async () => {
      const { answer } = FoundryCompat.confirmDialog({
        title: "T", content: "<p></p>", yesLabel: "Yes", noLabel: "No"
      });
      await expect(answer).resolves.toBe(true);
      expect(waitConfig.window.title).toBe("T");
      expect(waitConfig.rejectClose).toBe(false);
      expect(waitConfig.buttons.map(button => button.action)).toEqual(["yes", "no"]);
    });

    it("marks the yes button disabled when there is nothing to confirm", async () => {
      const { answer } = FoundryCompat.confirmDialog({
        title: "T", content: "", yesLabel: "Yes", noLabel: "No", yesDisabled: true
      });
      await answer;
      expect(waitConfig.buttons[0].disabled).toBe(true);
      expect(waitConfig.buttons[1].default).toBe(true);
    });

    it("treats a dismissed dialog (null) as a refusal", async () => {
      globalThis.foundry.applications.api.DialogV2.wait = () => Promise.resolve(null);
      const { answer } = FoundryCompat.confirmDialog({ title: "T", content: "", yesLabel: "Y", noLabel: "N" });
      await expect(answer).resolves.toBe(false);
    });

  });

  describe("confirmDialog on the legacy Dialog path", () => {

    let captured;

    beforeEach(() => {
      globalThis.foundry = {};
      captured = null;
      globalThis.Dialog = function (options) {
        captured = options;
        this.render = vi.fn();
        this.close = vi.fn();
      };
    });

    it("resolves true from the yes callback", async () => {
      const { answer } = FoundryCompat.confirmDialog({ title: "T", content: "", yesLabel: "Y", noLabel: "N" });
      captured.buttons.yes.callback();
      await expect(answer).resolves.toBe(true);
    });

    it("resolves false when the dialog is closed", async () => {
      const { answer } = FoundryCompat.confirmDialog({ title: "T", content: "", yesLabel: "Y", noLabel: "N" });
      captured.close();
      await expect(answer).resolves.toBe(false);
    });

    it("disables the yes button through the render callback", async () => {
      const { answer } = FoundryCompat.confirmDialog({
        title: "T", content: "", yesLabel: "Y", noLabel: "N", yesDisabled: true
      });

      const container = document.createElement("div");
      const button = document.createElement("button");
      button.classList.add("yes");
      container.appendChild(button);
      captured.render(container);

      expect(button.disabled).toBe(true);
      captured.close();
      await answer;
    });

    it("exposes a close handle that dismisses the dialog", async () => {
      const { answer, close } = FoundryCompat.confirmDialog({ title: "T", content: "", yesLabel: "Y", noLabel: "N" });
      expect(() => close()).not.toThrow();
      captured.close();
      await answer;
    });

  });

  it("refuses safely when no dialog API exists at all", async () => {
    globalThis.foundry = {};
    globalThis.Dialog = undefined;
    const { answer, close } = FoundryCompat.confirmDialog({ title: "T", content: "", yesLabel: "Y", noLabel: "N" });
    await expect(answer).resolves.toBe(false);
    expect(() => close()).not.toThrow();
  });

});
