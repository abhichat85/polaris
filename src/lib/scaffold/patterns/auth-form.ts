export const PATTERN_AUTH_FORM = `/**
 * Pattern: Auth form (Clerk sign-in / sign-up).
 *
 * When to use: any \`/sign-in\` or \`/sign-up\` route in a Clerk-backed app.
 *
 * Tokens used (Praxiom):
 *   §3 (color), §4 (radius), §6 (spacing), §10 (form input states)
 *
 * Variants:
 *   - SignInForm vs SignUpForm — pass \`mode\`
 *   - With/without social providers — Clerk components handle this
 */
"use client"

import { SignIn, SignUp } from "@clerk/nextjs"

export interface AuthFormProps {
  mode: "sign-in" | "sign-up"
  redirectAfter?: string
}

export function AuthForm({ mode, redirectAfter = "/dashboard" }: AuthFormProps) {
  const Component = mode === "sign-in" ? SignIn : SignUp
  const heading =
    mode === "sign-in" ? "Welcome back" : "Create your account"
  const subhead =
    mode === "sign-in"
      ? "Sign in to continue."
      : "It only takes a minute."

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {heading}
          </h1>
          <p className="text-sm text-muted-foreground">{subhead}</p>
        </header>

        <Component
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "shadow-none bg-transparent",
            },
          }}
          afterSignInUrl={redirectAfter}
          afterSignUpUrl={redirectAfter}
        />
      </div>
    </main>
  )
}
`
