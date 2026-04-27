"use client";

/**
 * showQuotaBlocked — destructive toast surfaced when a server-side quota
 * check denies an operation (HTTP 429 from `/api/messages` etc.). The
 * toast carries the precise reason + numbers + an "Upgrade" link.
 *
 * Authority: §17 quotas, D-022. Pure helper — no React state.
 */

import { toast } from "sonner";

export interface QuotaBlockedPayload {
  reason: string;
  current: number;
  limit: number;
  upgradeUrl?: string;
}

const REASON_LABEL: Record<string, string> = {
  monthly_tokens: "monthly tokens",
  monthly_deploys: "monthly deploys",
  projects: "projects",
};

export const showQuotaBlocked = ({
  reason,
  current,
  limit,
  upgradeUrl = "/pricing",
}: QuotaBlockedPayload) => {
  const label = REASON_LABEL[reason] ?? reason.replace(/_/g, " ");
  toast.error(`Quota reached — ${label}`, {
    description: `You've used ${current.toLocaleString()} of ${limit.toLocaleString()}. Upgrade to keep building.`,
    action: {
      label: "Upgrade",
      onClick: () => {
        window.location.href = upgradeUrl;
      },
    },
    duration: 10_000,
  });
};
