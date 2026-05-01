"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { FadeUp } from "./section-helpers"

export function CtaSection() {
  return (
    <section className="relative overflow-hidden bg-surface-0 px-6 py-32 md:py-40">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[400px] w-[800px] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(ellipse, rgba(77,95,255,0.1) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-[600px] text-center">
        <FadeUp>
          <div className="mb-6 text-[11px] font-bold uppercase tracking-[0.09em] text-muted-foreground/50">
            Get started today
          </div>
        </FadeUp>
        <FadeUp delay={0.05}>
          <h2 className="mb-5 font-heading text-[40px] font-extrabold leading-[1.05] tracking-[-0.04em] text-foreground md:text-[48px]">
            Your spec is waiting.
            <br />
            Start writing it.
          </h2>
        </FadeUp>
        <FadeUp delay={0.1}>
          <p className="mb-10 text-[15px] leading-[1.65] text-muted-foreground">
            Free to start. No credit card. Your first app can be live in under
            two minutes.
          </p>
        </FadeUp>
        <FadeUp delay={0.15}>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-[7px] bg-primary px-7 py-3.5 text-[15px] font-semibold tracking-[-0.01em] text-primary-foreground shadow-[0_0_0_1px_rgba(77,95,255,0.3),0_4px_24px_rgba(77,95,255,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-[0_0_0_1px_rgba(77,95,255,0.4),0_8px_32px_rgba(77,95,255,0.35)]"
          >
            Start building free
            <ArrowRight className="size-4" />
          </Link>
        </FadeUp>
        <FadeUp delay={0.2}>
          <div className="mt-5 text-xs text-muted-foreground/50">
            or{" "}
            <Link
              href="/pricing"
              className="text-muted-foreground hover:text-foreground"
            >
              read the pricing →
            </Link>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}
