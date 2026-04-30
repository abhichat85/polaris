import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Praxiom Design System §7.1
 * - All variants are border-less. Surface contrast (bg-surface-3 on hover) is
 *   the affordance, never a border line.
 * - `destructive` uses `text-destructive-foreground`, never `text-white`.
 * - `transition-colors` (not `transition-all`) for color-only changes.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive",
        outline:
          "bg-transparent text-foreground hover:bg-surface-3",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-surface-3",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-surface-3 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        highlight: "bg-transparent hover:bg-surface-3",
      },
      size: {
        default: "h-9 px-3 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
        "icon-xs": "size-5.5 rounded"
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
