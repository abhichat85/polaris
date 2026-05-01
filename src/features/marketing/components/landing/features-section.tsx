"use client"

import type { ReactNode } from "react"
import { FadeUp, SectionLabel, SectionTitle } from "./section-helpers"

export function FeaturesSection() {
  return (
    <section className="bg-surface-1 px-6 py-24 md:px-12 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-16 max-w-[560px] md:mb-20">
          <FadeUp>
            <SectionLabel>What makes it different</SectionLabel>
          </FadeUp>
          <FadeUp delay={0.05} className="mt-4">
            <SectionTitle>
              Built for builders
              <br />
              who plan before they code.
            </SectionTitle>
          </FadeUp>
        </div>

        <FeatureBlock
          index="01 / 04"
          title="The spec is the source of truth"
          textLeft
          body={
            <>
              Every Polaris project runs from a living spec: features,
              acceptance criteria, current status. The agent works from that
              plan — not from its last message. When you ask for a change,{" "}
              <strong className="font-medium text-foreground/70">
                the spec updates first
              </strong>
              . You always know what&apos;s being built and why.
            </>
          }
          visual={<SpecListVisual />}
        />

        <FeatureBlock
          index="02 / 04"
          title="You own the output, completely"
          body={
            <>
              Polaris generates standard Next.js with a Supabase backend. No
              proprietary format. No vendor lock-in.{" "}
              <strong className="font-medium text-foreground/70">
                Push to your GitHub the moment you want to
              </strong>{" "}
              — and keep pushing. The code is yours from the first commit, not
              after an export step that breaks things.
            </>
          }
          visual={<GitTerminalVisual />}
        />

        <FeatureBlock
          index="03 / 04"
          title="Real execution, not a preview"
          textLeft
          body={
            <>
              Generated apps run in a cloud sandbox (E2B). You get a live HTTP
              preview URL from the first agent run —{" "}
              <strong className="font-medium text-foreground/70">
                not a code snippet, not a static export
              </strong>
              . If the app breaks, you see it break, and the agent can fix it
              in the same session.
            </>
          }
          visual={<BrowserPreviewVisual />}
        />

        <FeatureBlock
          index="04 / 04"
          title="One click to production"
          body={
            <>
              When you&apos;re ready, Polaris deploys to Vercel and provisions
              a real Supabase project. Auth, database, storage — all wired.{" "}
              <strong className="font-medium text-foreground/70">
                No YAML, no Dockerfile, no infra decisions
              </strong>{" "}
              you didn&apos;t sign up for. Then your GitHub, forever.
            </>
          }
          visual={<DeployVisual />}
        />
      </div>
    </section>
  )
}

function FeatureBlock({
  index,
  title,
  body,
  visual,
  textLeft = false,
}: {
  index: string
  title: string
  body: ReactNode
  visual: ReactNode
  textLeft?: boolean
}) {
  return (
    <div className="grid items-center gap-12 border-t border-foreground/[0.04] py-16 first:border-t-0 first:pt-0 md:grid-cols-2 md:gap-20">
      <FadeUp className={textLeft ? "md:order-1" : "md:order-2"}>
        <div className="mb-5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/50">
          {index}
        </div>
        <h3 className="mb-4 font-heading text-2xl font-extrabold leading-[1.2] tracking-[-0.03em] text-foreground md:text-[28px]">
          {title}
        </h3>
        <p className="text-[14px] leading-[1.75] text-muted-foreground">
          {body}
        </p>
      </FadeUp>
      <FadeUp
        delay={0.1}
        className={textLeft ? "md:order-2" : "md:order-1"}
      >
        <div className="relative min-h-[220px] overflow-hidden rounded-xl bg-surface-2 p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 70% 30%, rgba(77,95,255,0.06) 0%, transparent 70%)",
            }}
          />
          <div className="relative">{visual}</div>
        </div>
      </FadeUp>
    </div>
  )
}

function SpecListVisual() {
  const items = [
    { state: "done", label: "User auth — email + OAuth" },
    { state: "done", label: "Dashboard — project list view" },
    { state: "active", label: "Notifications — Supabase Realtime" },
    { state: "pending", label: "Billing — Stripe checkout" },
    { state: "pending", label: "Deploy — Vercel + Supabase" },
  ] as const

  return (
    <>
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60">
        Feature spec
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-[10px] rounded-md px-3 py-2 text-[12px] ${
              item.state === "active"
                ? "border border-primary/15 bg-primary/[0.08] text-foreground/70"
                : item.state === "done"
                  ? "bg-surface-3 text-muted-foreground/70"
                  : "bg-surface-3 text-muted-foreground/50"
            }`}
          >
            <span
              className={`size-[6px] shrink-0 rounded-full ${
                item.state === "done"
                  ? "bg-[#3ddc84]"
                  : item.state === "active"
                    ? "animate-pulse bg-primary"
                    : "bg-surface-4"
              }`}
            />
            {item.label}
          </div>
        ))}
      </div>
    </>
  )
}

function GitTerminalVisual() {
  return (
    <div className="font-mono text-[11px] leading-[2] text-muted-foreground/60">
      <div>
        <span className="text-primary/70">git</span> push origin main
      </div>
      <div className="text-foreground/20">
        # Enumerating objects: 142, done.
      </div>
      <div className="text-foreground/20">
        # Counting objects: 100% (142/142)
      </div>
      <div className="text-foreground/20">
        # Writing objects: 100% (142/142)
      </div>
      <div className="mt-2">
        <span className="text-primary/70">Branch</span> &apos;
        <span className="text-[#3ddc84]/80">main</span>&apos; set to track
        &apos;<span className="text-[#3ddc84]/80">origin/main</span>&apos;
      </div>
      <div className="mt-1 text-[#3ddc84]/90">✓ Everything up-to-date</div>
      <div className="mt-4 rounded-md bg-surface-3 px-[14px] py-[10px] text-[11px] text-muted-foreground/70">
        <span className="text-[#3ddc84]/90">abhichat85/dashboard-app</span>{" "}
        · Next.js 14 · Supabase · Vercel-ready
      </div>
    </div>
  )
}

function BrowserPreviewVisual() {
  return (
    <div className="flex flex-col justify-center gap-[10px]">
      <div className="overflow-hidden rounded-lg bg-surface-3">
        <div className="flex items-center gap-2 border-b border-foreground/[0.04] bg-surface-0 px-3 py-2 text-[11px] text-muted-foreground/70">
          <span className="size-[6px] animate-pulse rounded-full bg-[#3ddc84] shadow-[0_0_6px_rgba(61,220,132,0.5)]" />
          dashboard-app.e2b.dev
        </div>
        <div className="px-[14px] py-4">
          <div className="mb-2 h-[10px] w-[60%] rounded bg-surface-4" />
          <div className="mb-1.5 h-[8px] w-[80%] rounded bg-surface-4/70" />
          <div className="mb-3.5 h-[8px] w-[65%] rounded bg-surface-4/70" />
          <div className="grid grid-cols-3 gap-1.5">
            <div className="h-10 rounded-md border border-foreground/[0.04] bg-surface-2" />
            <div className="h-10 rounded-md border border-foreground/[0.04] bg-surface-2" />
            <div className="h-10 rounded-md border border-primary/15 bg-surface-2" />
          </div>
        </div>
      </div>
      <div className="text-center text-[11px] text-muted-foreground/40">
        Hot-reloads on every agent run
      </div>
    </div>
  )
}

function DeployVisual() {
  const steps = [
    { icon: "▲", name: "Vercel", status: "Deployed to production" },
    { icon: "⚡", name: "Supabase", status: "Project provisioned · DB migrated" },
    { icon: "🐙", name: "GitHub", status: "Pushed to main · You own it" },
  ]
  return (
    <div className="flex flex-col gap-[10px]">
      {steps.map((step, idx) => (
        <div key={step.name}>
          <div className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#3ddc84]/20 bg-[#3ddc84]/[0.06] text-sm">
              {step.icon}
            </div>
            <div>
              <div className="text-[12px] font-semibold text-foreground/80">
                {step.name}
              </div>
              <div className="text-[11px] text-[#3ddc84]/80">
                {step.status}
              </div>
            </div>
          </div>
          {idx < steps.length - 1 && (
            <div className="ml-[15px] h-3 w-px bg-foreground/[0.06]" />
          )}
        </div>
      ))}
    </div>
  )
}
