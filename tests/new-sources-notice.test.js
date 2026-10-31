import { describe, it, expect, beforeEach, vi } from "vitest";
import { CompendiumManager, NPCTokenReplacerController } from "../scripts/main.js";

/**
 * A book released after this version is detected from its signals but not used
 * by default. The GM is told once per book, so they can enable it themselves.
 */

const actorPack = (packageName, name = "monsters") => ({
  documentName: "Actor",
  collection: `${packageName}.${name}`,
  metadata: { packageName, packageType: "module", label: name },
  getIndex: vi.fn().mockResolvedValue(),
  index: { contents: [], size: 0 }
});

const MODULES = {
  "dnd-future-book": { id: "dnd-future-book", title: "Future Book", authors: [{ name: "Wizards of the Coast" }], packs: [] },
  "dnd-verified-book": {
    id: "dnd-verified-book", title: "Verified Book", authors: [{ name: "Wizards of the Coast" }],
    protected: true, relationships: { systems: [{ id: "dnd5e" }] }, packs: []
  },
  "dnd-other-book": { id: "dnd-other-book", title: "Other <b>Book</b>", authors: [{ name: "Foundry Gaming" }], packs: [] },
  "dnd-monster-manual": { id: "dnd-monster-manual", title: "Monster Manual", authors: [{ name: "Wizards of the Coast" }], packs: [] }
};

let packs;
let settings;

function useSettings(values) {
  settings = { enabledCompendiums: '["default"]', notifiedSources: "[]", additionalSources: "", ...values };
  game.settings.get = vi.fn((ns, key) => {
    if (settings[key] instanceof Error) throw settings[key];
    return settings[key];
  });
  game.settings.set = vi.fn((ns, key, value) => { settings[key] = value; return Promise.resolve(value); });
}

describe("NPCTokenReplacerController.notifyNewOfficialSources", () => {

  beforeEach(() => {
    vi.restoreAllMocks();
    CompendiumManager.clearCache();
    packs = [actorPack("dnd-monster-manual"), actorPack("dnd-future-book")];
    game.packs.filter = vi.fn(pred => packs.filter(pred));
    game.modules.get = vi.fn(id => MODULES[id]);
    // The test harness defaults to "test-system"; premium signals are system-specific
    game.system = { id: "dnd5e" };
    game.user.isGM = true;
    ui.notifications.info = vi.fn();
    useSettings({});
  });

  it("tells the GM once about an official-looking book that is not in use", async () => {
    await NPCTokenReplacerController.notifyNewOfficialSources();

    expect(ui.notifications.info).toHaveBeenCalledTimes(1);
    expect(ui.notifications.info).toHaveBeenCalledWith("NPC_REPLACER.NewOfficialSources", {
      localize: true,
      format: { names: "Future Book" },
      // Module titles come from third-party manifests: let Foundry escape them
      escape: true,
      permanent: true
    });
    expect(JSON.parse(settings.notifiedSources)).toEqual(["dnd-future-book"]);
  });

  it("does not repeat the notice on the next load", async () => {
    await NPCTokenReplacerController.notifyNewOfficialSources();
    CompendiumManager.clearCache();
    await NPCTokenReplacerController.notifyNewOfficialSources();

    expect(ui.notifications.info).toHaveBeenCalledTimes(1);
  });

  it("names every new book once, even when a book ships several packs", async () => {
    packs.push(actorPack("dnd-future-book", "npcs"), actorPack("dnd-other-book"));

    await NPCTokenReplacerController.notifyNewOfficialSources();

    expect(ui.notifications.info.mock.calls[0][1].format.names).toBe("Future Book, Other <b>Book</b>");
    expect(JSON.parse(settings.notifiedSources)).toEqual(["dnd-future-book", "dnd-other-book"]);
  });

  it("stays silent about books that are already whitelisted", async () => {
    packs = [actorPack("dnd-monster-manual")];

    await NPCTokenReplacerController.notifyNewOfficialSources();

    expect(ui.notifications.info).not.toHaveBeenCalled();
  });

  it("stays silent when the book is already in use", async () => {
    useSettings({ enabledCompendiums: '["all"]' });

    await NPCTokenReplacerController.notifyNewOfficialSources();

    expect(ui.notifications.info).not.toHaveBeenCalled();
  });

  // Detected from both signals: used right away, and the GM is told it happened
  it("announces a verified new book as already enabled, once", async () => {
    packs = [actorPack("dnd-monster-manual"), actorPack("dnd-verified-book")];

    await NPCTokenReplacerController.notifyNewOfficialSources();
    CompendiumManager.clearCache();
    await NPCTokenReplacerController.notifyNewOfficialSources();

    expect(ui.notifications.info).toHaveBeenCalledTimes(1);
    expect(ui.notifications.info.mock.calls[0][0]).toBe("NPC_REPLACER.NewOfficialSourcesEnabled");
    expect(ui.notifications.info.mock.calls[0][1].format.names).toBe("Verified Book");
  });

  it("does not claim a verified book is in use when the GM's mode excludes it", async () => {
    packs = [actorPack("dnd-monster-manual"), actorPack("dnd-verified-book")];
    useSettings({ enabledCompendiums: '["dnd-monster-manual.monsters"]' });

    await NPCTokenReplacerController.notifyNewOfficialSources();

    expect(ui.notifications.info).toHaveBeenCalledTimes(1);
    expect(ui.notifications.info.mock.calls[0][0]).toBe("NPC_REPLACER.NewOfficialSources");
  });

  it("uses a verified new book in the default mode", () => {
    packs = [actorPack("dnd-monster-manual"), actorPack("dnd-verified-book")];

    const used = CompendiumManager.getEnabledCompendiums().map(p => p.collection);

    expect(used).toContain("dnd-verified-book.monsters");
  });

  it("only notifies GMs", async () => {
    game.user.isGM = false;

    await NPCTokenReplacerController.notifyNewOfficialSources();

    expect(ui.notifications.info).not.toHaveBeenCalled();
    expect(game.settings.set).not.toHaveBeenCalled();
  });

  // Unreadable state could mean a notice on every page load; stay quiet instead
  it("stays silent when the list of notified books cannot be read", async () => {
    useSettings({ notifiedSources: new Error("not registered") });

    await NPCTokenReplacerController.notifyNewOfficialSources();

    expect(ui.notifications.info).not.toHaveBeenCalled();
  });

  it("still shows the notice when remembering it fails", async () => {
    game.settings.set = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(NPCTokenReplacerController.notifyNewOfficialSources()).resolves.toBeUndefined();

    expect(ui.notifications.info).toHaveBeenCalledTimes(1);
  });
});
