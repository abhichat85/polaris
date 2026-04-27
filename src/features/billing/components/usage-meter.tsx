"use client";

/**
 * UsageMeter — shows current-month consumption against the user's plan caps.
 * Authority: §17 quotas, D-019 plans source-of-truth.
 *
 * The plan tier numbers come from `convex/plans.ts:SEED_ROWS` via
 * `api.plans.getById`. `usage.getCurrentMonthForCurrentUser` returns the
 * live counters — we render three thin progress bars (tokens / projects /
 * deploys) with thresholds: <80% muted, ≥80% warning, ≥100% destructive.
 */

import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useCustomer, useCurrentMonthUsage } from "../hooks/use-customer";

const toneFor = (pct: number): string => {
  if (pct >= 100) return "bg-destructive";
  if (pct >= 80) return "bg-warning";
  return "bg-primary";
};

const Row = ({
  label,
  current,
  limit,
  format = (n: number) => n.toLocaleString(),
}: {
  label: string;
  current: number;
  limit: number;
  format?: (n: number) => string;
}) => {
  const pct = limit > 0 ? Math.min(100, (current / limit) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground">
          {format(current)} <span className="text-muted-foreground/70">/ {format(limit)}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-4 overflow-hidden">
        <div
          aria-hidden
          style={{ width: `${pct}%` }}
          className={cn("h-full transition-all duration-500 rounded-full", toneFor(pct))}
        />
      </div>
    </div>
  );
};

export const UsageMeter = () => {
  const customer = useCustomer();
  const usage = useCurrentMonthUsage();
  const planId = (customer?.plan ?? "free") as "free" | "pro" | "team";
  const plan = useQuery(api.plans.getById, { id: planId });

  if (customer === undefined || usage === undefined || plan === undefined) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        Loading usage…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        This month ({usage.yearMonth})
      </div>
      <Row
        label="Anthropic tokens"
        current={usage.anthropicTokens}
        limit={plan.monthlyTokenLimit}
      />
      <Row label="Projects" current={usage.projects} limit={plan.projectsAllowed} />
      <Row
        label="Deployments"
        current={usage.deployments}
        limit={plan.deploysAllowedPerMonth}
      />
    </div>
  );
};
