import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "node:path"

/**
 * Test config:
 *   - .test.ts under tests/unit/  → node environment (default)
 *   - .test.tsx under tests/unit/ → jsdom (React component tests)
 *
 * The setup file loads @testing-library/jest-dom matchers; mocks
 * window.crypto.getRandomValues if not present (jsdom 22+).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "dist"],
    environmentMatchGlobs: [
      ["tests/unit/**/*.test.tsx", "jsdom"],
      ["tests/unit/**/*.test.ts", "node"],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts", "src/features/**/*.ts", "src/features/**/*.tsx", "convex/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
