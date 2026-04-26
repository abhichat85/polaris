import * as React from "react"

import { cn } from "@/lib/utils"

// Praxiom §7.2 — Cards use surface-2 with no border lines.
// Surface depth (parent surface-0 → card surface-2) provides the affordance.
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-surface-2 text-foreground flex flex-col gap-4 rounded-lg p-4",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header flex flex-col gap-1 has-data-[slot=card-action]:grid has-data-[slot=card-action]:auto-rows-min has-data-[slot=card-action]:grid-rows-[auto_auto] has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-action]:items-start",
        className
      )}
      {...props}
    />
  )
}

// Praxiom §3.3 — Card titles use Outfit (font-heading), text-base, weight 500
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base font-medium leading-none text-foreground tracking-[-0.01em]",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
