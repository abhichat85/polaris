"use client";

/**
 * PlanBadge — small "FREE/PRO/TEAM" chip surfaced in the IDE rail and
 * dashboard. Click → /settings#billing. Authority: §17, Praxiom §7.4.
 */

import Link from "next/link";

import { cn } from "@/lib/utils";
import { useCustomer } from "../hooks/use-customer";

const TONE: Record<"free" | "pro" | "team", string> = {
  free: "bg-surface-4 text-muted-foreground",
  pro: "bg-primary/15 text-primary",
  team: "bg-success/15 text-success",
};

export const PlanBadge = ({ className }: { className?: string }) => {
  const customer = useCustomer();
  if (customer === undefined) return null;
  const plan = (customer?.plan ?? "free") as "free" | "pro" | "team";

  return (
    <Link
      href="/settings#billing"
      aria-label={`${plan} plan — manage billing`}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-[10px] font-semibold uppercase tracking-wide",
        "px-1.5 py-0.5 transition-opacity hover:opacity-80",
        TONE[plan],
        className,
      )}
    >
      {plan}
    </Link>
  );
};
