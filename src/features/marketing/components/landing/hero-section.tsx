"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { ArrowRight } from "lucide-react"
import { HeroCanvas } from "./hero-canvas"
import { SpecPanel } from "./spec-panel"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <HeroCanvas />

      {/* Glow blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-100px] top-[10%] z-0 size-[600px] rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(ellipse, rgba(77,95,255,0.12) 0%, transparent 70%)",
          filter: "blur(120px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-[200px] z-0 size-[500px] rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(ellipse, rgba(100,60,255,0.08) 0%, transparent 70%)",
          filter: "blur(120px)",
        }}
      />

      {/* Grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage:
            "radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 100%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[100vh] max-w-[1200px] items-center px-6 py-24 md:px-12 md:py-32 lg:py-36">
        <div className="grid w-full items-center gap-12 md:grid-cols-[1fr_480px] md:gap-20">
          {/* Left: copy */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.1 } },
            }}
          >
            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.08] py-[5px] pl-[10px] pr-[14px] text-[11px] font-semibold uppercase tracking-[0.07em] text-primary/90"
            >
              <span className="size-[5px] animate-pulse rounded-full bg-primary" />
              AI Cloud IDE
            </motion.div>

            <motion.h1
              variants={fadeUp}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="font-heading text-[44px] font-extrabold leading-[1.05] tracking-[-0.04em] text-foreground md:text-[56px]"
            >
              The AI IDE that builds
              <br />
              from <span className="text-primary">spec</span>
              <span className="text-foreground/30">, not instinct.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 max-w-[480px] text-base leading-[1.7] text-muted-foreground md:text-[16px]"
            >
              Most AI builders respond to vibes. Polaris works from a{" "}
              <span className="text-foreground/70">structured spec</span> —
              features, acceptance criteria, status — that evolves alongside
              your code. Describe your app, watch it run live, ship it to
              Vercel. You own the whole stack.
            </motion.p>

            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 flex items-center gap-4"
            >
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-[7px] bg-primary px-6 py-3 text-sm font-semibold tracking-[-0.01em] text-primary-foreground shadow-[0_0_0_1px_rgba(77,95,255,0.3),0_4px_24px_rgba(77,95,255,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-[0_0_0_1px_rgba(77,95,255,0.4),0_8px_32px_rgba(77,95,255,0.35)]"
              >
                Start building free
              </Link>
              <Link
                href="/pricing"
                className="group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                See pricing
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.div>

            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 text-xs text-muted-foreground/50"
            >
              No credit card required. Free tier: 50K tokens/month, 1 deploy.
            </motion.div>
          </motion.div>

          {/* Right: spec panel — hidden on mobile */}
          <div className="hidden md:block">
            <SpecPanel />
          </div>
        </div>
      </div>
    </section>
  )
}
