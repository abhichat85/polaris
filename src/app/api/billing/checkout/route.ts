/**
 * /api/billing/checkout — create a Stripe Checkout Session.
 *
 * Authority: CONSTITUTION §17.5, D-021. The webhook (handled by
 * `/api/billing/webhook/route.ts`) is the only writer of `customers.plan` —
 * this route simply opens the door to Stripe; it does NOT mutate plan
 * state until the webhook fires.
 *
 * Body shape (JSON or form-data): { tier: "pro" | "team" }
 * Response: { url } (302 if posted via <form>) — caller redirects.
 *
 * Required env: STRIPE_SECRET_KEY
 * Required Stripe config: prices with `lookup_key` "polaris_pro" and
 * "polaris_team" (configured in the Stripe dashboard or via the CLI).
 */

import "server-only";
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { convex } from "@/lib/convex-client";
import { api } from "../../../../../convex/_generated/api";

type Tier = "pro" | "team";
const lookupKeyForTier = (tier: Tier) =>
  tier === "pro" ? "polaris_pro" : "polaris_team";

interface MinimalStripe {
  customers: {
    create: (params: {
      email?: string;
      metadata?: Record<string, string>;
    }) => Promise<{ id: string }>;
  };
  prices: {
    list: (params: {
      lookup_keys: string[];
      limit?: number;
      active?: boolean;
    }) => Promise<{ data: Array<{ id: string }> }>;
  };
  checkout: {
    sessions: {
      create: (params: {
        mode: "subscription";
        line_items: Array<{ price: string; quantity: number }>;
        client_reference_id?: string;
        customer?: string;
        success_url: string;
        cancel_url: string;
        allow_promotion_codes?: boolean;
      }) => Promise<{ url: string | null }>;
    };
  };
}

const parseTier = (raw: unknown): Tier | null => {
  if (raw === "pro" || raw === "team") return raw;
  return null;
};

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 },
    );
  }

  // Accept JSON or form-data so a plain `<form action method="POST">`
  // works without client JS.
  let tier: Tier | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    tier = parseTier((body as Record<string, unknown>).tier);
  } else {
    const form = await request.formData().catch(() => null);
    tier = parseTier(form?.get("tier"));
  }
  if (!tier) {
    return NextResponse.json(
      { error: "Invalid tier (expected 'pro' or 'team')" },
      { status: 400 },
    );
  }

  const StripeMod = (await import("stripe")) as unknown as {
    default: new (k: string, opts?: Record<string, unknown>) => MinimalStripe;
  };
  const stripe = new StripeMod.default(stripeSecret, {
    apiVersion: "2025-03-31.basil",
  });

  // Reuse existing Stripe customer if we have one.
  const existing = await convex.query(api.customers.getByUser, { userId });
  let stripeCustomerId = existing?.stripeCustomerId;

  if (!stripeCustomerId) {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress;
    const created = await stripe.customers.create({
      email,
      metadata: { userId },
    });
    stripeCustomerId = created.id;
    // Don't persist here — the Stripe webhook (checkout.session.completed)
    // owns the customers.* writes per D-021.
  }

  // Resolve the price by lookup_key (configured in the Stripe dashboard).
  const lookupKey = lookupKeyForTier(tier);
  const prices = await stripe.prices.list({
    lookup_keys: [lookupKey],
    limit: 1,
    active: true,
  });
  const price = prices.data[0];
  if (!price) {
    return NextResponse.json(
      {
        error: "price_not_configured",
        detail: `No active Stripe price with lookup_key="${lookupKey}". Configure it in the Stripe dashboard.`,
      },
      { status: 500 },
    );
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: userId,
    customer: stripeCustomerId,
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancel`,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe did not return a session URL" },
      { status: 500 },
    );
  }

  // For form posts, redirect the browser. For JSON callers, return the URL.
  if (contentType.includes("application/json")) {
    return NextResponse.json({ url: session.url });
  }
  return NextResponse.redirect(session.url, { status: 303 });
}
