"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-foreground/[0.04] bg-surface-0/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-15 max-w-[1200px] items-center justify-between px-6 py-4 md:px-12">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span
            className="relative size-[7px] rounded-full bg-primary"
            style={{
              boxShadow:
                "0 0 8px hsl(var(--primary)), 0 0 16px hsl(var(--primary) / 0.3)",
            }}
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-40" />
          </span>
          <span className="font-heading text-[15px] font-bold tracking-[-0.02em] text-foreground">
            Polaris
            <span className="ml-1 font-normal text-muted-foreground/70">
              by Praxiom
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-7 text-[13px]">
          <Link
            href="/pricing"
            className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
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
            className="rounded-md bg-primary px-4 py-1.5 text-[13px] font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-px hover:opacity-90"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  )
}
