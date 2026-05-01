"use client"

import { ReactLenis } from "lenis/react"
import "lenis/dist/lenis.css"

export function LenisProvider({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        autoRaf: true,
        lerp: 0.1,
        duration: 1.2,
        smoothWheel: true,
        // Don't smooth touch — native on mobile feels better
        syncTouch: false,
      }}
    >
      {children}
    </ReactLenis>
  )
}
