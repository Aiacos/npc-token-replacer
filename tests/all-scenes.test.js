import { describe, it, expect, beforeEach, vi } from "vitest";
import { PreviewDialog } from "../scripts/lib/preview-dialog.js";
import { TokenReplacer, NPCTokenReplacerController } from "../scripts/main.js";
import { CompendiumManager } from "../scripts/lib/compendium-manager.js";
import { FoundryCompat } from "../scripts/lib/foundry-compat.js";

/**
 * Without a selection the button replaces NPC tokens on every scene of the
 * world, each on its own scene; a selection still narrows it to those tokens.
 */

const npc = (id, name, scene) => ({
  id, name, parent: scene, uuid: `Scene.${scene.id}.Token.${id}`,
  actorId: `actor-${name}`, actor: { name, type: "npc" }
});

function makeScene(id, name, tokenSpecs) {
  const scene = { id, name, tokens: null };
  const tokens = tokenSpecs.map(([tid, tname, type = "npc"]) =>
    type === "npc" ? npc(tid, tname, scene) : { id: tid, name: tname, parent: scene, uuid: `Scene.${id}.Token.${tid}`, actorId: `actor-${tname}`, actor: { name: tname, type } });
  scene.tokens = { contents: tokens, has: vi.fn(tid => tokens.some(t => t.id === tid)) };
  return scene;
}

let cave;
let castle;

beforeEach(() => {
  vi.restoreAllMocks();
  CompendiumManager.clearCache();
  TokenReplacer.clearActorLookup();
  game.user.isGM = true;
  game.i18n.localize = vi.fn(key => key);
  game.i18n.format = vi.fn((key, data) => `${key} ${JSON.stringify(data)}`);
  ui.notifications.info = vi.fn();
  ui.notifications.warn = vi.fn();
  ui.notifications.error = vi.fn();
  cave = makeScene("cave", "Goblin Cave", [["t1", "Goblin"], ["pc", "Hero", "character"]]);
  castle = makeScene("castle", "Castle <Ravenloft>", [["t1", "Goblin"], ["t2", "Owlbear"]]);
  game.scenes = { contents: [cave, castle] };
  canvas.scene = cave;
  canvas.tokens = { controlled: [] };
});

describe("TokenReplacer.getNPCTokensToProcess — all scenes", () => {
  it("collects NPC tokens from every scene when nothing is selected", () => {
    const { tokens, isSelection } = TokenReplacer.getNPCTokensToProcess();

    expect(isSelection).toBe(false);
    expect(tokens.map(t => t.uuid)).toEqual(["Scene.cave.Token.t1", "Scene.castle.Token.t1", "Scene.castle.Token.t2"]);
  });

  it("works with no scene open on the canvas", () => {
    canvas.scene = null;
    canvas.tokens = undefined;

    expect(TokenReplacer.getNPCTokensToProcess().tokens).toHaveLength(3);
  });

  it("still limits the run to the selected tokens", () => {
    canvas.tokens.controlled = [{ document: cave.tokens.contents[0] }];

    const { tokens, isSelection } = TokenReplacer.getNPCTokensToProcess();

    expect(isSelection).toBe(true);
    expect(tokens).toEqual([cave.tokens.contents[0]]);
  });
});

describe("NPCTokenReplacerController — all scenes", () => {
  it("does not require a scene to be open", () => {
    canvas.scene = null;
    vi.spyOn(CompendiumManager, "detectWOTCCompendiums").mockReturnValue([{}]);

    expect(NPCTokenReplacerController.validatePrerequisites()).toBe(true);
  });

  // Token ids are only unique within a scene
  it("replaces same-id tokens on different scenes, each once", async () => {
    const pack = {
      collection: "dnd-monster-manual.actors",
      metadata: { packageName: "dnd-monster-manual", packageType: "module", label: "MM" },
      documentName: "Actor",
      getIndex: vi.fn().mockResolvedValue(),
      index: { contents: [{ name: "Goblin", _id: "g" }, { name: "Owlbear", _id: "o" }], size: 2 }
    };
    game.packs.filter = vi.fn(pred => [pack].filter(pred));
    game.settings.get = vi.fn((ns, key) => ({ enabledCompendiums: '["default"]', overwriteImportedActors: false })[key]);
    game.actors[Symbol.iterator] = function* () {};
    vi.spyOn(PreviewDialog, "confirm").mockResolvedValue(true);
    const replace = vi.spyOn(TokenReplacer, "replaceToken").mockResolvedValue({ id: "new" });

    await NPCTokenReplacerController.replaceNPCTokens();

    expect(replace.mock.calls.map(([doc]) => doc.uuid))
      .toEqual(["Scene.cave.Token.t1", "Scene.castle.Token.t1", "Scene.castle.Token.t2"]);
  });

  it("names the scene of every token in the preview", async () => {
    const confirm = vi.spyOn(FoundryCompat, "confirmDialog").mockReturnValue({ answer: Promise.resolve(false), close: vi.fn() });
    const results = castle.tokens.contents.map(tokenDoc => ({ tokenDoc, scene: TokenReplacer.sceneOf(tokenDoc), creatureName: tokenDoc.name, match: null }));

    await PreviewDialog.confirm(results);

    const { content } = confirm.mock.calls[0][0];
    expect(content).toContain("NPC_REPLACER.PreviewColScene");
    expect(content).toContain("Castle &lt;Ravenloft&gt;");
  });
});
