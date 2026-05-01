"use client"

import { motion } from "motion/react"

const SPEC_ITEMS = [
  {
    status: "done" as const,
    title: "User authentication",
    detail: "Sign up · Sign in · Session handling",
  },
  {
    status: "done" as const,
    title: "Project dashboard",
    detail: "List · Create · Archive",
  },
  {
    status: "active" as const,
    title: "Real-time notifications",
    detail: "Supabase Realtime · in progress",
  },
  {
    status: "pending" as const,
    title: "Stripe billing integration",
    detail: "Pending",
  },
  {
    status: "pending" as const,
    title: "Deploy to Vercel",
    detail: "Pending",
  },
]

export function SpecPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-[14px] bg-surface-1 shadow-[0_0_0_1px_rgba(77,95,255,0.08),0_32px_80px_rgba(0,0,0,0.6),0_0_60px_rgba(77,95,255,0.06)]"
    >
      {/* Window chrome */}
      <div className="flex items-center justify-between bg-surface-2 px-[18px] py-[14px]">
        <div className="flex gap-[6px]">
          <div className="size-[10px] rounded-full bg-surface-4" />
          <div className="size-[10px] rounded-full bg-surface-4" />
          <div className="size-[10px] rounded-full bg-surface-4" />
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">
          spec.json — dashboard-app
        </div>
        <div className="rounded-[4px] border border-primary/20 bg-primary/10 px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.05em] text-primary">
          Building…
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60">
          Project spec
        </div>

        <div className="space-y-1">
          {SPEC_ITEMS.map((item, idx) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.5 + idx * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={`flex items-start gap-[10px] rounded-md px-3 py-[9px] ${
                item.status === "active"
                  ? "border border-primary/15 bg-primary/[0.06]"
                  : "bg-surface-3"
              }`}
            >
              <div
                className={`mt-[5px] size-[7px] shrink-0 rounded-full ${
                  item.status === "done"
                    ? "bg-[#3ddc84] shadow-[0_0_6px_rgba(61,220,132,0.4)]"
                    : item.status === "active"
                      ? "animate-pulse bg-primary shadow-[0_0_6px_rgba(77,95,255,0.5)]"
                      : "bg-surface-4"
                }`}
              />
              <div className="text-[12px] leading-[1.4]">
                <div
                  className={
                    item.status === "active"
                      ? "text-foreground/80"
                      : item.status === "done"
                        ? "text-muted-foreground"
                        : "text-muted-foreground/70"
                  }
                >
                  {item.title}
                </div>
                <div className="mt-[2px] text-[10px] text-muted-foreground/50">
                  {item.detail}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="my-4 h-px bg-foreground/[0.04]" />

        {/* Chat preview */}
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60">
          Agent chat
        </div>

        <div className="space-y-[10px]">
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.0 }}
            className="flex items-start gap-[10px]"
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-3 text-[11px] font-bold text-muted-foreground">
              A
            </div>
            <div className="max-w-[320px] rounded-lg bg-surface-3 px-3 py-2 text-[12px] leading-[1.5] text-muted-foreground">
              Add a notification badge to the nav — red dot when there are
              unread items
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.3 }}
            className="flex items-start gap-[10px]"
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/20 text-[11px] font-bold text-primary">
              P
            </div>
            <div className="rounded-lg bg-surface-3 px-3 py-[10px]">
              <TypingIndicator />
            </div>
          </motion.div>
        </div>

        {/* Live preview strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.5 }}
          className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-surface-0 px-[14px] py-[10px]"
        >
          <div className="font-mono text-[11px] text-muted-foreground/60">
            dashboard-app.e2b.dev/preview
          </div>
          <div className="flex items-center gap-[5px] text-[10px] font-bold uppercase tracking-[0.06em] text-[#3ddc84]">
            <span className="size-[6px] animate-pulse rounded-full bg-[#3ddc84] shadow-[0_0_6px_rgba(61,220,132,0.6)]" />
            Live
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-[5px] rounded-full bg-muted-foreground/40"
          style={{
            animation: `typingBounce 1.2s ease ${i * 0.15}s infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes typingBounce {
          0%,
          80%,
          100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          40% {
            transform: translateY(-5px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
