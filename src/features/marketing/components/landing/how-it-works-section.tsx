"use client"

import { FadeUp, SectionLabel, SectionSub, SectionTitle } from "./section-helpers"

const STEPS = [
  {
    num: "01",
    title: "Describe it",
    body: "Write what you want to build in plain English. Polaris generates a structured spec — features, criteria, scope — and asks you to confirm it before writing a line of code.",
  },
  {
    num: "02",
    title: "Watch it build",
    body: "A real Next.js + Supabase app appears in a cloud sandbox. Live preview URL from the first agent run. Chat to refine. The spec updates as the code does.",
  },
  {
    num: "03",
    title: "Ship it",
    body: "One click deploys to Vercel with a provisioned Supabase backend. Your code goes to your GitHub. No lock-in, no exit tax — just a codebase you own outright.",
  },
]

export function HowItWorksSection() {
  return (
    <section className="relative overflow-hidden border-t border-foreground/[0.04] bg-surface-2 px-6 py-24 md:px-12 md:py-32">
      {/* Rectangular grid — fades in from bottom where the cards live */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 90% 80% at 50% 110%, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 80% at 50% 110%, black 30%, transparent 75%)",
        }}
      />
      {/* Faint indigo accent grid on top — larger squares for depth layering */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(77,95,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(77,95,255,0.035) 1px, transparent 1px)",
          backgroundSize: "144px 144px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 100%, black 10%, transparent 65%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 100%, black 10%, transparent 65%)",
        }}
      />
      <div className="relative mx-auto max-w-[1200px]">
        <div className="mb-16 grid items-end gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <FadeUp>
              <SectionLabel>How it works</SectionLabel>
            </FadeUp>
            <FadeUp delay={0.05} className="mt-4">
              <SectionTitle>
                From one sentence
                <br />
                to a running app.
              </SectionTitle>
            </FadeUp>
          </div>
          <FadeUp delay={0.1}>
            <SectionSub>
              Three steps. No YAML. No boilerplate. No infrastructure
              decisions you didn&apos;t sign up for.
            </SectionSub>
          </FadeUp>
        </div>

        <div className="grid overflow-hidden rounded-2xl bg-foreground/[0.04] md:grid-cols-3 md:gap-px">
          {STEPS.map((step, idx) => (
            <FadeUp key={step.num} delay={idx * 0.1}>
              <div className="group relative h-full overflow-hidden bg-surface-1 px-9 py-10 transition-colors duration-200 hover:bg-surface-2">
                {/* Top hover line */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[2px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)",
                  }}
                />
                <div
                  className="mb-5 font-heading text-5xl font-black leading-none tracking-[-0.04em]"
                  style={{ color: "rgba(77,95,255,0.1)" }}
                >
                  {step.num}
                </div>
                <h3 className="mb-3 font-heading text-lg font-bold tracking-[-0.02em] text-foreground">
                  {step.title}
                </h3>
                <p className="text-[13px] leading-[1.7] text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}
