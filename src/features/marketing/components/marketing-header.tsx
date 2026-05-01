"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div className="sticky top-0 z-50 px-4 pt-4 pb-0 md:px-8">
      <header
        className={`mx-auto flex h-[56px] max-w-[1200px] items-center justify-between rounded-xl border px-5 transition-all duration-300 md:px-8 ${
          scrolled
            ? "border-foreground/[0.08] bg-surface-1/90 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl"
            : "border-foreground/[0.07] bg-surface-1/80 backdrop-blur-md"
        }`}
      >
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src="/polaris_logo_dark.png"
            alt="Polaris"
            height={20}
            width={80}
            className="object-contain object-left"
            priority
          />
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-6 text-[13px]">
          {/* Early access social proof */}
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] text-emerald-400/80 md:flex">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400/70" />
            Early access open
          </span>

          <Link
            href="/pricing"
            className="hidden text-muted-foreground/80 transition-colors hover:text-foreground sm:block"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="hidden text-muted-foreground/80 transition-colors hover:text-foreground sm:block"
          >
            About
          </Link>
          <Link
            href="/sign-in"
            className="hidden text-muted-foreground/80 transition-colors hover:text-foreground sm:block"
          >
            Sign in
          </Link>

          {/* Divider */}
          <span className="hidden h-4 w-px bg-foreground/[0.08] sm:block" />

          <Link
            href="/sign-up"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-[7px] text-[13px] font-semibold tracking-[-0.01em] text-primary-foreground shadow-[0_2px_12px_rgba(77,95,255,0.35)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_4px_20px_rgba(77,95,255,0.45)] hover:opacity-95"
          >
            Get started
            <ArrowRight className="size-3.5" />
          </Link>
        </nav>
      </header>
    </div>
  )
}
