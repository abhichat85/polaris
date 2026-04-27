"use client";

/**
 * SettingsView — Polaris settings page.
 *
 * Praxiom §4 layout: surface-0 page, surface-1 sticky header, surface-2
 * sectioned cards. Sections are anchor-linked (left rail uses §4.3 active
 * accent bar). Sections are intentionally lean — every field maps to
 * something the backend actually persists today (user_profiles.cookieConsent
 * + marketingOptIn) or actually exposes (customers.plan).
 *
 * Anything Polaris does NOT yet support (workspaces, team members, API
 * keys) is conspicuously absent. We will add sections as their backends
 * land — see docs/superpowers/plans/2026-04-27-compliance-and-workspaces.md.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutButton, useUser } from "@clerk/nextjs";
import {
  ArrowLeftIcon,
  BellIcon,
  Building2Icon,
  CheckIcon,
  CreditCardIcon,
  Loader2Icon,
  ShieldIcon,
  UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import {
  useCurrentProfile,
  useCurrentCustomer,
  useUpdatePreferences,
} from "../hooks/use-settings";
import {
  useCurrentWorkspace,
  useWorkspaceMembers,
} from "@/features/workspaces/hooks/use-workspaces";
import { UsageMeter } from "@/features/billing/components/usage-meter";

type SectionId = "profile" | "workspace" | "preferences" | "billing" | "danger";

const SECTIONS: {
  id: SectionId;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "workspace", label: "Workspace", icon: Building2Icon },
  { id: "preferences", label: "Preferences", icon: BellIcon },
  { id: "billing", label: "Billing", icon: CreditCardIcon },
  { id: "danger", label: "Danger zone", icon: ShieldIcon },
];

export const SettingsView = () => {
  const router = useRouter();
  const { user } = useUser();
  const profile = useCurrentProfile();
  const customer = useCurrentCustomer();
  const updatePreferences = useUpdatePreferences();

  const [active, setActive] = useState<SectionId>("profile");

  // Anchor scroll on hash change.
  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.replace("#", "");
      if (SECTIONS.some((s) => s.id === id)) setActive(id as SectionId);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col">
      {/* Sticky header — surface-1, h-12 (Praxiom §4.4) */}
      <header className="sticky top-0 z-10 h-12 px-4 flex items-center justify-between bg-surface-1 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => router.back()}
            aria-label="Back"
            className="h-7 w-7"
          >
            <ArrowLeftIcon className="size-3.5" />
          </Button>
          <h1 className="font-heading text-sm font-semibold tracking-[-0.01em] text-foreground">
            Settings
          </h1>
        </div>
        <Link
          href="/dashboard"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Dashboard
        </Link>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 px-6 md:px-10 py-8 max-w-5xl w-full mx-auto">
        {/* Section nav */}
        <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible -mx-1 px-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = active === s.id;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setActive(s.id)}
                className={cn(
                  "relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors shrink-0",
                  "text-muted-foreground hover:text-foreground hover:bg-surface-2",
                  isActive && "bg-surface-2 text-foreground",
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full transition-colors",
                    isActive ? "bg-primary" : "bg-transparent",
                  )}
                />
                <Icon className="size-3.5" />
                {s.label}
              </a>
            );
          })}
        </nav>

        {/* Sections */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Profile */}
          <Section id="profile" title="Profile" hint="Identity managed by Clerk.">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user?.imageUrl}
                alt=""
                className="size-12 rounded-full bg-surface-3"
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {user?.fullName || user?.username || "Polaris user"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {user?.primaryEmailAddress?.emailAddress}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-8"
                onClick={() => router.push("/user-profile")}
              >
                Manage on Clerk
              </Button>
            </div>
          </Section>

          {/* Workspace */}
          <Section
            id="workspace"
            title="Workspace"
            hint="Members and access. Workspace owners can invite admins and members."
          >
            <WorkspacePane />
          </Section>

          {/* Preferences */}
          <Section
            id="preferences"
            title="Preferences"
            hint="Controls how Polaris communicates with you."
          >
            <PreferenceRow
              title="Product updates"
              description="Occasional emails about new features and improvements. No marketing fluff."
              checked={profile?.marketingOptIn ?? false}
              loading={profile === undefined}
              onToggle={async (next) => {
                try {
                  await updatePreferences({ marketingOptIn: next });
                  toast.success(next ? "Subscribed" : "Unsubscribed");
                } catch {
                  toast.error("Could not update preference");
                }
              }}
            />
            <div className="h-px bg-surface-3" />
            <PreferenceRow
              title="Analytics cookies"
              description="Anonymous usage telemetry that helps us prioritise improvements."
              checked={profile?.cookieConsent?.analytics ?? false}
              loading={profile === undefined}
              onToggle={async (next) => {
                const current = profile?.cookieConsent ?? {
                  analytics: false,
                  marketing: false,
                  timestamp: Date.now(),
                };
                try {
                  await updatePreferences({
                    cookieConsent: {
                      ...current,
                      analytics: next,
                      timestamp: Date.now(),
                    },
                  });
                  toast.success("Saved");
                } catch {
                  toast.error("Could not update consent");
                }
              }}
            />
          </Section>

          {/* Billing */}
          <Section
            id="billing"
            title="Billing"
            hint="Plan and subscription managed by Stripe."
          >
            <BillingPane customer={customer} />
          </Section>

          {/* Danger zone */}
          <Section
            id="danger"
            title="Danger zone"
            hint="Irreversible account actions. Sign-out is the only safe one we expose today."
          >
            <DangerPane />
          </Section>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Section primitives
// ---------------------------------------------------------------------------

const Section = ({
  id,
  title,
  hint,
  children,
}: {
  id: SectionId;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <section
    id={id}
    className="scroll-mt-16 rounded-lg bg-surface-2 p-5 flex flex-col gap-4"
  >
    <div className="flex flex-col gap-0.5">
      <h2 className="font-heading text-base font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      {hint && (
        <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
      )}
    </div>
    <div className="flex flex-col gap-3">{children}</div>
  </section>
);

const PreferenceRow = ({
  title,
  description,
  checked,
  loading,
  onToggle,
}: {
  title: string;
  description: string;
  checked: boolean;
  loading?: boolean;
  onToggle: (next: boolean) => void | Promise<void>;
}) => {
  const [pending, setPending] = useState(false);
  const handleChange = async (next: boolean) => {
    setPending(true);
    try {
      await onToggle(next);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground leading-relaxed mt-0.5">
          {description}
        </div>
      </div>
      <div className="shrink-0 pt-0.5">
        {pending ? (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={checked}
            disabled={loading}
            onCheckedChange={handleChange}
          />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Billing pane
// ---------------------------------------------------------------------------

const PLAN_LABEL: Record<"free" | "pro" | "team", string> = {
  free: "Free",
  pro: "Pro",
  team: "Team",
};

const STATUS_TONE: Record<string, "active" | "warning" | "destructive" | "neutral"> = {
  active: "active",
  trialing: "active",
  past_due: "warning",
  canceled: "destructive",
  unpaid: "destructive",
  incomplete: "warning",
  incomplete_expired: "destructive",
  paused: "warning",
  none: "neutral",
};

const BillingPane = ({
  customer,
}: {
  customer: ReturnType<typeof useCurrentCustomer>;
}) => {
  const renewLabel = useMemo(() => {
    if (!customer || !customer.currentPeriodEnd) return null;
    return format(new Date(customer.currentPeriodEnd), "PP");
  }, [customer]);

  if (customer === undefined) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        Loading subscription…
      </div>
    );
  }

  const tone = STATUS_TONE[customer.subscriptionStatus] ?? "neutral";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-heading text-2xl font-semibold tracking-[-0.02em] text-foreground">
              {PLAN_LABEL[customer.plan]}
            </span>
            <StatusBadge tone={tone}>
              {customer.subscriptionStatus.replace(/_/g, " ")}
            </StatusBadge>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {customer.plan === "free"
              ? "Upgrade for higher quotas, more agent runs, and team features."
              : customer.cancelAtPeriodEnd
                ? `Cancels on ${renewLabel ?? "period end"}`
                : renewLabel
                  ? `Renews on ${renewLabel}`
                  : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {customer.plan === "free" ? (
            <Button asChild size="sm" className="h-8">
              <Link href="/pricing">Upgrade</Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link href="/pricing">Manage plan</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <BillingStat label="Seats" value={String(customer.seatsAllowed)} />
        <BillingStat
          label="Stripe customer"
          value={customer.stripeCustomerId ? "Linked" : "Not linked"}
        />
        <BillingStat
          label="Updated"
          value={
            customer.updatedAt
              ? format(new Date(customer.updatedAt), "PP")
              : "Never"
          }
        />
      </div>

      {/* §17 / D-019 — current usage vs plan caps */}
      <div className="rounded-md bg-surface-3 p-4">
        <UsageMeter />
      </div>
    </div>
  );
};

const BillingStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md bg-surface-3 px-3 py-2.5">
    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
      {label}
    </div>
    <div className="text-sm font-medium text-foreground mt-0.5">{value}</div>
  </div>
);

const StatusBadge = ({
  tone,
  children,
}: {
  tone: "active" | "warning" | "destructive" | "neutral";
  children: React.ReactNode;
}) => {
  const cls =
    tone === "active"
      ? "bg-success/15 text-success"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : tone === "destructive"
          ? "bg-destructive/10 text-destructive"
          : "bg-surface-4 text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md",
        cls,
      )}
    >
      {tone === "active" && <CheckIcon className="size-2.5" />}
      {children}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Workspace pane
// ---------------------------------------------------------------------------

const WorkspacePane = () => {
  const workspace = useCurrentWorkspace();
  const members = useWorkspaceMembers(workspace?._id ?? null);

  if (workspace === undefined) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" />
        Loading workspace…
      </div>
    );
  }

  if (workspace === null) {
    return (
      <div className="text-xs text-muted-foreground">
        You don&apos;t have a workspace yet. Run the migration:{" "}
        <code className="font-mono text-foreground/80">
          npx convex run migrations/create_personal_workspaces:run
        </code>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-heading text-base font-medium tracking-[-0.01em] text-foreground">
            {workspace.name}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            slug: <span className="font-mono">{workspace.slug}</span> · plan:{" "}
            <span className="uppercase tracking-wide">{workspace.plan}</span>
          </div>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-surface-3 text-muted-foreground">
          {(members?.length ?? 0)} member{members?.length === 1 ? "" : "s"}
        </span>
      </div>

      {members === undefined ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" />
          Loading members…
        </div>
      ) : (
        <div className="flex flex-col rounded-md bg-surface-3 overflow-hidden">
          {members.map((m, i) => (
            <div
              key={m._id}
              className={cn(
                "flex items-center justify-between px-3 py-2",
                i > 0 && "[box-shadow:inset_0_1px_0_hsl(var(--surface-4))]",
              )}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate font-mono">
                  {m.userId}
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                  Joined {new Date(m.joinedAt).toLocaleDateString()}
                </div>
              </div>
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md",
                  m.role === "owner"
                    ? "bg-primary/10 text-primary"
                    : m.role === "admin"
                      ? "bg-info/15 text-info"
                      : "bg-surface-4 text-muted-foreground",
                )}
              >
                {m.role}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
        Member invitation flow ships in a follow-up. Until then, owners can
        invite via Convex CLI:{" "}
        <code className="font-mono text-foreground/80">
          npx convex run workspaces:invite &lsquo;{`{...}`}&rsquo;
        </code>
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

const DangerPane = () => {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">Sign out</div>
        <div className="text-xs text-muted-foreground leading-relaxed mt-0.5">
          End your current session. You can sign back in any time.
        </div>
      </div>
      <SignOutButton redirectUrl="/">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          Sign out
        </Button>
      </SignOutButton>
    </div>
  );
};
