import Link from "next/link"

interface Tier {
  id: "free" | "pro" | "team"
  name: string
  price: string
  cadence?: string
  blurb: string
  features: string[]
  cta: { label: string; href: string }
  highlighted?: boolean
}

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "/month",
    blurb: "Build something real. Free forever.",
    features: [
      "50K Anthropic tokens / month (~100 medium agent runs)",
      "3 projects, 1 deploy / month",
      "Public GitHub repos",
      "Community support",
    ],
    cta: { label: "Start free", href: "/sign-up" },
  },
  {
    id: "pro",
    name: "Pro",
    price: "$20",
    cadence: "/month",
    blurb: "For builders who ship.",
    features: [
      "2M Anthropic tokens / month (~3,000 medium agent runs)",
      "50 projects, 100 deploys / month",
      "Private GitHub repos",
      "Email support — 24h response",
      "Daily $20 cost ceiling",
    ],
    cta: { label: "Upgrade to Pro", href: "/sign-up?plan=pro" },
    highlighted: true,
  },
  {
    id: "team",
    name: "Team",
    price: "$50",
    cadence: "/seat / month",
    blurb: "For startups building together.",
    features: [
      "10M Anthropic tokens / month",
      "200 projects, 500 deploys, 5 seats",
      "Shared workspace",
      "Audit log",
      "Priority support — 4h response",
      "Daily $100 cost ceiling",
    ],
    cta: { label: "Subscribe", href: "/api/billing/checkout?tier=team" },
  },
]

export default function PricingPage() {
  return (
    <section className="bg-surface-0">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-heading text-4xl font-semibold tracking-[-0.02em] text-foreground md:text-5xl">
            Pricing that respects the free tier
          </h1>
          <p className="mt-4 text-muted-foreground">
            Honest limits. No surprise bills. The free plan is genuinely
            useful, not a 14-day trial in disguise.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.id}
              className={`rounded-lg p-7 ${
                t.highlighted ? "bg-surface-3" : "bg-surface-2"
              }`}
            >
              <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
                {t.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.blurb}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="font-heading text-4xl font-semibold text-foreground">
                  {t.price}
                </span>
                {t.cadence && (
                  <span className="text-sm text-muted-foreground">{t.cadence}</span>
                )}
              </div>

              <ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {t.id === "pro" || t.id === "team" ? (
                <form
                  method="POST"
                  action="/api/billing/checkout"
                  className="mt-8"
                >
                  <input type="hidden" name="tier" value={t.id} />
                  <button
                    type="submit"
                    className={`block w-full rounded-md px-4 py-2 text-center text-sm font-medium transition-opacity ${
                      t.highlighted
                        ? "bg-primary text-primary-foreground hover:opacity-90"
                        : "bg-surface-4 text-foreground hover:bg-surface-3"
                    }`}
                  >
                    {t.cta.label}
                  </button>
                </form>
              ) : (
                <Link
                  href={t.cta.href}
                  className={`mt-8 block rounded-md px-4 py-2 text-center text-sm font-medium ${
                    t.highlighted
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "bg-surface-4 text-foreground hover:bg-surface-3"
                  }`}
                >
                  {t.cta.label}
                </Link>
              )}
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-sm text-muted-foreground">
          All plans include the daily cost ceiling. We will NEVER let you
          accidentally spend more than your plan caps. Article XVII §17.4.
        </p>
      </div>
    </section>
  )
}
