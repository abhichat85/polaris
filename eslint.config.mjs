import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // agent-kit/core/ is an extracted reusable package: it must not import
  // from Polaris-specific code (Convex, Next.js, or any @/* alias outside
  // agent-kit). Only relative imports inside agent-kit are allowed. This
  // rule guards the package boundary documented in
  // src/lib/agent-kit/README.md.
  {
    files: ["src/lib/agent-kit/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["convex", "convex/*"],
              message:
                "agent-kit/core must not import from convex — keep the package boundary clean.",
            },
            {
              group: ["next", "next/*"],
              message:
                "agent-kit/core must not import from next — keep the package boundary clean.",
            },
            {
              group: [
                "@/lib/*",
                "!@/lib/agent-kit",
                "!@/lib/agent-kit/*",
                "!@/lib/agent-kit/**",
              ],
              message:
                "agent-kit/core may only depend on relative paths inside agent-kit. Use ./ or ../ imports.",
            },
            {
              group: ["@/features/*"],
              message: "agent-kit/core must not import from @/features.",
            },
            {
              group: ["@/components/*"],
              message: "agent-kit/core must not import from @/components.",
            },
            {
              group: ["@/app/*"],
              message: "agent-kit/core must not import from @/app.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
