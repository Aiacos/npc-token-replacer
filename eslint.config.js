/**
 * ESLint flat config (ESLint 9+) for NPC Token Replacer.
 *
 * `scripts/` is the shipped module and is linted against the Foundry client
 * globals; `tests/` and `tools/` run on Node and get their own environments.
 *
 * @type {import('eslint').Linter.Config[]}
 */

const BROWSER_GLOBALS = {
  globalThis: "readonly",
  window: "readonly",
  document: "readonly",
  console: "readonly",
  fetch: "readonly",
  Headers: "readonly",
  FormData: "readonly",
  HTMLElement: "readonly",
  Event: "readonly",
  CustomEvent: "readonly",
  AbortController: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly"
};

/** Foundry VTT client globals. Deprecated ones are reached through FoundryCompat. */
const FOUNDRY_GLOBALS = {
  game: "readonly",
  canvas: "readonly",
  ui: "readonly",
  foundry: "readonly",
  Hooks: "readonly",
  CONFIG: "readonly",
  CONST: "readonly",
  Dialog: "readonly",
  FormApplication: "readonly",
  SceneNavigation: "readonly",
  Folder: "readonly",
  Actor: "readonly",
  TokenDocument: "readonly",
  CompendiumCollection: "readonly",
  FilePicker: "readonly",
  loadTemplates: "readonly",
  mergeObject: "readonly"
};

const STYLE_RULES = {
  semi: ["error", "always"],
  quotes: ["warn", "double", { avoidEscape: true, allowTemplateLiterals: true }],
  indent: ["warn", 2, { SwitchCase: 1 }],
  "no-trailing-spaces": "warn",
  "eol-last": ["warn", "always"],
  "comma-dangle": ["warn", "never"],
  "no-multiple-empty-lines": ["warn", { max: 2, maxEOF: 1 }],
  "space-before-function-paren": ["warn", { anonymous: "always", named: "never", asyncArrow: "always" }],
  "keyword-spacing": ["warn", { before: true, after: true }],
  "space-infix-ops": "warn",
  "brace-style": ["warn", "1tbs", { allowSingleLine: true }],
  curly: ["warn", "multi-line"],
  "arrow-spacing": "warn",
  "object-shorthand": ["warn", "properties"]
};

const CORRECTNESS_RULES = {
  "no-undef": "error",
  "no-unused-vars": ["error", {
    argsIgnorePattern: "^_",
    varsIgnorePattern: "^_",
    caughtErrorsIgnorePattern: "^_"
  }],
  "no-const-assign": "error",
  "no-dupe-keys": "error",
  "no-duplicate-case": "error",
  "no-duplicate-imports": "error",
  "no-func-assign": "error",
  "no-import-assign": "error",
  "no-self-assign": "error",
  "no-unreachable": "error",
  "no-unsafe-negation": "error",
  "valid-typeof": "error",
  "no-var": "error",
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  eqeqeq: ["warn", "always", { null: "ignore" }],
  "prefer-const": "warn",
  "no-console": "off"
};

export default [
  {
    ignores: ["releases/**", "release/**", "node_modules/**", "coverage/**", "*.min.js"]
  },
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...BROWSER_GLOBALS, ...FOUNDRY_GLOBALS }
    },
    rules: { ...STYLE_RULES, ...CORRECTNESS_RULES }
  },
  {
    files: ["tools/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly"
      }
    },
    rules: { ...STYLE_RULES, ...CORRECTNESS_RULES }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...BROWSER_GLOBALS,
        ...FOUNDRY_GLOBALS,
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        global: "readonly",
        $: "readonly"
      }
    },
    rules: { ...STYLE_RULES, ...CORRECTNESS_RULES, "no-unused-vars": "warn" }
  }
];
