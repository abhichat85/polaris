"use client"

import type { ReactNode } from "react"
import { FadeUp, SectionLabel, SectionTitle } from "./section-helpers"

const FAQS: Array<{ q: string; a: ReactNode }> = [
  {
    q: "Is this like Bolt or v0?",
    a: (
      <>
        Superficially, yes — describe something, get code. But Polaris is a
        full cloud IDE: code editor, chat panel, live preview in a real
        sandbox, deploy pipeline. More importantly, it works from a{" "}
        <strong className="font-medium text-foreground/70">
          structured spec that persists across sessions
        </strong>
        . Bolt generates a response; Polaris builds from a plan. And the output
        is standard Next.js + Supabase — nothing proprietary.
      </>
    ),
  },
  {
    q: "Do I need to know how to code?",
    a: (
      <>
        You need to be comfortable{" "}
        <strong className="font-medium text-foreground/70">
          reading code and knowing when something&apos;s wrong
        </strong>
        . Polaris handles the writing; you handle the steering. If you&apos;ve
        never opened a terminal, this might not be the right fit yet. If you
        can read a component and know what it should do, you&apos;ll be
        productive in the first session.
      </>
    ),
  },
  {
    q: "What happens to my code if I cancel?",
    a: (
      <>
        Nothing happens to it. Your code lives in your GitHub from the moment
        you push it. There&apos;s no hosted runtime that disappears — just a
        Next.js app on Vercel and a Supabase project you own.{" "}
        <strong className="font-medium text-foreground/70">
          Your subscription pays for the agent. The output was always yours.
        </strong>
      </>
    ),
  },
  {
    q: "What are the cost guarantees?",
    a: (
      <>
        Every plan has a{" "}
        <strong className="font-medium text-foreground/70">
          hard daily cost ceiling
        </strong>{" "}
        that Polaris will refuse to cross. The Pro plan caps at $20/day, Team
        at $100/day. If the agent is about to do something expensive, it tells
        you first. No surprise bills, ever.
      </>
    ),
  },
]

export function FaqSection() {
  return (
    <section className="bg-surface-1 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="grid items-start gap-12 md:grid-cols-[280px_1fr] md:gap-20">
          <div>
            <FadeUp>
              <SectionLabel>FAQ</SectionLabel>
            </FadeUp>
            <FadeUp delay={0.05} className="mt-4">
              <SectionTitle className="!text-[28px] md:!text-[32px]">
                A few things worth
                <br />
                saying plainly.
              </SectionTitle>
            </FadeUp>
          </div>
          <div className="pt-1">
            {FAQS.map((faq, idx) => (
              <FadeUp key={faq.q} delay={idx * 0.08}>
                <div className="border-b border-foreground/[0.04] py-8 last:border-b-0">
                  <h3 className="mb-3 font-heading text-[15px] font-bold tracking-[-0.02em] text-foreground/85">
                    {faq.q}
                  </h3>
                  <p className="text-[13px] leading-[1.75] text-muted-foreground">
                    {faq.a}
                  </p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
