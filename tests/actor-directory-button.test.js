import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerActorDirectoryButton, NPCTokenReplacerController } from "../scripts/main.js";

/**
 * The replace button lives at the bottom of the Actors sidebar tab. v13/v14
 * DocumentDirectory renders a `footer` part; the renderActorDirectory hook
 * receives the application's HTMLElement (hookEvents.renderApplicationV2).
 */

function directoryElement({ withFooter = true } = {}) {
  const element = document.createElement("section");
  element.innerHTML = `
    <header class="directory-header"></header>
    <ol class="directory-list"></ol>
    ${withFooter ? '<footer class="directory-footer action-buttons" data-application-part="footer"></footer>' : ""}`;
  return element;
}

describe("registerActorDirectoryButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    game.user.isGM = true;
    game.i18n.localize = vi.fn(key => key);
  });

  it("adds the replace button to the bottom of the Actors tab", () => {
    const element = directoryElement();

    registerActorDirectoryButton({}, element);

    const button = element.querySelector(".directory-footer button.npc-replacer-run");
    expect(button).not.toBeNull();
    expect(button.textContent).toContain("NPC_REPLACER.Button");
    expect(button.type).toBe("button");
  });

  it("runs the replacement when clicked", () => {
    const run = vi.spyOn(NPCTokenReplacerController, "replaceNPCTokens").mockResolvedValue();
    const element = directoryElement();
    registerActorDirectoryButton({}, element);

    element.querySelector("button.npc-replacer-run").click();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate the button when the tab re-renders", () => {
    const element = directoryElement();

    registerActorDirectoryButton({}, element);
    registerActorDirectoryButton({}, element);

    expect(element.querySelectorAll("button.npc-replacer-run")).toHaveLength(1);
  });

  it("is only shown to the GM", () => {
    game.user.isGM = false;
    const element = directoryElement();

    registerActorDirectoryButton({}, element);

    expect(element.querySelector("button.npc-replacer-run")).toBeNull();
  });

  it("still lands at the bottom when the footer part is missing", () => {
    const element = directoryElement({ withFooter: false });

    registerActorDirectoryButton({}, element);

    const button = element.querySelector("button.npc-replacer-run");
    expect(button).not.toBeNull();
    expect(element.lastElementChild.contains(button)).toBe(true);
  });

  it("accepts a jQuery-like wrapper", () => {
    const element = directoryElement();

    registerActorDirectoryButton({}, [element]);

    expect(element.querySelector("button.npc-replacer-run")).not.toBeNull();
  });
});
