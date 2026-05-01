"use client"

import { Zap, Wrench, ClipboardList } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { FadeUp, SectionLabel, SectionSub, SectionTitle } from "./section-helpers"

const PERSONAS: Array<{
  Icon: LucideIcon
  title: string
  body: string
  notFor: string
}> = [
  {
    Icon: Zap,
    title: "The founder who moves fast",
    body: "You know what you want to build — often from real user research. You need to validate it without waiting weeks for engineering. You'll read the code, but you shouldn't have to write all of it.",
    notFor:
      "Not a replacement for your engineering team — a force multiplier before you have one.",
  },
  {
    Icon: Wrench,
    title: "The builder who owns their stack",
    body: "You've been burned by no-code lock-in before. You want AI assistance without the proprietary format. You're comfortable in a terminal and expect to take the code somewhere eventually.",
    notFor:
      "You need to be comfortable reading what Polaris generates. Pure no-code isn't the goal here.",
  },
  {
    Icon: ClipboardList,
    title: "The PM who can prototype",
    body: "Strong opinions about product behavior. Enough technical fluency to specify them precisely. You want to show stakeholders something real, not a Figma file that needs six more meetings.",
    notFor:
      "Not a Cursor replacement. Professional engineers working locally already have better tools.",
  },
]

export function ForSection() {
  return (
    <section className="relative overflow-hidden bg-surface-0 px-6 py-24 md:px-12 md:py-32">
      {/* Wide primary-tinted grid — strong edge fade, full in the card area */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(77,95,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(77,95,255,0.04) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
        }}
      />
      {/* Horizontal lines only — subtle ruled-paper texture over the card strip */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)",
          backgroundSize: "80px 40px",
          maskImage:
            "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)",
        }}
      />
      <div className="relative mx-auto max-w-[1200px]">
        <FadeUp>
          <SectionLabel>Who it&apos;s for</SectionLabel>
        </FadeUp>
        <FadeUp delay={0.05} className="mt-4">
          <SectionTitle>
            Built for a specific
            <br />
            kind of builder.
          </SectionTitle>
        </FadeUp>
        <FadeUp delay={0.1} className="mt-4">
          <SectionSub>
            Polaris is deliberately not for everyone. These are the people
            it&apos;s designed around.
          </SectionSub>
        </FadeUp>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {PERSONAS.map((p, idx) => (
            <FadeUp key={p.title} delay={idx * 0.1}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-foreground/[0.04] bg-surface-1 p-9 transition-all duration-300 hover:-translate-y-1 hover:border-primary/20">
                <div
                  aria-hidden
                  className="absolute inset-x-5 top-[-1px] h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)",
                  }}
                />
                <div className="mb-5 flex size-10 items-center justify-center rounded-[10px] border border-primary/20 bg-primary/[0.1] text-primary">
                  <p.Icon className="size-[18px]" strokeWidth={1.75} />
                </div>
                <h3 className="mb-3 font-heading text-base font-bold tracking-[-0.02em] text-foreground">
                  {p.title}
                </h3>
                <p className="text-[13px] leading-[1.65] text-muted-foreground">
                  {p.body}
                </p>
                <div className="mt-5 border-t border-foreground/[0.04] pt-5 text-[11px] leading-[1.6] text-muted-foreground/60">
                  {p.notFor}
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}
