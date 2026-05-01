import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight, Check } from "lucide-react"

export const metadata: Metadata = {
  title: "Pricing — Polaris by Praxiom",
  description:
    "Honest limits. No surprise bills. Free tier with 50K tokens/month, Pro at $20/month, Team at $50/seat/month.",
}

interface Tier {
  id: "free" | "pro" | "team"
  name: string
  price: string
  cadence?: string
  blurb: string
  features: Array<{ label: string; emphasized?: boolean }>
  cta: { label: string; href: string }
  highlighted?: boolean
}

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "/ month",
    blurb: "Build something real. No trial period.",
    features: [
      { label: "50K Anthropic tokens / month" },
      { label: "~100 medium agent runs" },
      { label: "3 projects, 1 deploy / month" },
      { label: "Public GitHub repos" },
      { label: "Community support" },
    ],
    cta: { label: "Start free", href: "/sign-up" },
  },
  {
    id: "pro",
    name: "Pro",
    price: "$20",
    cadence: "/ month",
    blurb: "For builders who ship.",
    features: [
      { label: "2M Anthropic tokens / month", emphasized: true },
      { label: "~3,000 medium agent runs" },
      { label: "50 projects, 100 deploys / month" },
      { label: "Private GitHub repos" },
      { label: "Email support — 24h response" },
      { label: "Daily $20 cost ceiling" },
    ],
    cta: { label: "Upgrade to Pro", href: "/sign-up?plan=pro" },
    highlighted: true,
  },
  {
    id: "team",
    name: "Team",
    price: "$50",
    cadence: "/ seat / month",
    blurb: "For startups building together.",
    features: [
      { label: "10M Anthropic tokens / month", emphasized: true },
      { label: "200 projects, 500 deploys" },
      { label: "5 seats included" },
      { label: "Shared workspace + audit log" },
      { label: "Priority support — 4h response" },
      { label: "Daily $100 cost ceiling" },
    ],
    cta: { label: "Subscribe", href: "/sign-up?plan=team" },
  },
]

const FAQS = [
  {
    q: "What counts against my token budget?",
    a: "Every Claude API call the agent makes — generating code, planning, reading files in your project. Idle chat in the editor (without invoking the agent) does not. We display token usage in real time so there are no surprises.",
  },
  {
    q: "What happens when I hit my token limit?",
    a: "The agent pauses. You can wait until the next billing cycle, upgrade, or buy a top-up bundle. Your projects and code remain untouched and accessible. Polaris will never delete or restrict your work for hitting a token cap.",
  },
  {
    q: "Can I bring my own API keys?",
    a: "Not in v1. We proxy Claude through our infrastructure to enforce the daily cost ceiling and rate limits that protect you from runaway agent loops. Bring-your-own-key is on the roadmap once we have a robust client-side budget enforcer.",
  },
  {
    q: "What's the cost ceiling, exactly?",
    a: "A hard daily spend cap that the agent will refuse to cross. Pro plans cap at $20/day, Team at $100/day. If a single agent run is projected to exceed your remaining daily budget, Polaris will ask before proceeding. You can also lower these caps in settings.",
  },
  {
    q: "Do you offer annual pricing?",
    a: "Not yet. We want to earn renewal every month while we're still pre-1.0. Annual pricing arrives once we've shipped enough that you're sure you want a year of it.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Subscriptions are month-to-month. You keep access through the end of your billing period, then drop to free. Your code, deployed apps, and GitHub repos are unaffected — those have always been yours.",
  },
]

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-surface-0 px-6 pb-20 pt-32 md:px-12 md:pb-24 md:pt-40">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 size-[700px] -translate-x-1/2"
          style={{
            background:
              "radial-gradient(ellipse, rgba(77,95,255,0.08) 0%, transparent 70%)",
            filter: "blur(100px)",
          }}
        />
        <div className="relative mx-auto max-w-[800px] text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.08] py-[5px] pl-[10px] pr-[14px] text-[11px] font-semibold uppercase tracking-[0.07em] text-primary/90">
            <span className="size-[5px] animate-pulse rounded-full bg-primary" />
            Pricing
          </div>
          <h1 className="font-heading text-[44px] font-extrabold leading-[1.05] tracking-[-0.04em] text-foreground md:text-[56px]">
            Honest limits.
            <br />
            <span className="text-foreground/30">No surprises.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[560px] text-[16px] leading-[1.7] text-muted-foreground">
            The free plan is genuinely useful, not a 14-day trial in disguise.
            Every paid plan ships with a hard daily cost ceiling — Polaris
            will never let you spend more than you authorized.
          </p>
        </div>
      </section>

      {/* Tiers */}
      <section className="bg-surface-0 px-6 pb-32 md:px-12">
        <div className="mx-auto max-w-[1100px]">
          <div className="grid gap-3 md:grid-cols-3">
            {TIERS.map((tier) => (
              <div
                key={tier.id}
                className={`relative h-full overflow-hidden rounded-2xl border p-8 ${
                  tier.highlighted
                    ? "border-primary/30 bg-surface-2 shadow-[0_0_0_1px_rgba(77,95,255,0.1),0_0_60px_rgba(77,95,255,0.08)]"
                    : "border-foreground/[0.05] bg-surface-1"
                }`}
              >
                {tier.highlighted && (
                  <>
                    <div
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-[2px]"
                      style={{
                        background:
                          "linear-gradient(90deg, hsl(var(--primary)), #a060ff)",
                      }}
                    />
                    <div className="absolute right-6 top-6 rounded-full border border-primary/30 bg-primary/[0.1] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-primary">
                      Most popular
                    </div>
                  </>
                )}

                <div
                  className={`mb-4 text-[12px] font-bold uppercase tracking-[0.07em] ${
                    tier.highlighted ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {tier.name}
                </div>

                <div className="mb-2 flex items-baseline gap-1">
                  <span className="font-heading text-[44px] font-extrabold leading-none tracking-[-0.04em] text-foreground">
                    {tier.price}
                  </span>
                  {tier.cadence && (
                    <span className="text-[13px] text-muted-foreground">
                      {tier.cadence}
                    </span>
                  )}
                </div>

                <p className="mb-6 text-[13px] leading-[1.5] text-muted-foreground">
                  {tier.blurb}
                </p>

                <Link
                  href={tier.cta.href}
                  className={`mb-7 block rounded-[7px] py-3 text-center text-[13px] font-semibold transition-all duration-200 hover:-translate-y-px hover:opacity-90 ${
                    tier.highlighted
                      ? "bg-primary text-primary-foreground shadow-[0_4px_20px_rgba(77,95,255,0.3)]"
                      : "border border-foreground/[0.08] bg-foreground/[0.04] text-foreground/80"
                  }`}
                >
                  {tier.cta.label}
                </Link>

                <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/50">
                  Includes
                </div>
                <ul className="space-y-3">
                  {tier.features.map((feat) => (
                    <li
                      key={feat.label}
                      className="flex items-start gap-2.5 text-[13px] leading-[1.5]"
                    >
                      <Check
                        className={`mt-0.5 size-3.5 shrink-0 ${
                          feat.emphasized
                            ? "text-primary"
                            : "text-muted-foreground/50"
                        }`}
                        strokeWidth={2.5}
                      />
                      <span
                        className={
                          feat.emphasized
                            ? "text-foreground/85"
                            : "text-muted-foreground"
                        }
                      >
                        {feat.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-xl border border-foreground/[0.05] bg-surface-1 px-6 py-5">
            <div className="flex items-start gap-3 text-[13px] leading-[1.65] text-muted-foreground">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/[0.1] text-primary">
                <span className="size-1.5 rounded-full bg-primary" />
              </span>
              <span>
                <strong className="font-semibold text-foreground/80">
                  Cost ceiling guarantee.
                </strong>{" "}
                Every paid plan includes a hard daily spend cap. Polaris will
                refuse to exceed it. If a single agent run is projected to
                cross your remaining budget, you&apos;ll be asked before
                proceeding.{" "}
                <span className="text-muted-foreground/60">
                  See Article XVII §17.4 of the Polaris Constitution.
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-foreground/[0.03] bg-surface-1 px-6 py-24 md:px-12 md:py-32">
        <div className="mx-auto max-w-[1100px]">
          <div className="grid items-start gap-12 md:grid-cols-[280px_1fr] md:gap-20">
            <div>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.09em] text-primary">
                Pricing FAQ
              </div>
              <h2 className="font-heading text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] text-foreground md:text-[32px]">
                What you should
                <br />
                know first.
              </h2>
            </div>
            <div>
              {FAQS.map((faq) => (
                <div
                  key={faq.q}
                  className="border-b border-foreground/[0.04] py-7 last:border-b-0"
                >
                  <h3 className="mb-3 font-heading text-[15px] font-bold tracking-[-0.02em] text-foreground/85">
                    {faq.q}
                  </h3>
                  <p className="text-[13px] leading-[1.75] text-muted-foreground">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-surface-0 px-6 py-32 md:py-40">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[700px] -translate-x-1/2 -translate-y-1/2"
          style={{
            background:
              "radial-gradient(ellipse, rgba(77,95,255,0.1) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div className="relative mx-auto max-w-[600px] text-center">
          <h2 className="font-heading text-[36px] font-extrabold leading-[1.05] tracking-[-0.04em] text-foreground md:text-[44px]">
            Start on the free tier.
            <br />
            Upgrade when it earns it.
          </h2>
          <p className="mt-5 text-[15px] leading-[1.65] text-muted-foreground">
            No credit card required. Your first app can be live in under two
            minutes.
          </p>
          <Link
            href="/sign-up"
            className="mt-10 inline-flex items-center gap-2 rounded-[7px] bg-primary px-7 py-3.5 text-[15px] font-semibold tracking-[-0.01em] text-primary-foreground shadow-[0_0_0_1px_rgba(77,95,255,0.3),0_4px_24px_rgba(77,95,255,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90"
          >
            Start building free
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </>
  )
}
