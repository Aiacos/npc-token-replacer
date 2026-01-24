/**
 * ESLint Configuration for NPC Token Replacer
 * Using flat config format (ESLint 9.x+)
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        Promise: "readonly",
        Map: "readonly",
        Set: "readonly",
        Math: "readonly",
        // Foundry VTT globals
        game: "readonly",
        canvas: "readonly",
        ui: "readonly",
        Hooks: "readonly",
        Dialog: "readonly",
        Folder: "readonly",
        FormApplication: "readonly",
        foundry: "readonly",
        FilePicker: "readonly",
        CompendiumCollection: "readonly",
        TokenDocument: "readonly",
        Actor: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_"
      }],
      "no-console": "off",
      "semi": ["error", "always"],
      "quotes": ["warn", "double", { avoidEscape: true }],
      "indent": ["warn", 2, { SwitchCase: 1 }],
      "no-trailing-spaces": "warn",
      "eol-last": ["warn", "always"],
      "comma-dangle": ["warn", "never"],
      "no-multiple-empty-lines": ["warn", { max: 2, maxEOF: 1 }],
      "space-before-function-paren": ["warn", {
        anonymous: "always",
        named: "never",
        asyncArrow: "always"
      }],
      "keyword-spacing": ["warn", { before: true, after: true }],
      "space-infix-ops": "warn",
      "brace-style": ["warn", "1tbs", { allowSingleLine: true }],
      "curly": ["warn", "multi-line"],
      "eqeqeq": ["warn", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "warn",
      "prefer-template": "off",
      "object-shorthand": ["warn", "properties"],
      "arrow-spacing": "warn",
      "no-duplicate-imports": "error"
    }
  },
  {
    ignores: [
      "releases/**",
      "release/**",
      "node_modules/**",
      "*.min.js"
    ]
  }
];
