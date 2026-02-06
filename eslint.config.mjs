export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        FormDataEvent: "readonly",
        AbortController: "readonly",
        Headers: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        // Foundry VTT globals
        game: "readonly",
        ui: "readonly",
        canvas: "readonly",
        Hooks: "readonly",
        Dialog: "readonly",
        FormApplication: "readonly",
        Folder: "readonly",
        Actor: "readonly",
        TokenDocument: "readonly",
        foundry: "readonly",
        CONST: "readonly"
      }
    },
    rules: {
      // Error-level rules
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-undef": "error",
      "no-const-assign": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "valid-typeof": "error",
      "no-func-assign": "error",
      "no-import-assign": "error",
      "no-self-assign": "error",
      "no-unsafe-negation": "error",

      // Warning-level rules
      "no-empty": "warn",
      "no-extra-semi": "warn",
      "semi": ["warn", "always"],
      "quotes": ["warn", "double", { "avoidEscape": true, "allowTemplateLiterals": true }],

      // Best practices
      "eqeqeq": ["warn", "always", { "null": "ignore" }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-return-await": "warn"
    }
  }
];
