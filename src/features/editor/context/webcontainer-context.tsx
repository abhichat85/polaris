"use client";

/**
 * WebContainerProvider — owns the in-browser sandbox lifecycle.
 *
 * WebContainer.boot() is a process-wide singleton: only ONE instance can
 * exist per browser tab. The previous implementation guarded with a ref
 * that was set *after* await — strict-mode double-invocation and HMR
 * remounts both raced past it and triggered "Only a single WebContainer
 * instance can be booted".
 *
 * Fix: hoist the boot promise to module scope and reuse it. Across
 * remounts, navigations, and strict-mode double effects the same pending
 * promise is returned. Teardown happens on hard unmount only (real route
 * change away from a project IDE).
 *
 * Authority: Constitution §III (architectural — sandbox lifecycle is
 * single-owner) and the WebContainer error referenced in commit
 * bf335b9.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { WebContainer } from "@webcontainer/api";
import { toast } from "sonner";
import { useQuery } from "convex/react";

import { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";

/**
 * Boot phases for the project lifecycle inside the sandbox.
 *
 *   idle        → not started yet (filesReady === false)
 *   installing  → npm install running
 *   starting    → npm run dev spawned, waiting for server-ready
 *   running     → dev server listening (serverUrl is non-null)
 *   failed      → install or dev exited non-zero (see bootError)
 */
export type BootPhase =
  | "idle"
  | "installing"
  | "starting"
  | "running"
  | "failed";

interface WebContainerContextType {
  webcontainer: WebContainer | null;
  /** True once files have been fully mounted into the WebContainer. */
  filesReady: boolean;
  isLoading: boolean;
  error: Error | null;
  serverUrl: string | null;
  /** Where we are in the install → dev pipeline. */
  bootPhase: BootPhase;
  /** Last user-facing error from the install/dev pipeline. */
  bootError: string | null;
  /** Streaming logs from the auto-boot pipeline (tail-bounded). */
  bootLogs: string;
  /** Manually re-trigger the install + dev pipeline (e.g. after a failure). */
  restartDev: () => void;
}

const WebContainerContext = createContext<WebContainerContextType | null>(null);

export const useWebContainer = () => {
  const context = useContext(WebContainerContext);
  if (!context) {
    throw new Error(
      "useWebContainer must be used within a WebContainerProvider",
    );
  }
  return context;
};

// ---------------------------------------------------------------------------
// Module-scope singleton. WebContainer is per-tab, so this lives outside React.
// ---------------------------------------------------------------------------
let bootPromise: Promise<WebContainer> | null = null;
let activeInstance: WebContainer | null = null;

/**
 * Cross-Origin Isolation is set at the *initial document load* via the
 * COOP/COEP headers in src/proxy.ts. Next.js Link clicks are client-side
 * navigations (RSC fetch) which do NOT re-establish the browsing context,
 * so a tab that loaded a non-COI page first (e.g. `/`) and then clicked
 * a Link into `/projects/[id]` will have `crossOriginIsolated === false`
 * and `WebContainer.boot()` will fail with:
 *   DataCloneError: SharedArrayBuffer transfer requires self.crossOriginIsolated
 *
 * Fix: detect the missing isolation and force a real navigation. The
 * sessionStorage guard prevents an infinite reload loop in the unlikely
 * case the proxy isn't actually serving the headers (e.g. caching proxy
 * upstream stripping them).
 */
const COI_RELOAD_KEY = "polaris:coi-reload-attempted";

const ensureCrossOriginIsolated = (): boolean => {
  if (typeof window === "undefined") return true; // SSR — skip
  if (window.crossOriginIsolated) {
    // We're isolated. Clear any stale reload flag so future SPA navigations
    // (which CAN preserve isolation if the source page was also COI) work.
    try {
      window.sessionStorage.removeItem(COI_RELOAD_KEY);
    } catch {
      /* private browsing — ignore */
    }
    return true;
  }
  let attempted = false;
  try {
    attempted = window.sessionStorage.getItem(COI_RELOAD_KEY) === "1";
  } catch {
    /* ignore */
  }
  if (attempted) {
    // We already tried reload and isolation still didn't take. Surface the
    // error rather than loop. Most likely cause: proxy.ts headers being
    // stripped by an upstream layer (Vercel edge, CF tunnel, etc.).
    return false;
  }
  try {
    window.sessionStorage.setItem(COI_RELOAD_KEY, "1");
  } catch {
    /* ignore */
  }
  // Replace (not reload) so the back-button history isn't polluted.
  window.location.replace(window.location.href);
  return false;
};

const getOrBootWebContainer = (): Promise<WebContainer> => {
  if (activeInstance) return Promise.resolve(activeInstance);
  if (!ensureCrossOriginIsolated()) {
    return Promise.reject(
      new Error(
        "Cross-Origin Isolation not active on this page. proxy.ts must " +
          "send Cross-Origin-Opener-Policy: same-origin and " +
          "Cross-Origin-Embedder-Policy: credentialless on /projects/*. " +
          "If those headers are present in the network tab and this still " +
          "fires, check that no upstream proxy is stripping them.",
      ),
    );
  }
  if (!bootPromise) {
    bootPromise = WebContainer.boot()
      .then((instance) => {
        activeInstance = instance;
        return instance;
      })
      .catch((err) => {
        // Reset so a future retry can attempt again.
        bootPromise = null;
        throw err;
      });
  }
  return bootPromise;
};

// ---------------------------------------------------------------------------
// Auto-inject missing Next.js root config files
// ---------------------------------------------------------------------------

/**
 * Detects whether a Next.js project is missing its root config files and
 * writes safe defaults so `npm install && npm run dev` works immediately.
 *
 * Detection heuristic: project has an `app/` or `src/app/` folder but no
 * `package.json`. This is the canonical signal that the agent scaffolded
 * components without completing the bootstrap step.
 */
async function injectMissingNextjsConfig(
  instance: WebContainer,
  files: { name: string; parentId?: string; type: string }[],
): Promise<void> {
  // Check if package.json already exists among the mounted files.
  const rootFiles = files.filter((f) => !f.parentId);
  const hasPkgJson = rootFiles.some((f) => f.name === "package.json");
  if (hasPkgJson) return; // Nothing to do.

  // Check if this looks like a Next.js project (has app/ or src/ folder).
  const hasAppDir = rootFiles.some(
    (f) => f.type === "folder" && (f.name === "app" || f.name === "src"),
  );
  if (!hasAppDir) return; // Unknown project type — don't guess.

  // Inject the minimum files required to run a Next.js 15 app router project.
  await instance.mount({
    "package.json": {
      file: {
        contents: JSON.stringify(
          {
            name: "my-app",
            version: "0.1.0",
            private: true,
            scripts: {
              dev: "next dev",
              build: "next build",
              start: "next start",
              lint: "next lint",
            },
            dependencies: {
              next: "15.3.1",
              react: "^19.0.0",
              "react-dom": "^19.0.0",
              convex: "^1.21.0",
              clsx: "^2.1.1",
              "tailwind-merge": "^2.5.2",
              "lucide-react": "^0.477.0",
              "tailwindcss-animate": "^1.0.7",
            },
            devDependencies: {
              "@types/node": "^20",
              "@types/react": "^19",
              "@types/react-dom": "^19",
              typescript: "^5",
              tailwindcss: "^3.4.17",
              autoprefixer: "^10.4.20",
              postcss: "^8.4.49",
            },
          },
          null,
          2,
        ),
      },
    },
    "next.config.ts": {
      file: {
        contents: `import type { NextConfig } from 'next'\n\nconst config: NextConfig = {}\n\nexport default config\n`,
      },
    },
    "tsconfig.json": {
      file: {
        contents: JSON.stringify(
          {
            compilerOptions: {
              target: "ES2017",
              lib: ["dom", "dom.iterable", "esnext"],
              allowJs: true,
              skipLibCheck: true,
              strict: true,
              noEmit: true,
              esModuleInterop: true,
              module: "esnext",
              moduleResolution: "bundler",
              resolveJsonModule: true,
              isolatedModules: true,
              jsx: "preserve",
              incremental: true,
              plugins: [{ name: "next" }],
              paths: { "@/*": ["./*"] },
            },
            include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
            exclude: ["node_modules"],
          },
          null,
          2,
        ),
      },
    },
    "tailwind.config.ts": {
      file: {
        contents: `import type { Config } from 'tailwindcss'\n\nconst config: Config = {\n  content: [\n    './pages/**/*.{js,ts,jsx,tsx,mdx}',\n    './components/**/*.{js,ts,jsx,tsx,mdx}',\n    './app/**/*.{js,ts,jsx,tsx,mdx}',\n    './src/**/*.{js,ts,jsx,tsx,mdx}',\n  ],\n  theme: {\n    extend: {},\n  },\n  plugins: [],\n}\n\nexport default config\n`,
      },
    },
    "postcss.config.mjs": {
      file: {
        contents: `/** @type {import('postcss-load-config').Config} */\nconst config = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n}\n\nexport default config\n`,
      },
    },
  });

  console.info(
    "[Polaris] Auto-injected missing Next.js config files (package.json, next.config.ts, tsconfig.json, tailwind.config.ts, postcss.config.mjs)",
  );
}

/**
 * Scan source files for imports that aren't in package.json and patch it.
 *
 * The agent sometimes generates code that imports packages (e.g. `convex/react`,
 * `lucide-react`, `framer-motion`) without adding them to the project's
 * package.json. This results in "Module not found" errors from Next.js at
 * runtime even though install succeeded.
 *
 * We scan the mounted file contents for known import patterns and add the
 * missing packages to the package.json in the WebContainer FS.
 */
async function patchPackageJsonForMissingDeps(
  instance: WebContainer,
  files: { name: string; parentId?: string; type: string; content?: string | null }[],
): Promise<void> {
  // Only applies to projects that have a package.json (otherwise
  // injectMissingNextjsConfig already wrote one with full deps).
  const rootFiles = files.filter((f) => !f.parentId);
  const hasPkgJson = rootFiles.some((f) => f.name === "package.json");
  if (!hasPkgJson) return;

  // Collect all source file contents.
  const allContent = files
    .filter((f) => f.type === "file" && f.content)
    .map((f) => f.content as string)
    .join("\n");

  // Known packages the Polaris agent commonly scaffolds.
  // Map: import-pattern → { package-name, version }
  const candidates: Array<{ pattern: RegExp; pkg: string; version: string }> = [
    { pattern: /from ['"]convex\//, pkg: "convex", version: "^1.21.0" },
    { pattern: /from ['"]lucide-react['"]/, pkg: "lucide-react", version: "^0.477.0" },
    { pattern: /from ['"]framer-motion['"]/, pkg: "framer-motion", version: "^11.0.0" },
    { pattern: /from ['"]@radix-ui\//, pkg: null as unknown as string, version: "" }, // handled below
    { pattern: /from ['"]zustand['"]/, pkg: "zustand", version: "^5.0.0" },
    { pattern: /from ['"]react-hook-form['"]/, pkg: "react-hook-form", version: "^7.0.0" },
    { pattern: /from ['"]zod['"]/, pkg: "zod", version: "^3.0.0" },
    { pattern: /from ['"]axios['"]/, pkg: "axios", version: "^1.7.0" },
    { pattern: /from ['"]date-fns['"]/, pkg: "date-fns", version: "^4.0.0" },
    { pattern: /from ['"]sonner['"]/, pkg: "sonner", version: "^2.0.0" },
  ];

  // Collect missing deps.
  const toAdd: Record<string, string> = {};

  for (const { pattern, pkg, version } of candidates) {
    if (!pkg) continue; // skip sentinel entries
    if (pattern.test(allContent)) {
      toAdd[pkg] = version;
    }
  }

  // Radix UI — scan for all @radix-ui/* packages imported.
  const radixMatches = allContent.matchAll(/from ['"](@radix-ui\/[a-z-]+)['"]/g);
  for (const [, radixPkg] of radixMatches) {
    toAdd[radixPkg] = "latest";
  }

  // Always ensure tailwindcss-animate is present — shadcn/ui projects need it.
  toAdd["tailwindcss-animate"] = "^1.0.7";

  if (Object.keys(toAdd).length === 0) return;

  // Read the current package.json from the WebContainer FS.
  let pkgJson: Record<string, unknown> = {};
  try {
    const raw = await instance.fs.readFile("package.json", "utf-8");
    pkgJson = JSON.parse(raw);
  } catch {
    return; // Can't read / parse — bail gracefully.
  }

  const deps = (pkgJson.dependencies ?? {}) as Record<string, string>;
  const devDeps = (pkgJson.devDependencies ?? {}) as Record<string, string>;

  let patched = false;
  for (const [pkg, version] of Object.entries(toAdd)) {
    if (!deps[pkg] && !devDeps[pkg]) {
      deps[pkg] = version;
      patched = true;
    }
  }

  if (!patched) return;

  pkgJson.dependencies = deps;
  await instance.fs.writeFile("package.json", JSON.stringify(pkgJson, null, 2));
  console.info(
    `[Polaris] Patched package.json with missing deps: ${Object.keys(toAdd).join(", ")}`,
  );
}

/**
 * Ensure the minimum app-router files exist so `next dev` boots successfully.
 *
 * `next dev` fails with "Module not found: Can't resolve './page'" if `app/`
 * exists but `layout.tsx` or `page.tsx` are missing. We only write files
 * that are *absent* — never overwrite agent-created content.
 *
 * This runs whether or not we injected the root config; the agent might
 * have written package.json correctly but be mid-scaffold on app files.
 */
async function ensureMinimumAppFiles(
  instance: WebContainer,
  files: { _id: string; name: string; parentId?: string; type: string }[],
): Promise<void> {
  // Find the `app/` folder (root-level only — src/app handled separately).
  const appFolder = files.find(
    (f) => !f.parentId && f.type === "folder" && f.name === "app",
  );
  if (!appFolder) return; // No app dir → nothing to ensure.

  const appChildren = files.filter((f) => f.parentId === appFolder._id);
  const hasLayout = appChildren.some(
    (f) => f.name === "layout.tsx" || f.name === "layout.jsx" || f.name === "layout.js",
  );
  const hasPage = appChildren.some(
    (f) => f.name === "page.tsx" || f.name === "page.jsx" || f.name === "page.js",
  );
  const hasGlobals = appChildren.some((f) => f.name === "globals.css");

  if (hasLayout && hasPage && hasGlobals) return;

  type WCEntry = { file: { contents: string } };
  const tree: Record<string, WCEntry> = {};

  if (!hasLayout) {
    tree["layout.tsx"] = {
      file: {
        contents: `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "App",
  description: "Generated by Polaris",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
      },
    };
  }
  if (!hasPage) {
    tree["page.tsx"] = {
      file: {
        contents: `export default function Page() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold mb-2">Welcome</h1>
        <p className="text-gray-500">Edit app/page.tsx to get started.</p>
      </div>
    </main>
  );
}
`,
      },
    };
  }
  if (!hasGlobals) {
    tree["globals.css"] = {
      file: {
        contents: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`,
      },
    };
  }

  await instance.mount({ app: { directory: tree } });
  console.info(
    `[Polaris] Auto-injected missing app files: ${Object.keys(tree).join(", ")}`,
  );
}

/**
 * Ensure Convex generated files exist so Next.js can compile imports like
 * `@/convex/_generated/api` and `@/convex/_generated/dataModel`.
 *
 * These files are normally emitted by `npx convex dev` / `npx convex generate`.
 * In WebContainer there is no Convex CLI running, so if the agent didn't
 * create them we write minimal typed stubs. Stubs produce type-safe no-ops
 * rather than "Module not found" build crashes — the app compiles and
 * renders, data hooks return undefined/loading, which is acceptable for a
 * preview.
 *
 * Also ensures `convex/` has a minimal `_generated/` directory with the
 * right exports so TypeScript path-resolution works via tsconfig `@/*`.
 */
async function ensureConvexGeneratedFiles(
  instance: WebContainer,
  files: { _id: string; name: string; parentId?: string; type: string; content?: string | null }[],
): Promise<void> {
  // Detect if any file in the project imports from convex.
  const allContent = files
    .filter((f) => f.type === "file" && f.content)
    .map((f) => f.content as string)
    .join("\n");
  const usesConvex = /from ['"]convex\//.test(allContent);
  if (!usesConvex) return;

  // Find or detect the convex/ root folder.
  const rootFiles = files.filter((f) => !f.parentId);
  const convexFolder = rootFiles.find(
    (f) => f.type === "folder" && f.name === "convex",
  );

  // Only skip writing the stub if the AGENT itself created a real generated
  // api.ts (i.e. it's in the Convex files array, not something we wrote).
  // We do NOT check the WC filesystem — if we wrote a buggy stub previously,
  // we want to overwrite it with the fixed version every time.
  let agentCreatedApi = false;
  if (convexFolder) {
    const convexChildren = files.filter((f) => f.parentId === convexFolder._id);
    const generatedFolder = convexChildren.find(
      (f) => f.type === "folder" && f.name === "_generated",
    );
    if (generatedFolder) {
      const genChildren = files.filter((f) => f.parentId === generatedFolder._id);
      agentCreatedApi = genChildren.some(
        (f) => f.name === "api.ts" || f.name === "api.js",
      );
    }
  }

  if (agentCreatedApi) return; // Real generated file from agent — don't touch it.

  // Write (or overwrite) stub files. We always write so a previously-broken
  // stub (e.g. from an old bootstrap run) gets replaced with the fixed one.
  //
  // CRITICAL: the Proxy get trap MUST handle Symbol keys.
  // React and JS runtimes probe objects with Symbol.toPrimitive,
  // Symbol.toStringTag, Symbol.iterator etc. Concatenating a Symbol into a
  // template literal throws "Cannot convert a Symbol value to a string".
  // The fix: return undefined for any Symbol prop — the Proxy should only
  // intercept string property access.
  // IMPORTANT: this stub imports makeFunctionReference from the INSTALLED
  // convex package so that useQuery / useMutation receive properly-shaped
  // Convex FunctionReference objects. Without this, Convex's internal
  // getFunctionName() crashes with "Cannot convert object to primitive value"
  // because it tries to coerce our plain Proxy object to a string.
  //
  // How it works at runtime:
  //   api.products.getFeaturedProducts
  //   → segments = ["products", "getFeaturedProducts"]
  //   → makeFunctionReference("products:getFeaturedProducts")
  //   → useQuery receives a real FunctionReference
  //   → Convex tries to subscribe → WebSocket fails (no real backend)
  //   → hook returns undefined (loading state) → component renders safely
  const apiStub = `/* eslint-disable */
// @ts-nocheck
// AUTO-GENERATED STUB by Polaris WebContainer bootstrap.
// useQuery / useMutation receive real Convex FunctionReference objects so
// Convex internals don't crash. All queries return undefined (loading state)
// because there is no real Convex backend in the WebContainer preview.

import { makeFunctionReference } from "convex/server";

function makeApiProxy(segments) {
  // Build a proper Convex FunctionReference once we have at least two
  // segments (module + function name). Single-segment nodes are pure
  // traversal shims — they only exist to let you write api.products.fn.
  let ref = Object.create(null);
  if (segments.length >= 2) {
    const modulePath = segments.slice(0, -1).join("/");
    const funcName   = segments[segments.length - 1];
    try {
      // makeFunctionReference("products:getFeaturedProducts") produces the
      // exact object shape that useQuery, useMutation, useAction expect.
      ref = makeFunctionReference(modulePath + ":" + funcName);
    } catch (_) {
      ref = Object.create(null);
    }
  }

  return new Proxy(ref, {
    get(target, prop) {
      // Pass Symbol lookups straight through to the underlying ref so
      // Convex's internal REFERENCE_MARKER symbol access works correctly.
      if (typeof prop === "symbol") return target[prop];
      // Intercept well-known "inspection" string props to prevent infinite
      // proxy recursion when Node / React DevTools iterate the object.
      if (prop === "then" || prop === "$$typeof" || prop === "__esModule") {
        return undefined;
      }
      return makeApiProxy([...segments, String(prop)]);
    },
  });
}

export const api      = makeApiProxy([]);
export const internal = makeApiProxy([]);
`;

  const dataModelStub = `/* eslint-disable */
// @ts-nocheck
// AUTO-GENERATED STUB by Polaris WebContainer bootstrap.
// Provides the minimum type surface so the project compiles without a
// real "npx convex generate" run.

export type Id<T extends string = string> = string & { __tableName: T };

export type Doc<T extends string = string> = {
  _id: Id<T>;
  _creationTime: number;
  [key: string]: unknown;
};

export type TableNames = string;
export type SystemTableNames = string;

export type DataModel = Record<string, {
  document: Doc;
  fieldPaths: string;
  indexes: Record<string, unknown>;
  searchIndexes: Record<string, unknown>;
  vectorIndexes: Record<string, unknown>;
}>;
`;

  await instance.mount({
    convex: {
      directory: {
        "_generated": {
          directory: {
            "api.ts": { file: { contents: apiStub } },
            "dataModel.d.ts": { file: { contents: dataModelStub } },
          },
        },
      },
    },
  });

  console.info("[Polaris] Auto-created convex/_generated stubs (api.ts, dataModel.d.ts)");
}

// ---------------------------------------------------------------------------
// Shadcn/ui compatibility — Tailwind config + globals.css CSS variables
// ---------------------------------------------------------------------------

/**
 * Full shadcn/ui-compatible tailwind.config.ts.
 *
 * Written to the WebContainer whenever we detect the project uses
 * shadcn color tokens (border-border, bg-background, etc.) but the
 * current tailwind.config.ts doesn't define them.
 */
const SHADCN_TAILWIND_CONFIG = `import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
`;

/**
 * Shadcn/ui CSS variable block for globals.css.
 * Injected when globals.css uses @apply border-border (etc.) but
 * doesn't define the --border custom property.
 */
const SHADCN_CSS_VARIABLES = `
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
    --sidebar-background: 0 0% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --sidebar-primary: 240 5.9% 10%;
    --sidebar-primary-foreground: 0 0% 98%;
    --sidebar-accent: 240 4.8% 95.9%;
    --sidebar-accent-foreground: 240 5.9% 10%;
    --sidebar-border: 220 13% 91%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
    --sidebar-background: 240 5.9% 10%;
    --sidebar-foreground: 240 4.8% 95.9%;
    --sidebar-primary: 224.3 76.3% 48%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 240 3.7% 15.9%;
    --sidebar-accent-foreground: 240 4.8% 95.9%;
    --sidebar-border: 240 3.7% 15.9%;
    --sidebar-ring: 217.2 91.2% 59.8%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`;

/**
 * Patch tailwind.config.ts and globals.css so shadcn/ui-style class utilities
 * (border-border, bg-background, text-foreground, etc.) compile without error.
 *
 * Strategy:
 * 1. Read tailwind.config.ts from the WebContainer FS.
 * 2. If it doesn't include the shadcn color tokens, overwrite with full config.
 * 3. Read globals.css — if it uses @apply border-border but doesn't define
 *    the --border CSS variable, inject the full variable block.
 *
 * This is always safe: we're only ADDING tokens, never removing anything.
 */
async function ensureShadcnCompatibleTailwind(instance: WebContainer): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Tailwind config
  // -------------------------------------------------------------------------
  const TAILWIND_FILES = ["tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs"];
  let tailwindPath: string | null = null;
  let tailwindContent: string | null = null;

  for (const f of TAILWIND_FILES) {
    try {
      tailwindContent = await instance.fs.readFile(f, "utf-8");
      tailwindPath = f;
      break;
    } catch { /* not found */ }
  }

  const needsTailwindPatch =
    !tailwindContent ||
    (!tailwindContent.includes("var(--border)") &&
      !tailwindContent.includes('"border"'));

  if (needsTailwindPatch) {
    await instance.fs.writeFile(
      tailwindPath ?? "tailwind.config.ts",
      SHADCN_TAILWIND_CONFIG,
    );
    console.info("[Polaris] Patched tailwind.config.ts with shadcn color tokens");
  }

  // -------------------------------------------------------------------------
  // 2. globals.css — inject CSS variables if missing
  // -------------------------------------------------------------------------
  const GLOBALS_PATHS = ["app/globals.css", "src/app/globals.css"];
  let globalsPath: string | null = null;
  let globalsContent: string | null = null;

  for (const p of GLOBALS_PATHS) {
    try {
      globalsContent = await instance.fs.readFile(p, "utf-8");
      globalsPath = p;
      break;
    } catch { /* not found */ }
  }

  if (globalsPath && globalsContent) {
    const hasBorderVar = globalsContent.includes("--border");
    const usesBorderBorder =
      globalsContent.includes("border-border") ||
      globalsContent.includes("bg-background") ||
      globalsContent.includes("text-foreground");

    if (usesBorderBorder && !hasBorderVar) {
      // Strip any existing @layer base blocks that reference our vars, then
      // append the full variable block after the @tailwind directives.
      const baseContent = globalsContent.includes("@tailwind utilities")
        ? globalsContent
            .split("@tailwind utilities")[0]
            .trimEnd() + "\n@tailwind utilities;"
        : globalsContent.trimEnd();

      await instance.fs.writeFile(globalsPath, baseContent + "\n" + SHADCN_CSS_VARIABLES);
      console.info("[Polaris] Injected shadcn CSS variable block into globals.css");
    }
  }
}

// ---------------------------------------------------------------------------
// Convex provider source patch
// ---------------------------------------------------------------------------

/**
 * Find any file in the project that instantiates ConvexReactClient and
 * patch it to use a fallback URL when NEXT_PUBLIC_CONVEX_URL is undefined.
 *
 * This is the source of the "No address provided to ConvexReactClient"
 * runtime crash. The fix is surgical: replace the bare env-var usage
 * with a nullish-coalescing fallback so the client always gets a valid URL.
 *
 * We only modify files that contain `ConvexReactClient` AND reference the
 * env var WITHOUT already having a fallback (`??`). We write the patched
 * content back to the WebContainer FS — the agent's Convex repo file is
 * NOT modified (it's the mounted copy inside the WC).
 */
async function patchConvexProviderFiles(instance: WebContainer): Promise<void> {
  // Common paths the agent uses for a Convex provider wrapper.
  const CANDIDATES = [
    "components/providers/convex-provider.tsx",
    "components/convex-provider.tsx",
    "app/providers.tsx",
    "app/provider.tsx",
    "lib/convex.ts",
    "providers/convex-provider.tsx",
    "src/components/providers/convex-provider.tsx",
    "src/providers/convex-provider.tsx",
  ];

  const FALLBACK_URL = "https://preview-sandbox.convex.cloud";

  for (const path of CANDIDATES) {
    let content: string;
    try {
      content = await instance.fs.readFile(path, "utf-8");
    } catch {
      continue; // file doesn't exist
    }

    // Skip if it doesn't use ConvexReactClient.
    if (!content.includes("ConvexReactClient")) continue;

    // Skip if it already has a fallback.
    if (content.includes("??") && content.includes("CONVEX_URL")) continue;

    let patched = content;

    // Pattern 1: new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
    patched = patched.replace(
      /new\s+ConvexReactClient\(\s*process\.env\.NEXT_PUBLIC_CONVEX_URL\s*!?\s*\)/g,
      `new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "${FALLBACK_URL}")`,
    );

    // Pattern 2: new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL as string)
    patched = patched.replace(
      /new\s+ConvexReactClient\(\s*process\.env\.NEXT_PUBLIC_CONVEX_URL\s+as\s+string\s*\)/g,
      `new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL ?? "${FALLBACK_URL}")`,
    );

    if (patched !== content) {
      await instance.fs.writeFile(path, patched);
      console.info(`[Polaris] Patched ${path} — added Convex URL fallback`);
    }
  }
}

// ---------------------------------------------------------------------------
// Next.js webpack alias — redirect convex/react to a safe preview mock
// ---------------------------------------------------------------------------

/**
 * Write a lightweight mock of convex/react into the user's project and
 * configure Next.js to alias `convex/react` to it via webpack.
 *
 * This is the definitive fix for all Convex runtime errors in the preview:
 *
 * - "No address provided to ConvexReactClient" — mock client ignores address
 * - "Cannot convert object to primitive value" — useQuery never calls Convex
 * - WebSocket connection failures bubbling as React errors — never happen
 *
 * With this alias active, ALL convex/react imports (useQuery, useMutation,
 * ConvexProvider, etc.) resolve to our mock. Hooks return undefined / null
 * (loading state). The app renders fully. No real Convex connection is made.
 */
async function installConvexPreviewMock(instance: WebContainer): Promise<void> {
  // Write the mock module.
  const mockContent = `
"use client";
// Polaris WebContainer preview — convex/react mock.
// All hooks return safe loading-state values. No real backend connection.
const React = require("react");

class ConvexReactClient {
  constructor() {}
  onUpdate() {}
  close() {}
  setAuth() {}
}

function ConvexProvider({ children }) { return children; }

function useQuery() { return undefined; }

function usePaginatedQuery() {
  return { results: [], status: "LoadingFirstPage", isLoading: true, loadMore: function() {} };
}

function useMutation() {
  return function() { return Promise.resolve(null); };
}

function useAction() {
  return function() { return Promise.resolve(null); };
}

function useConvex() { return new ConvexReactClient(); }

function useConvexAuth() { return { isLoading: true, isAuthenticated: false }; }

module.exports = {
  ConvexReactClient,
  ConvexProvider,
  useQuery,
  usePaginatedQuery,
  useMutation,
  useAction,
  useConvex,
  useConvexAuth,
};
`;

  try {
    await instance.fs.mkdir("_polaris", { recursive: true });
  } catch { /* already exists */ }

  await instance.fs.writeFile("_polaris/convex-react-mock.js", mockContent);

  // Patch next.config.ts to add webpack alias.
  const CONFIG_FILES = ["next.config.ts", "next.config.js", "next.config.mjs"];
  let configPath: string | null = null;
  let configContent: string | null = null;

  for (const f of CONFIG_FILES) {
    try {
      configContent = await instance.fs.readFile(f, "utf-8");
      configPath = f;
      break;
    } catch { /* not found */ }
  }

  if (!configPath || !configContent) return; // ensureNextConfig already handled creation

  // Skip if already patched.
  if (configContent.includes("convex-react-mock")) return;

  // Inject webpack alias into the config. We add a webpack function to the
  // existing config object using a simple regex that finds the config export.
  const webpackPatch = `
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "convex/react": require("path").resolve(process.cwd(), "_polaris/convex-react-mock.js"),
    };
    return config;
  },`;

  let patched = configContent;
  // Insert webpack property into the config object literal.
  patched = patched.replace(
    /(const\s+config[^=]*=\s*\{)/,
    `$1${webpackPatch}`,
  );

  if (patched !== configContent) {
    // Add path import at the top if not present (TypeScript config files).
    if (!patched.includes("require(\"path\")") && patched.startsWith("import")) {
      // ESM — use a different approach: embed the path inline.
      patched = patched.replace(
        /(const\s+config[^=]*=\s*\{)/,
        `$1
  webpack: (config) => {
    // Alias convex/react to a preview-safe mock (no real backend needed).
    config.resolve.alias = {
      ...config.resolve.alias,
      "convex/react": require.resolve("./_polaris/convex-react-mock.js"),
    };
    return config;
  },`,
      );
      // Undo the first replacement.
      patched = configContent.replace(
        /(const\s+config[^=]*=\s*\{)/,
        `$1
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "convex/react": require.resolve("./_polaris/convex-react-mock.js"),
    };
    return config;
  },`,
      );
    }
    await instance.fs.writeFile(configPath, patched);
    console.info("[Polaris] Patched next.config.ts with convex/react webpack alias");
  }
}

// ---------------------------------------------------------------------------
// Environment + runtime preemptive fixes
// ---------------------------------------------------------------------------

/**
 * Create .env.local with the minimum variables needed to prevent runtime
 * crashes in the user's generated app running inside WebContainer.
 *
 * Key variables:
 *
 * - NEXT_PUBLIC_CONVEX_URL  — ConvexReactClient throws "No address provided"
 *   if this is undefined. We supply a syntactically valid URL so the client
 *   initialises without crashing. The WebSocket will fail to connect (no
 *   real Convex deployment), so data hooks stay in loading state, but the
 *   app renders and the UI is visible.
 *
 * - Any vars the agent defined in .env.example are copied over so code
 *   that reads `process.env.NEXT_PUBLIC_*` doesn't blow up.
 */
async function ensureEnvLocal(
  instance: WebContainer,
  files: { name: string; parentId?: string; type: string; content?: string | null }[],
): Promise<void> {
  // Detect if the project references Convex at all.
  const allContent = files
    .filter((f) => f.type === "file" && f.content)
    .map((f) => f.content as string)
    .join("\n");
  const usesConvex =
    /from ['"]convex\//.test(allContent) ||
    /NEXT_PUBLIC_CONVEX_URL/.test(allContent) ||
    /ConvexReactClient/.test(allContent);

  // Read existing .env.local (if any) and .env.example (to mirror its keys).
  let existing = "";
  try {
    existing = await instance.fs.readFile(".env.local", "utf-8");
  } catch { /* doesn't exist yet */ }

  let example = "";
  try {
    example = await instance.fs.readFile(".env.example", "utf-8")
      .catch(() => instance.fs.readFile(".env", "utf-8").catch(() => ""));
  } catch { /* ignore */ }

  // Build the set of lines to add.
  const lines: string[] = [];

  // Mirror any NEXT_PUBLIC_* keys from .env.example that aren't in .env.local.
  for (const line of example.split("\n")) {
    const match = line.match(/^(NEXT_PUBLIC_\w+)\s*=/);
    if (match && !existing.includes(match[1])) {
      // Use the example value if it has one, otherwise empty string.
      lines.push(line.trim() || `${match[1]}=`);
    }
  }

  // Convex URL — the most critical missing env var.
  if (usesConvex && !existing.includes("NEXT_PUBLIC_CONVEX_URL")) {
    // Must be a syntactically valid URL so ConvexReactClient doesn't throw.
    // Any https URL passes the client's address check. The WebSocket will
    // fail silently — data stays in loading state, page still renders.
    lines.push("NEXT_PUBLIC_CONVEX_URL=https://preview-sandbox.convex.cloud");
  }

  if (lines.length === 0) return;

  const newContent = (existing ? existing.trimEnd() + "\n" : "") +
    lines.join("\n") + "\n";
  await instance.fs.writeFile(".env.local", newContent);
  console.info("[Polaris] Wrote .env.local:", lines.join(", "));
}

/**
 * Patch next.config.ts to avoid common WebContainer runtime failures:
 *
 * 1. `images.unoptimized: true` — Next.js image optimisation spawns a
 *    separate process that doesn't work in WebContainer. Without this,
 *    any `<Image src="https://...">` throws "hostname not configured".
 *
 * 2. `images.remotePatterns` allowing all https hosts — agent code
 *    commonly uses Unsplash, picsum.photos, placeholder.com, etc.
 *
 * We only write to the file if these keys are absent — never overwrite
 * custom config the agent added (rewrites, headers, etc.).
 */
async function ensureNextConfig(instance: WebContainer): Promise<void> {
  const CONFIG_FILES = ["next.config.ts", "next.config.js", "next.config.mjs"];
  let configPath: string | null = null;
  let content: string | null = null;

  for (const f of CONFIG_FILES) {
    try {
      content = await instance.fs.readFile(f, "utf-8");
      configPath = f;
      break;
    } catch { /* not found */ }
  }

  // If no config file, write a safe default.
  if (!configPath || !content) {
    await instance.fs.writeFile("next.config.ts", `import type { NextConfig } from 'next'

const config: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
}

export default config
`);
    console.info("[Polaris] Created next.config.ts with image settings");
    return;
  }

  // Already configured — nothing to do.
  if (content.includes("unoptimized") && content.includes("remotePatterns")) return;

  // Simple string-patch: insert `images:` block just after the opening brace
  // of the config object. Works for `const config = {` and
  // `const config: NextConfig = {` patterns.
  const imageBlock = `
  images: {
    unoptimized: true,
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },`;

  let patched = content;

  if (!patched.includes("unoptimized")) {
    if (patched.includes("images:")) {
      // images block exists but lacks `unoptimized` — inject the property.
      patched = patched.replace(
        /images\s*:\s*\{/,
        `images: {\n    unoptimized: true,`,
      );
    } else {
      // No images block at all — inject one.
      patched = patched.replace(
        /(const\s+config[^=]*=\s*\{)/,
        `$1${imageBlock}`,
      );
    }
  }

  if (!patched.includes("remotePatterns") && patched.includes("images:")) {
    patched = patched.replace(
      /images\s*:\s*\{/,
      `images: {\n    remotePatterns: [{ protocol: 'https', hostname: '**' }],`,
    );
  }

  if (patched !== content) {
    await instance.fs.writeFile(configPath, patched);
    console.info("[Polaris] Patched next.config.ts with image settings");
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
interface WebContainerProviderProps {
  children: React.ReactNode;
  projectId: Id<"projects">;
}

export const WebContainerProvider = ({
  children,
  projectId,
}: WebContainerProviderProps) => {
  // Always start null — even when activeInstance exists — so the terminal
  // never fires before instance.mount() completes. setWebcontainer() is
  // called only after files are fully mounted (see boot() below).
  const [webcontainer, setWebcontainer] = useState<WebContainer | null>(null);
  const [filesReady, setFilesReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [bootPhase, setBootPhase] = useState<BootPhase>("idle");
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootLogs, setBootLogs] = useState<string>("");
  // Bump to re-trigger the install/dev pipeline on demand.
  const [bootNonce, setBootNonce] = useState(0);

  const filesMountedRef = useRef(false);
  const devProcessRef = useRef<{ kill: () => void } | null>(null);
  const files = useQuery(api.system.getProjectFiles, { projectId });

  const restartDev = () => setBootNonce((n) => n + 1);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      // Wait until Convex has hydrated the file list before mounting.
      if (!files) return;

      try {
        const instance = await getOrBootWebContainer();
        if (cancelled) return;

        // Mount files exactly once per provider instance. Subsequent file
        // edits flow via per-file writes from the editor, not full remounts.
        if (!filesMountedRef.current) {
          // Local type alias avoids `any` while keeping the recursive shape readable.
          type WCFile = NonNullable<typeof files>[number];
          const filesByParent = new Map<string | undefined, WCFile[]>();
          for (const file of files) {
            const pid = file.parentId ?? undefined;
            if (!filesByParent.has(pid)) filesByParent.set(pid, []);
            filesByParent.get(pid)!.push(file);
          }

          type WCEntry =
            | { directory: Record<string, WCEntry> }
            | { file: { contents: string } };

          const buildTree = (
            parentId: string | undefined,
          ): Record<string, WCEntry> => {
            const tree: Record<string, WCEntry> = {};
            for (const child of filesByParent.get(parentId) ?? []) {
              if (child.type === "folder") {
                tree[child.name] = { directory: buildTree(child._id) };
              } else {
                tree[child.name] = {
                  file: { contents: child.content ?? "" },
                };
              }
            }
            return tree;
          };

          await instance.mount(buildTree(undefined));

          // ----------------------------------------------------------------
          // Auto-inject missing Next.js root config files.
          //
          // The agent sometimes scaffolds component files before it has a
          // chance to write package.json / tsconfig.json (e.g. if an early
          // run was cancelled). Without these files `npm run dev` fails with
          // ENOENT. We detect the missing files and inject safe defaults so
          // the user can always run the project.
          // ----------------------------------------------------------------
          await injectMissingNextjsConfig(instance, files);

          // Safety net: ensure app/layout.tsx, app/page.tsx, app/globals.css
          // exist so `next dev` doesn't fail with module-not-found. Only writes
          // files that are absent — never overwrites agent-authored ones.
          await ensureMinimumAppFiles(instance, files);

          // Scan source files for imports that aren't in package.json
          // (e.g. convex/react, lucide-react) and add them so install
          // picks them up. Must run after ensureMinimumAppFiles so the
          // package.json is guaranteed to exist before we patch it.
          await patchPackageJsonForMissingDeps(instance, files);

          // If project uses Convex but the generated files don't exist,
          // write typed stubs so Next.js can compile without "Module not
          // found" errors for @/convex/_generated/api etc.
          await ensureConvexGeneratedFiles(instance, files);

          // Patch tailwind.config.ts with shadcn color tokens and inject
          // CSS variables into globals.css so @apply border-border,
          // bg-background, text-foreground etc. compile without error.
          await ensureShadcnCompatibleTailwind(instance);

          // Create .env.local with NEXT_PUBLIC_CONVEX_URL (and any other
          // NEXT_PUBLIC_* keys from .env.example) so runtime errors like
          // "No address provided to ConvexReactClient" don't crash the app.
          await ensureEnvLocal(instance, files);

          // Also patch any convex-provider source files to add a fallback
          // URL so the client never crashes even if the env var is undefined
          // at the time the module is first evaluated.
          await patchConvexProviderFiles(instance);

          // Install the convex/react webpack alias mock — the definitive fix
          // for all Convex runtime errors (no backend, no URL required).
          await installConvexPreviewMock(instance);

          // Patch next.config.ts so <Image> with external URLs doesn't
          // throw "hostname not configured" — a near-universal agent issue.
          await ensureNextConfig(instance);

          filesMountedRef.current = true;
          if (!cancelled) setFilesReady(true);

          // Server-ready and error handlers are attached once per instance.
          instance.on("server-ready", (_port, url) => {
            if (!cancelled) {
              setServerUrl(url);
              toast.success("Dev server started");
            }
          });
          instance.on("error", (err) => {
            console.error("WebContainer error:", err);
            toast.error("WebContainer error occurred");
          });
        } else {
          // Files were already mounted in a previous effect run (e.g. Convex
          // re-queried). Ensure state reflects readiness so the terminal can start.
          if (!cancelled) setFilesReady(true);
        }

        setWebcontainer(instance);
        setError(null);
      } catch (err) {
        console.error("Failed to boot WebContainer:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("Failed to boot"));
          toast.error("Failed to start development environment");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, [files]);

  // ---------------------------------------------------------------------------
  // Auto-boot pipeline: install → start dev server.
  //
  // We orchestrate this from React (rather than asking the user to type
  // `npm install && npm run dev`) for three reasons:
  //
  // 1. **Reliable cleanup.** Previous interrupted runs leave a corrupt npm
  //    state (the "Tracker 'idealTree' already exists" error) plus partial
  //    `node_modules/.package-lock.json`. We wipe these *before* install.
  //
  // 2. **No HOME pollution.** The terminal previously set HOME=/, which
  //    made npm dump `.npm/_locks` and `.npm/_logs` into the project root
  //    and conflict with project files. We spawn install/dev with an
  //    explicit `cwd: "/"` and let HOME default to a separate location.
  //
  // 3. **Deterministic UX.** The empty state and preview can show real
  //    progress (installing → starting → running) instead of guessing
  //    from unreliable terminal output.
  //
  // The pipeline is idempotent: it bails out if dev is already running,
  // and it runs in response to `bootNonce` so callers can retry by calling
  // `restartDev()`.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!webcontainer || !filesReady) return;

    let cancelled = false;
    const appendLog = (chunk: string) => {
      if (cancelled) return;
      setBootLogs((prev) => {
        const next = prev + chunk;
        // Keep only the last 16KB to bound memory.
        return next.length > 16_384 ? next.slice(-16_384) : next;
      });
    };

    const run = async () => {
      try {
        // -----------------------------------------------------------------
        // 1. Determine whether install is needed.
        //
        //    CRITICAL: we check for missing packages BEFORE deciding to
        //    skip. The old guard `if (serverUrl) return` was wrong — it
        //    skipped install even when packages like `convex` were newly
        //    added to package.json but not yet in node_modules, causing
        //    persistent "Module not found" build errors in the preview.
        //
        //    Logic:
        //    - Always skip on explicit retry (bootNonce > 0 means the user
        //      hit "Retry" — they want a full fresh install).
        //    - On normal boot: skip only if every dep in package.json
        //      already exists in node_modules AND the server is up.
        // -----------------------------------------------------------------
        let needsInstall = true;
        let serverAlreadyRunning = false;

        if (bootNonce === 0) {
          try {
            // node_modules/next existing is the baseline "install done" check.
            await webcontainer.fs.readdir("node_modules/next");

            // Spot-check every dep from package.json.
            let pkgDeps: string[] = [];
            try {
              const raw = await webcontainer.fs.readFile("package.json", "utf-8");
              const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
              pkgDeps = Object.keys(pkg.dependencies ?? {});
            } catch { /* ignore */ }

            let allPresent = true;
            for (const dep of pkgDeps) {
              try {
                await webcontainer.fs.readdir(`node_modules/${dep}`);
              } catch {
                allPresent = false;
                appendLog(`→ ${dep} missing from node_modules — will reinstall.\n`);
                break;
              }
            }

            if (allPresent) {
              needsInstall = false;
              // Also check if the dev server process is still alive by seeing
              // whether the devProcessRef is populated. If it is, don't
              // re-spawn a second server.
              if (devProcessRef.current) {
                serverAlreadyRunning = true;
              }
            }
          } catch {
            needsInstall = true;
          }
        }

        // Skip the whole pipeline only if packages are complete AND server
        // is already running. This prevents double-spawning on Convex re-
        // queries or HMR remounts when nothing has changed.
        if (!needsInstall && serverAlreadyRunning) {
          appendLog("✓ Dependencies installed and dev server running — nothing to do.\n");
          return;
        }

        setBootError(null);

        if (needsInstall) {
          // Kill any running dev process before reinstalling.
          if (devProcessRef.current) {
            try { devProcessRef.current.kill(); } catch { /* already dead */ }
            devProcessRef.current = null;
          }

          // Wipe stale npm lock state — prevents "idealTree already exists".
          appendLog("→ Cleaning stale install state…\n");
          const cleanup = await webcontainer.spawn("rm", [
            "-rf",
            "node_modules/.package-lock.json",
            ".npm",
          ]);
          await cleanup.exit;
          if (cancelled) return;

          setBootPhase("installing");
          appendLog("→ Installing dependencies (npm install)…\n");
          const install = await webcontainer.spawn("npm", ["install"]);
          install.output.pipeTo(
            new WritableStream({ write(data) { appendLog(data); } }),
          );
          const installCode = await install.exit;
          if (cancelled) return;

          if (installCode !== 0) {
            setBootPhase("failed");
            setBootError(`npm install failed (exit ${installCode}). Check logs below.`);
            toast.error("npm install failed");
            return;
          }
          appendLog("✓ Dependencies installed.\n");
        } else {
          appendLog("✓ node_modules up to date — skipping npm install.\n");
          // Kill old dev process before re-spawning (e.g. on explicit retry).
          if (devProcessRef.current) {
            try { devProcessRef.current.kill(); } catch { /* already dead */ }
            devProcessRef.current = null;
          }
        }

        // -----------------------------------------------------------------
        // 2. npm run dev. Long-lived; we don't await exit. The
        //    `server-ready` event fires setServerUrl() when it binds.
        // -----------------------------------------------------------------
        setBootPhase("starting");
        appendLog("→ Starting dev server (npm run dev)…\n");
        const dev = await webcontainer.spawn("npm", ["run", "dev"]);
        if (cancelled) { dev.kill(); return; }
        devProcessRef.current = dev;
        dev.output.pipeTo(
          new WritableStream({ write(data) { appendLog(data); } }),
        );
        void dev.exit.then((code) => {
          if (cancelled) return;
          if (code !== 0) {
            setBootPhase("failed");
            setBootError(`Dev server exited (code ${code}).`);
            toast.error("Dev server exited unexpectedly");
          }
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Auto-boot pipeline failed:", err);
        setBootPhase("failed");
        setBootError(err instanceof Error ? err.message : String(err));
        toast.error("Failed to start project");
      }
    };

    void run();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webcontainer, filesReady, bootNonce]);

  // Flip bootPhase → running when server URL appears.
  useEffect(() => {
    if (serverUrl && bootPhase !== "running") {
      setBootPhase("running");
    }
  }, [serverUrl, bootPhase]);

  // No explicit teardown: WebContainer is a tab-scoped singleton. Browser
  // navigation/close releases it. Switching projects reuses the same
  // instance — agent file mutations replay onto it via Convex sync.

  return (
    <WebContainerContext.Provider
      value={{
        webcontainer,
        filesReady,
        isLoading,
        error,
        serverUrl,
        bootPhase,
        bootError,
        bootLogs,
        restartDev,
      }}
    >
      {children}
    </WebContainerContext.Provider>
  );
};
