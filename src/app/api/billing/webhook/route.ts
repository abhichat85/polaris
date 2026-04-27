/**
 * /api/billing/webhook — Stripe webhook handler.
 *
 * Authority: CONSTITUTION §13.1 (idempotency), §17.5 (subscription lifecycle).
 *
 * Handled event types:
 *   - checkout.session.completed       → upsert customer + activate subscription
 *   - customer.subscription.updated    → upsert (plan/status/period changes)
 *   - customer.subscription.deleted    → downgrade to free, retain stripeCustomerId
 *   - invoice.payment_failed           → flag past_due
 *
 * Required env:
 *   - STRIPE_SECRET_KEY           (Stripe SDK)
 *   - STRIPE_WEBHOOK_SECRET       (signature verification)
 *   - POLARIS_CONVEX_INTERNAL_KEY (Convex internal-key gate)
 *
 * Stripe retries on 5xx and on >30s response time. Idempotency is enforced
 * via the `webhook_events` table: we check before processing and mark after.
 * Returning 400 on signature failure is intentional — Stripe stops retrying.
 */

import "server-only";
import { NextResponse } from "next/server";

import { convex } from "@/lib/convex-client";
import { api } from "../../../../../convex/_generated/api";

// Map a Stripe price's product or lookup_key to our plan literal. We
// deliberately avoid hardcoding price IDs — instead we read `price.lookup_key`
// (which the user sets to "polaris_pro" / "polaris_team" in the Stripe
// dashboard) or fall back to product metadata.
const planFromLookupKey = (
  lookupKey: string | null | undefined,
): "pro" | "team" | null => {
  if (!lookupKey) return null;
  if (lookupKey.includes("team")) return "team";
  if (lookupKey.includes("pro")) return "pro";
  return null;
};

const SUPPORTED_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

const normalizeStatus = (s: string): SubscriptionStatus =>
  SUPPORTED_STATUSES.has(s) ? (s as SubscriptionStatus) : "none";

// Minimal Stripe object shapes we actually read. Full SDK types are large;
// these match the v2025-03-31 fields we touch.
interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
  metadata?: Record<string, string>;
  items: {
    data: Array<{
      price: {
        id: string;
        lookup_key?: string | null;
        product: string;
      };
    }>;
  };
}

interface StripeCheckoutSession {
  id: string;
  customer: string | null;
  subscription: string | null;
  metadata?: Record<string, string>;
  client_reference_id?: string | null;
}

interface StripeInvoice {
  id: string;
  customer: string;
  subscription?: string | null;
}

const resolveUserId = async (
  internalKey: string,
  stripeCustomerId: string,
  fallbackMetadataUserId?: string,
): Promise<string | null> => {
  if (fallbackMetadataUserId) return fallbackMetadataUserId;
  const row = await convex.query(api.customers.getByStripeCustomer, {
    stripeCustomerId,
  });
  return row?.userId ?? null;
};

export async function POST(request: Request) {
  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!internalKey || !stripeSecret || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook not configured" },
      { status: 500 },
    );
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Read raw body BEFORE parsing — Stripe verifies against the exact bytes.
  const rawBody = await request.text();

  // Dynamic import keeps the Stripe SDK out of the edge bundle.
  const StripeMod = (await import("stripe")) as unknown as {
    default: new (
      k: string,
      opts?: Record<string, unknown>,
    ) => {
      webhooks: {
        constructEvent: (
          body: string,
          sig: string,
          secret: string,
        ) => {
          id: string;
          type: string;
          data: { object: unknown };
        };
      };
      subscriptions: {
        retrieve: (id: string) => Promise<StripeSubscription>;
      };
    };
  };

  const stripe = new StripeMod.default(stripeSecret, {
    apiVersion: "2025-03-31.basil",
  });

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid signature",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 400 },
    );
  }

  // Idempotency check — short-circuit if Stripe has retried this event.
  const alreadyProcessed = await convex.query(
    api.webhook_events.isProcessed,
    { internalKey, eventId: event.id },
  );
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, idempotent: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as StripeCheckoutSession;
        if (!session.customer || !session.subscription) {
          // Not a subscription checkout (e.g. one-time charge) — skip.
          break;
        }
        // Fetch the subscription so we have plan + period info.
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        const userId = await resolveUserId(
          internalKey,
          session.customer,
          session.client_reference_id ?? session.metadata?.userId,
        );
        if (!userId) {
          throw new Error(
            `Cannot resolve userId for customer ${session.customer}. ` +
              "Set client_reference_id when creating the Checkout Session.",
          );
        }
        const plan = planFromLookupKey(
          sub.items.data[0]?.price.lookup_key ?? null,
        );
        if (!plan) {
          throw new Error(
            "No plan resolvable from subscription price. " +
              "Set lookup_key='polaris_pro' or 'polaris_team' in Stripe.",
          );
        }
        await convex.mutation(api.customers.upsertFromWebhook, {
          userId,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: sub.id,
          plan,
          subscriptionStatus: normalizeStatus(sub.status),
          currentPeriodEnd: sub.current_period_end * 1000,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as StripeSubscription;
        const userId = await resolveUserId(
          internalKey,
          sub.customer,
          sub.metadata?.userId,
        );
        if (!userId) break;
        const plan = planFromLookupKey(
          sub.items.data[0]?.price.lookup_key ?? null,
        );
        if (!plan) break;
        await convex.mutation(api.customers.upsertFromWebhook, {
          userId,
          stripeCustomerId: sub.customer,
          stripeSubscriptionId: sub.id,
          plan,
          subscriptionStatus: normalizeStatus(sub.status),
          currentPeriodEnd: sub.current_period_end * 1000,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as StripeSubscription;
        const userId = await resolveUserId(
          internalKey,
          sub.customer,
          sub.metadata?.userId,
        );
        if (!userId) break;
        // Use the dedicated markCanceled mutation — preserves
        // stripeCustomerId so the user can re-subscribe via portal.
        await convex.mutation(api.customers.markCanceled, { userId });
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as StripeInvoice;
        const userId = await resolveUserId(internalKey, inv.customer);
        if (!userId || !inv.subscription) break;
        const sub = await stripe.subscriptions.retrieve(inv.subscription);
        const plan = planFromLookupKey(
          sub.items.data[0]?.price.lookup_key ?? null,
        );
        if (!plan) break;
        await convex.mutation(api.customers.upsertFromWebhook, {
          userId,
          stripeCustomerId: inv.customer,
          stripeSubscriptionId: sub.id,
          plan,
          subscriptionStatus: "past_due",
          currentPeriodEnd: sub.current_period_end * 1000,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
        break;
      }

      default:
        // Ignored event type — still mark processed so Stripe doesn't retry.
        break;
    }

    await convex.mutation(api.webhook_events.markProcessed, {
      internalKey,
      eventId: event.id,
      type: event.type,
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    // Don't mark processed on error — Stripe will retry, which is the
    // correct behaviour. Return 500 so Stripe knows to retry.
    console.error("Stripe webhook error", { type: event.type, err });
    return NextResponse.json(
      {
        error: "handler_error",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }
}
