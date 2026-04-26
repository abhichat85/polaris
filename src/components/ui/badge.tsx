import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Praxiom Design System §7.4 — Status badges & chips.
 * Status variants use low-opacity tinted backgrounds (`success/15`, `warning/15`, etc.)
 * with the matching foreground hue. `destructive` uses `text-destructive-foreground`.
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90",
        outline:
          "bg-transparent text-foreground [a&]:hover:bg-surface-3",
        // Praxiom semantic chips — low-opacity tinted backgrounds
        active:
          "bg-primary/10 text-primary",
        success:
          "bg-success/15 text-success",
        warning:
          "bg-warning/15 text-warning",
        info:
          "bg-info/15 text-info",
        neutral:
          "bg-surface-4 text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
