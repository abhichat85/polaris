import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Praxiom §7.3 — Inputs use surface contrast, never border lines.
 * The `bg-input` token (10% lightness in dark mode) sits one step lighter
 * than the parent surface (background or surface-2), which is the affordance.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md bg-input px-3 py-1 text-sm text-foreground",
        "placeholder:text-muted-foreground/50 file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "selection:bg-primary selection:text-primary-foreground",
        "transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:ring-2 aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
