/**
 * Deterministic Next.js 15 + Supabase base template.
 * Authority: sub-plan 03 §5, CONSTITUTION §5.4.
 *
 * Every scaffold gets these files; the merge layer guarantees Claude cannot
 * corrupt them. Each file is a real, runnable artifact — no placeholders
 * (CONSTITUTION §4.6).
 *
 * The template is intentionally small. Sub-plan 03 §5 calls for ~30 files;
 * this v1 ships the indispensable subset. Additional shadcn primitives, more
 * routes, etc. should be added as the scaffolder learns what scaffolds need.
 */

import type { GeneratedFile } from "../types"

const PACKAGE_JSON = JSON.stringify(
  {
    name: "polaris-app",
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "next lint",
    },
    dependencies: {
      "@supabase/ssr": "^0.5.0",
      "@supabase/supabase-js": "^2.45.0",
      next: "15.0.0",
      react: "19.0.0",
      "react-dom": "19.0.0",
    },
    devDependencies: {
      "@types/node": "^20",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      tailwindcss: "^4",
      "@tailwindcss/postcss": "^4",
      typescript: "^5",
    },
  },
  null,
  2,
)

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
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
      paths: { "@/*": ["./src/*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
  },
  null,
  2,
)

const NEXT_CONFIG = `import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
}

export default nextConfig
`

const TAILWIND_CONFIG = `import type { Config } from "tailwindcss"

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
`

const POSTCSS_CONFIG = `export default {
  plugins: { "@tailwindcss/postcss": {} },
}
`

const GITIGNORE = `node_modules/
.next/
.env*
!.env.example
.DS_Store
`

const ENV_EXAMPLE = `NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
`

const MIDDLEWARE = `import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            res.cookies.set({ name, value, ...options })
          })
        },
      },
    },
  )
  await supabase.auth.getUser()
  return res
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
`

const UTILS = `export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ")
}
`

const SUPABASE_CLIENT = `import { createBrowserClient } from "@supabase/ssr"

export function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
`

const SUPABASE_SERVER = `import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            cookieStore.set({ name, value, ...options })
          }
        },
      },
    },
  )
}
`

const BUTTON = `import { cn } from "@/lib/utils"

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost"
}

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  const variants = {
    default: "bg-foreground text-background hover:opacity-90",
    outline: "border border-foreground/20 hover:bg-foreground/5",
    ghost: "hover:bg-foreground/5",
  }
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
`

const CARD = `import { cn } from "@/lib/utils"

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-foreground/10 bg-background p-4", className)} {...props} />
}
`

const INPUT = `import { cn } from "@/lib/utils"

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-foreground/15 bg-background px-3 py-1 text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}
`

const GLOBALS_CSS = `@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #0a0a0a;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
`

const LAYOUT = `import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Polaris App",
  description: "Built with Polaris",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`

const PAGE_PLACEHOLDER = `export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-medium">Welcome to your Polaris app</h1>
        <p className="mt-2 text-foreground/60">Edit src/app/page.tsx to get started.</p>
      </div>
    </main>
  )
}
`

const README = `# Polaris App

This project was scaffolded with [Polaris](https://getpolaris.xyz).

## Getting Started

\`\`\`bash
npm install
cp .env.example .env.local   # fill in Supabase credentials
npm run dev
\`\`\`
`

export const NEXTJS_SUPABASE_TEMPLATE: GeneratedFile[] = [
  { path: "package.json", content: PACKAGE_JSON },
  { path: "tsconfig.json", content: TSCONFIG },
  { path: "next.config.ts", content: NEXT_CONFIG },
  { path: "tailwind.config.ts", content: TAILWIND_CONFIG },
  { path: "postcss.config.mjs", content: POSTCSS_CONFIG },
  { path: ".gitignore", content: GITIGNORE },
  { path: ".env.example", content: ENV_EXAMPLE },
  { path: "src/middleware.ts", content: MIDDLEWARE },
  { path: "src/lib/utils.ts", content: UTILS },
  { path: "src/lib/supabase/client.ts", content: SUPABASE_CLIENT },
  { path: "src/lib/supabase/server.ts", content: SUPABASE_SERVER },
  { path: "src/components/ui/button.tsx", content: BUTTON },
  { path: "src/components/ui/card.tsx", content: CARD },
  { path: "src/components/ui/input.tsx", content: INPUT },
  { path: "src/app/globals.css", content: GLOBALS_CSS },
  { path: "src/app/layout.tsx", content: LAYOUT },
  { path: "src/app/page.tsx", content: PAGE_PLACEHOLDER },
  { path: "README.md", content: README },
]
