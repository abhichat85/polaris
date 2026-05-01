import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight } from "lucide-react"

export const metadata: Metadata = {
  title: "About Polaris — by Praxiom",
  description:
    "Polaris is a spec-driven AI cloud IDE that turns user research into shipped Next.js applications you own.",
}

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-surface-0 px-6 pb-24 pt-32 md:px-12 md:pb-32 md:pt-40">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 size-[600px] -translate-x-1/2"
          style={{
            background:
              "radial-gradient(ellipse, rgba(77,95,255,0.08) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
        <div className="relative mx-auto max-w-[800px]">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.08] py-[5px] pl-[10px] pr-[14px] text-[11px] font-semibold uppercase tracking-[0.07em] text-primary/90">
            <span className="size-[5px] animate-pulse rounded-full bg-primary" />
            About
          </div>
          <h1 className="font-heading text-[44px] font-extrabold leading-[1.05] tracking-[-0.04em] text-foreground md:text-[56px]">
            Software should be
            <br />
            <span className="text-primary">built from a plan</span>,
            <br />
            <span className="text-foreground/30">not a guess.</span>
          </h1>
          <p className="mt-8 max-w-[640px] text-[17px] leading-[1.7] text-muted-foreground">
            Polaris is built by Praxiom. We&apos;re building the AI cloud IDE
            we wanted to use ourselves — one that respects the founder&apos;s
            time, the engineer&apos;s judgment, and the user&apos;s right to
            own their software.
          </p>
        </div>
      </section>

      {/* Beliefs */}
      <section className="border-t border-foreground/[0.03] bg-surface-1 px-6 py-24 md:px-12 md:py-32">
        <div className="mx-auto max-w-[800px]">
          <div className="mb-16">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.09em] text-primary">
              What we believe
            </div>
            <h2 className="font-heading text-[32px] font-extrabold leading-[1.1] tracking-[-0.035em] text-foreground md:text-[40px]">
              Five things we&apos;re willing
              <br />
              to bet the company on.
            </h2>
          </div>

          <div className="space-y-12">
            <Belief
              n="01"
              title="The gap from idea to running app should be measured in minutes."
              body="Not weeks. Not even days. The cost of validating an idea badly is now low enough that it should be the default. Polaris exists because waiting on engineering should not be the rate-limiting step for product discovery."
            />
            <Belief
              n="02"
              title="A spec is more durable than a chat log."
              body="The state of an LLM session lives on a transcript. The state of a project should not. Polaris keeps a structured spec — features, criteria, status — that survives across sessions, model changes, and team handoffs. The spec is the contract; the code follows."
            />
            <Belief
              n="03"
              title="You should always own what you build."
              body="No proprietary runtimes. No lock-in to our hosted environment. No export step that breaks half the imports. Polaris generates plain Next.js + Supabase. Push to your GitHub from day one. If we disappear, your software keeps running."
            />
            <Belief
              n="04"
              title="The agent should never spend money you didn't authorize."
              body="Every plan has a hard daily cost ceiling. The agent will refuse to cross it. If something is about to be expensive, you see it first. We will never optimize for token consumption at our users' expense."
            />
            <Belief
              n="05"
              title="Honest about what we are not."
              body="Polaris is not a Cursor replacement for senior engineers. It's not a no-code tool for non-technical users. It's not enterprise-ready (yet). We're built for a specific kind of builder, and we'd rather serve them well than serve everyone badly."
            />
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="bg-surface-0 px-6 py-24 md:px-12 md:py-32">
        <div className="mx-auto grid max-w-[1100px] items-start gap-16 md:grid-cols-[280px_1fr] md:gap-20">
          <div>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.09em] text-primary">
              The story
            </div>
            <h2 className="font-heading text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] text-foreground md:text-[32px]">
              Why we&apos;re
              <br />
              building this.
            </h2>
          </div>
          <div className="space-y-5 text-[15px] leading-[1.75] text-muted-foreground">
            <p>
              Praxiom is an AI co-pilot for startup founders that turns user
              research into structured product plans. Our customers told us
              the same thing again and again: the synthesis is great, but the
              gap between &quot;here&apos;s the spec&quot; and &quot;here&apos;s the
              app&quot; is still where everything stalls.
            </p>
            <p>
              The existing tools all forced a tradeoff. No-code platforms
              owned your data. Browser-based code generators ran in
              memory-constrained sandboxes that broke at any real complexity.
              Cursor and the other local IDEs are designed for engineers who
              already know what they want — not for founders who are still
              shaping the idea.
            </p>
            <p>
              So we built Polaris: a cloud IDE designed around the spec, not
              the prompt. The agent works from your plan. The output is real
              Next.js. The sandbox is real infrastructure. The deployment is
              your own Vercel and Supabase accounts.{" "}
              <span className="text-foreground/70">
                You stay in the loop. The code stays yours.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="relative overflow-hidden bg-surface-1 px-6 py-32 md:px-12 md:py-40">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2"
          style={{
            background:
              "radial-gradient(ellipse, rgba(77,95,255,0.08) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
        <div className="relative mx-auto max-w-[600px] text-center">
          <h2 className="font-heading text-[36px] font-extrabold leading-[1.05] tracking-[-0.04em] text-foreground md:text-[44px]">
            Tell us what
            <br />
            you&apos;re building.
          </h2>
          <p className="mt-5 text-[15px] leading-[1.65] text-muted-foreground">
            We&apos;re a small team. We read everything. If Polaris is missing
            something you need, write to us — we&apos;re shipping every week.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-[7px] bg-primary px-6 py-3 text-[14px] font-semibold tracking-[-0.01em] text-primary-foreground shadow-[0_0_0_1px_rgba(77,95,255,0.3),0_4px_24px_rgba(77,95,255,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90"
            >
              Try Polaris
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="mailto:hello@praxiomai.xyz"
              className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
            >
              hello@praxiomai.xyz →
            </a>
          </div>
        </div>
      </section>
    </>
  )
}

function Belief({
  n,
  title,
  body,
}: {
  n: string
  title: string
  body: string
}) {
  return (
    <div className="grid gap-6 border-t border-foreground/[0.04] pt-12 first:border-t-0 first:pt-0 md:grid-cols-[80px_1fr] md:gap-10">
      <div
        className="font-heading text-2xl font-black leading-none tracking-[-0.04em]"
        style={{ color: "rgba(77,95,255,0.4)" }}
      >
        {n}
      </div>
      <div>
        <h3 className="mb-3 font-heading text-[20px] font-bold leading-[1.3] tracking-[-0.02em] text-foreground">
          {title}
        </h3>
        <p className="text-[14px] leading-[1.75] text-muted-foreground">
          {body}
        </p>
      </div>
    </div>
  )
}
