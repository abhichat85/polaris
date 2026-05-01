"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { FadeUp, SectionLabel, SectionSub, SectionTitle } from "./section-helpers"

interface Tier {
  name: string
  price: string
  cadence: string
  blurb: string
  features: string[]
  cta: { label: string; href: string }
  highlighted?: boolean
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "/ month",
    blurb: "Build something real. No trial period.",
    features: [
      "50K tokens / month (~100 agent runs)",
      "3 projects, 1 deploy",
      "Public GitHub repos",
      "Community support",
    ],
    cta: { label: "Start free", href: "/sign-up" },
  },
  {
    name: "Pro",
    price: "$20",
    cadence: "/ month",
    blurb: "For builders who ship.",
    features: [
      "2M tokens / month (~3,000 agent runs)",
      "50 projects, 100 deploys",
      "Private GitHub repos",
      "Email support — 24h response",
      "Daily $20 cost ceiling",
    ],
    cta: { label: "Upgrade to Pro", href: "/sign-up?plan=pro" },
    highlighted: true,
  },
  {
    name: "Team",
    price: "$50",
    cadence: "/ seat / month",
    blurb: "For startups building together.",
    features: [
      "10M tokens / month",
      "200 projects, 5 seats",
      "Shared workspace + audit log",
      "Priority support — 4h response",
      "Daily $100 cost ceiling",
    ],
    cta: { label: "Subscribe", href: "/sign-up?plan=team" },
  },
]

export function PricingTeaserSection() {
  return (
    <section className="bg-surface-0 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-16 max-w-[480px]">
          <FadeUp>
            <SectionLabel>Pricing</SectionLabel>
          </FadeUp>
          <FadeUp delay={0.05} className="mt-4">
            <SectionTitle>
              Honest limits.
              <br />
              No surprises.
            </SectionTitle>
          </FadeUp>
          <FadeUp delay={0.1} className="mt-4">
            <SectionSub>
              Every plan includes a hard daily cost ceiling. You will never
              accidentally spend more than your tier allows.
            </SectionSub>
          </FadeUp>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {TIERS.map((tier, idx) => (
            <FadeUp key={tier.name} delay={idx * 0.08}>
              <div
                className={`relative h-full overflow-hidden rounded-2xl border p-8 ${
                  tier.highlighted
                    ? "border-primary/30 bg-surface-2 shadow-[0_0_0_1px_rgba(77,95,255,0.1),0_0_60px_rgba(77,95,255,0.08)]"
                    : "border-foreground/[0.05] bg-surface-1"
                }`}
              >
                {tier.highlighted && (
                  <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-[2px]"
                    style={{
                      background:
                        "linear-gradient(90deg, hsl(var(--primary)), #a060ff)",
                    }}
                  />
                )}
                <div
                  className={`mb-4 text-[12px] font-bold uppercase tracking-[0.07em] ${
                    tier.highlighted ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {tier.name}
                </div>
                <div className="mb-2 flex items-baseline gap-1">
                  <span className="font-heading text-[38px] font-extrabold leading-none tracking-[-0.04em] text-foreground">
                    {tier.price}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {tier.cadence}
                  </span>
                </div>
                <p className="mb-6 text-[13px] leading-[1.5] text-muted-foreground">
                  {tier.blurb}
                </p>
                <div className="mb-5 h-px bg-foreground/[0.04]" />
                <ul className="space-y-2.5">
                  {tier.features.map((feat) => (
                    <li
                      key={feat}
                      className="flex items-start gap-[10px] text-[12px] leading-[1.5] text-muted-foreground"
                    >
                      <span className="text-muted-foreground/30">—</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={tier.cta.href}
                  className={`mt-6 block rounded-[7px] py-[11px] text-center text-[13px] font-semibold transition-all duration-200 hover:-translate-y-px hover:opacity-90 ${
                    tier.highlighted
                      ? "bg-primary text-primary-foreground shadow-[0_4px_20px_rgba(77,95,255,0.3)]"
                      : "border border-foreground/[0.06] bg-foreground/[0.04] text-foreground/70"
                  }`}
                >
                  {tier.cta.label}
                </Link>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp className="mt-8 text-center text-[12px] text-muted-foreground/60">
          <span>
            Full details and FAQ on the{" "}
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              pricing page
              <ArrowRight className="size-3" />
            </Link>
          </span>
        </FadeUp>
      </div>
    </section>
  )
}
