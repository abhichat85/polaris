"use client"

import { motion } from "motion/react"

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
}

// ─── Shared pill ─────────────────────────────────────────────────────────────

function FloatingPill({
  label,
  style,
  variant,
}: {
  label: string
  style: React.CSSProperties
  variant: "pain" | "proof"
}) {
  const cls =
    variant === "pain"
      ? "border-red-500/25 bg-red-500/[0.07] text-red-400/80"
      : "border-primary/30 bg-primary/[0.08] text-primary/80"

  return (
    <div
      className={`absolute hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold tracking-[0.02em] lg:flex`}
      style={style}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${variant === "pain" ? "bg-red-500/60" : "bg-primary/60"}`}
      />
      <span className={cls.split(" ").filter((c) => c.startsWith("text-")).join(" ")}>
        {label}
      </span>
    </div>
  )
}

// ─── Pain statement ───────────────────────────────────────────────────────────

export function PainStatementSection() {
  return (
    <section className="relative overflow-hidden bg-[#07070d] py-36 md:py-48">
      {/* Subtle dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        }}
      />

      {/* Faint red glow center */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse, rgba(220,38,38,0.04) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      {/* Floating pain pills */}
      <FloatingPill
        label="Chat loops forever"
        style={{ top: "18%", left: "7%" }}
        variant="pain"
      />
      <FloatingPill
        label="Context lost every session"
        style={{ top: "15%", right: "7%" }}
        variant="pain"
      />
      <FloatingPill
        label="You don't own the output"
        style={{ bottom: "19%", left: "8%" }}
        variant="pain"
      />
      <FloatingPill
        label="No plan, just prompts"
        style={{ bottom: "17%", right: "8%" }}
        variant="pain"
      />

      {/* SVG connector lines — percentage coords relative to section */}
      <svg
        className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
        aria-hidden
        preserveAspectRatio="none"
      >
        <line
          x1="15%"
          y1="23%"
          x2="41%"
          y2="45%"
          stroke="rgba(239,68,68,0.15)"
          strokeWidth="1"
        />
        <line
          x1="85%"
          y1="20%"
          x2="59%"
          y2="43%"
          stroke="rgba(239,68,68,0.15)"
          strokeWidth="1"
        />
        <line
          x1="14%"
          y1="77%"
          x2="40%"
          y2="56%"
          stroke="rgba(239,68,68,0.15)"
          strokeWidth="1"
        />
        <line
          x1="86%"
          y1="76%"
          x2="60%"
          y2="57%"
          stroke="rgba(239,68,68,0.15)"
          strokeWidth="1"
        />
      </svg>

      {/* Center content */}
      <div className="relative mx-auto max-w-[880px] px-6 text-center md:px-12">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-120px" }}
          variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
        >
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="mb-5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/40"
          >
            The problem
          </motion.p>

          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="font-heading text-[42px] font-extrabold leading-[1.07] tracking-[-0.04em] text-foreground md:text-[64px]"
          >
            Most AI tools let you
            <br />
            <span className="text-foreground/25">vibe-code in circles.</span>
          </motion.h2>

          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="mx-auto mt-7 max-w-[540px] text-[15px] leading-[1.75] text-muted-foreground"
          >
            No plan. No spec. No ownership. You end up with a transcript, a
            broken prototype, and a codebase you can&apos;t deploy — because no
            one ever wrote down what you were building.
          </motion.p>
        </motion.div>
      </div>
    </section>
  )
}

// ─── Proof statement ──────────────────────────────────────────────────────────

export function ProofStatementSection() {
  return (
    <section className="relative overflow-hidden bg-surface-1 py-36 md:py-48">
      {/* Subtle dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        }}
      />

      {/* Faint indigo glow center */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse, rgba(77,95,255,0.06) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      {/* Floating proof pills */}
      <FloatingPill
        label="Spec-first, always"
        style={{ top: "18%", left: "7%" }}
        variant="proof"
      />
      <FloatingPill
        label="Ships in under a minute"
        style={{ top: "15%", right: "7%" }}
        variant="proof"
      />
      <FloatingPill
        label="Real Next.js you own"
        style={{ bottom: "19%", left: "8%" }}
        variant="proof"
      />
      <FloatingPill
        label="Deploys to your Vercel"
        style={{ bottom: "17%", right: "8%" }}
        variant="proof"
      />

      {/* SVG connector lines */}
      <svg
        className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
        aria-hidden
        preserveAspectRatio="none"
      >
        <line
          x1="15%"
          y1="23%"
          x2="41%"
          y2="45%"
          stroke="rgba(77,95,255,0.2)"
          strokeWidth="1"
        />
        <line
          x1="85%"
          y1="20%"
          x2="59%"
          y2="43%"
          stroke="rgba(77,95,255,0.2)"
          strokeWidth="1"
        />
        <line
          x1="14%"
          y1="77%"
          x2="40%"
          y2="56%"
          stroke="rgba(77,95,255,0.2)"
          strokeWidth="1"
        />
        <line
          x1="86%"
          y1="76%"
          x2="60%"
          y2="57%"
          stroke="rgba(77,95,255,0.2)"
          strokeWidth="1"
        />
      </svg>

      {/* Center content */}
      <div className="relative mx-auto max-w-[880px] px-6 text-center md:px-12">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-120px" }}
          variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
        >
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="mb-5 text-[11px] font-bold uppercase tracking-[0.1em] text-primary/50"
          >
            The answer
          </motion.p>

          <motion.h2
            variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="font-heading text-[42px] font-extrabold leading-[1.07] tracking-[-0.04em] text-foreground md:text-[64px]"
          >
            Real code. Real infra.
            <br />
            <span className="text-primary">Yours to keep.</span>
          </motion.h2>

          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="mx-auto mt-7 max-w-[540px] text-[15px] leading-[1.75] text-muted-foreground"
          >
            Polaris generates plain Next.js and Supabase — no proprietary
            runtime, no platform lock-in. Push to your GitHub from run one.
            If we vanish tomorrow, your app keeps running.
          </motion.p>
        </motion.div>
      </div>
    </section>
  )
}
