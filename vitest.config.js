import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    unstubGlobals: true,
    passWithNoTests: true,
    setupFiles: [
      "@rayners/foundry-test-utils/dist/helpers/setup.js",
      "./tests/setup/foundry-mocks.js"
    ],
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["scripts/**/*.js"]
    }
  }
});
