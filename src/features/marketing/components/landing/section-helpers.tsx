"use client"

import { motion, type Variants } from "motion/react"
import type { ReactNode } from "react"

export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
  },
}

export function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={{
        hidden: { opacity: 0, y: 24 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.65,
            ease: [0.22, 1, 0.36, 1],
            delay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-primary">
      {children}
    </div>
  )
}

export function SectionTitle({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <h2
      className={`font-heading text-[32px] font-extrabold leading-[1.1] tracking-[-0.035em] text-foreground md:text-[40px] ${className}`}
    >
      {children}
    </h2>
  )
}

export function SectionSub({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-[480px] text-[15px] leading-[1.65] text-muted-foreground">
      {children}
    </p>
  )
}
