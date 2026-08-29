#!/usr/bin/env node
/**
 * Validates module.json and the assets it points at.
 *
 * Run locally with `npm run validate`; CI runs the same script so a broken
 * manifest can never reach a release. Exits non-zero on the first error class
 * found, after reporting every problem.
 */
import { readFileSync, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const errors = [];
const warnings = [];

const fail = message => errors.push(message);
const warn = message => warnings.push(message);

// ── manifest ────────────────────────────────────────────────────────────────
let manifest;
try {
  manifest = JSON.parse(readFileSync(path.join(ROOT, "module.json"), "utf8"));
} catch (error) {
  console.error(`module.json is not readable JSON: ${error.message}`);
  process.exit(1);
}

for (const field of ["id", "title", "version", "compatibility", "manifest", "download", "esmodules"]) {
  if (!manifest[field]) fail(`module.json is missing required field "${field}"`);
}

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(manifest.version ?? "")) {
  fail(`version "${manifest.version}" is not semver`);
}

// ── compatibility ───────────────────────────────────────────────────────────
const compatibility = manifest.compatibility ?? {};
const generation = value => Number.parseInt(String(value ?? ""), 10);

if (!compatibility.minimum) fail("compatibility.minimum is required");
if (!compatibility.verified) fail("compatibility.verified is required");
if (compatibility.minimum && compatibility.verified
  && generation(compatibility.minimum) > generation(compatibility.verified)) {
  fail(`compatibility.minimum (${compatibility.minimum}) is newer than compatibility.verified (${compatibility.verified})`);
}

// Setting a maximum locks the module out of every future Foundry generation,
// which defeats the automatic-compatibility policy this project follows.
if (compatibility.maximum) {
  fail(`compatibility.maximum is set to "${compatibility.maximum}" — leave it unset so new Foundry generations are not blocked`);
}

// ── release URLs ────────────────────────────────────────────────────────────
if (manifest.download && !manifest.download.includes(`v${manifest.version}`)) {
  fail(`download URL does not reference v${manifest.version}: ${manifest.download}`);
}
if (manifest.manifest && !manifest.manifest.includes("releases/latest/download/module.json")) {
  warn("manifest URL should point at releases/latest/download/module.json so Foundry can auto-update the module");
}

// ── referenced files exist ──────────────────────────────────────────────────
const referenced = [
  ...(manifest.esmodules ?? []),
  ...(manifest.scripts ?? []),
  ...(manifest.styles ?? []),
  ...(manifest.languages ?? []).map(language => language.path)
];
for (const file of referenced) {
  if (!existsSync(path.join(ROOT, file))) fail(`module.json references a missing file: ${file}`);
}

// ── language files ──────────────────────────────────────────────────────────
const flatten = (object, prefix = "") => Object.entries(object).reduce((accumulator, [key, value]) => {
  if (value && typeof value === "object" && !Array.isArray(value)) Object.assign(accumulator, flatten(value, `${prefix}${key}.`));
  else accumulator[`${prefix}${key}`] = value;
  return accumulator;
}, {});

const languageKeys = new Map();
for (const language of manifest.languages ?? []) {
  const file = path.join(ROOT, language.path);
  if (!existsSync(file)) continue;
  try {
    languageKeys.set(language.lang, new Set(Object.keys(flatten(JSON.parse(readFileSync(file, "utf8"))))));
  } catch (error) {
    fail(`${language.path} is not valid JSON: ${error.message}`);
  }
}

// ── i18n keys used in source must exist ─────────────────────────────────────
const collectFiles = async (directory, extensions) => {
  const entries = await readdir(path.join(ROOT, directory), { withFileTypes: true, recursive: true });
  return entries
    .filter(entry => entry.isFile() && extensions.some(extension => entry.name.endsWith(extension)))
    .map(entry => path.join(entry.parentPath ?? entry.path, entry.name));
};

const KEY_PATTERN = /(?:localize|format)\(\s*["'`](NPC_REPLACER\.[^"'`]+)["'`]/g;
const TEMPLATE_KEY_PATTERN = /localize\s+"(NPC_REPLACER\.[^"]+)"/g;

const usedKeys = new Set();
for (const file of await collectFiles("scripts", [".js"])) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(KEY_PATTERN)) usedKeys.add(match[1]);
}
for (const file of await collectFiles("templates", [".html", ".hbs"])) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(TEMPLATE_KEY_PATTERN)) usedKeys.add(match[1]);
}

const englishKeys = languageKeys.get("en");
if (englishKeys) {
  for (const key of usedKeys) {
    if (key.includes("${")) continue; // interpolated key — resolved at runtime
    if (!englishKeys.has(key)) fail(`i18n key used in source but missing from lang/en.json: ${key}`);
  }
  for (const key of englishKeys) {
    // Keys built dynamically (e.g. `NPC_REPLACER.Tier.${tier}`) cannot be seen statically
    if (!usedKeys.has(key) && !key.startsWith("NPC_REPLACER.Tier.")) warn(`i18n key defined but never used: ${key}`);
  }
}

// ── templates referenced from source exist ──────────────────────────────────
const TEMPLATE_PATTERN = /modules\/[^"'`\s]+\.(?:hbs|html)/g;
for (const file of await collectFiles("scripts", [".js"])) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(TEMPLATE_PATTERN)) {
    // Source builds these paths from the MODULE_ID constant; resolve it back to
    // the manifest id so the file can be checked on disk.
    const resolved = match[0].replace(/\$\{MODULE_ID\}/g, manifest.id);
    if (resolved.includes("${")) continue;
    const relative = resolved.replace(`modules/${manifest.id}/`, "");
    if (!existsSync(path.join(ROOT, relative))) fail(`source references a missing template: ${match[0]}`);
  }
}

// ── handlebars partials referenced from templates exist ────────────────────
const PARTIAL_PATTERN = /\{\{>\s*"?(modules\/[^"\s}]+)"?\s*\}\}/g;
for (const file of await collectFiles("templates", [".html", ".hbs"])) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(PARTIAL_PATTERN)) {
    const relative = match[1].replace(`modules/${manifest.id}/`, "");
    if (!existsSync(path.join(ROOT, relative))) {
      fail(`${path.relative(ROOT, file)} references a missing partial: ${match[1]}`);
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────
for (const message of warnings) console.warn(`::warning::${message}`);
for (const message of errors) console.error(`::error::${message}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s) found in module.json validation`);
  process.exit(1);
}

console.log(`module.json OK — ${manifest.id} v${manifest.version} (Foundry ${compatibility.minimum}+, verified ${compatibility.verified})`);
console.log(`  ${referenced.length} referenced file(s), ${usedKeys.size} i18n key(s) in use, ${warnings.length} warning(s)`);
