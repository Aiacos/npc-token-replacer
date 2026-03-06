import { describe, it, expect } from "vitest";
import { Logger, MODULE_ID } from "../../scripts/lib/logger.js";
import { WildcardResolver, DEFAULT_HTTP_TIMEOUT_MS } from "../../scripts/lib/wildcard-resolver.js";
import { NameMatcher } from "../../scripts/lib/name-matcher.js";

describe("Logger import", () => {
  it("exports Logger class with expected static methods", () => {
    expect(Logger).toBeDefined();
    expect(typeof Logger.log).toBe("function");
    expect(typeof Logger.error).toBe("function");
    expect(typeof Logger.warn).toBe("function");
    expect(typeof Logger.debug).toBe("function");
  });

  it("exports MODULE_ID constant", () => {
    expect(MODULE_ID).toBe("npc-token-replacer");
  });

  it("Logger.log works without Foundry globals", () => {
    expect(() => Logger.log("test message")).not.toThrow();
  });
});

describe("WildcardResolver import", () => {
  it("exports WildcardResolver class with expected static methods", () => {
    expect(WildcardResolver).toBeDefined();
    expect(typeof WildcardResolver.isWildcardPath).toBe("function");
    expect(typeof WildcardResolver.selectVariant).toBe("function");
    expect(typeof WildcardResolver.resolve).toBe("function");
    expect(typeof WildcardResolver.clearCache).toBe("function");
  });

  it("exports DEFAULT_HTTP_TIMEOUT_MS constant", () => {
    expect(DEFAULT_HTTP_TIMEOUT_MS).toBe(5000);
  });

  it("isWildcardPath works without Foundry globals", () => {
    expect(WildcardResolver.isWildcardPath("tokens/specter-*.webp")).toBe(true);
    expect(WildcardResolver.isWildcardPath("tokens/specter-1.webp")).toBe(false);
  });
});

describe("NameMatcher import", () => {
  it("exports NameMatcher class with expected static methods", () => {
    expect(NameMatcher).toBeDefined();
    expect(typeof NameMatcher.normalizeName).toBe("function");
    expect(typeof NameMatcher.findMatch).toBe("function");
    expect(typeof NameMatcher.selectBestMatch).toBe("function");
    expect(typeof NameMatcher.setCompendiumManager).toBe("function");
  });

  it("normalizeName works without any setup", () => {
    expect(NameMatcher.normalizeName("Goblin Warrior")).toBe("goblin warrior");
    expect(NameMatcher.normalizeName("  Dire Wolf  ")).toBe("dire wolf");
    expect(NameMatcher.normalizeName("")).toBe("");
    expect(NameMatcher.normalizeName(null)).toBe("");
  });

  it("selectBestMatch returns null for empty input without CompendiumManager", () => {
    expect(NameMatcher.selectBestMatch([])).toBeNull();
    expect(NameMatcher.selectBestMatch(null)).toBeNull();
  });

  it("selectBestMatch returns single match without CompendiumManager", () => {
    const match = { entry: { name: "Goblin" }, pack: { metadata: { label: "MM" } } };
    expect(NameMatcher.selectBestMatch([match])).toBe(match);
  });
});
