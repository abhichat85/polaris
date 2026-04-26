/**
 * Marketing site header. Uses surface-1, no IDE chrome.
 * Authority: sub-plan 10 Task 8/11; design system §2.3, §1.3.
 */

import Link from "next/link"

export function MarketingHeader() {
  return (
    <header className="bg-surface-1">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="font-heading text-lg font-semibold tracking-tight text-foreground"
        >
          Polaris{" "}
          <span className="font-normal text-muted-foreground">by Praxiom</span>
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/pricing"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            About
          </Link>
          <Link
            href="/sign-in"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  )
}
