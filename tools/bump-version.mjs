#!/usr/bin/env node
/**
 * Bump the module version everywhere it is recorded.
 *
 * Usage: node tools/bump-version.mjs <patch|minor|major|x.y.z>
 *
 * Updates module.json (version + download URL), package.json, and promotes the
 * CHANGELOG "Unreleased" section to the new version. Prints the new version to
 * stdout and writes it to $GITHUB_OUTPUT when running in Actions.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";

const argument = process.argv[2];
if (!argument) {
  console.error("usage: node tools/bump-version.mjs <patch|minor|major|x.y.z>");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("module.json", "utf8"));
const current = manifest.version;

const nextVersion = () => {
  if (/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(argument)) return argument;
  const [major, minor, patch] = current.split("-")[0].split(".").map(Number);
  if (argument === "major") return `${major + 1}.0.0`;
  if (argument === "minor") return `${major}.${minor + 1}.0`;
  if (argument === "patch") return `${major}.${minor}.${patch + 1}`;
  console.error(`unknown bump type "${argument}"`);
  process.exit(1);
};

const version = nextVersion();
const repository = (manifest.url ?? "").replace(/\/$/, "");

manifest.version = version;
manifest.download = `${repository}/releases/download/v${version}/${manifest.id}-v${version}.zip`;
writeFileSync("module.json", `${JSON.stringify(manifest, null, 2)}\n`);

if (existsSync("package.json")) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  pkg.version = version;
  writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
}

// Promote the Unreleased section, leaving a fresh empty one behind.
if (existsSync("CHANGELOG.md")) {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const date = new Date().toISOString().slice(0, 10);
  if (changelog.includes("## [Unreleased]")) {
    writeFileSync("CHANGELOG.md", changelog.replace(
      "## [Unreleased]",
      `## [Unreleased]\n\n## [${version}] - ${date}`
    ));
  } else {
    console.warn("CHANGELOG.md has no [Unreleased] section — skipping changelog promotion");
  }
}

console.log(version);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
