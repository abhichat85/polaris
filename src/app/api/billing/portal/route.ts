/**
 * /api/billing/portal — redirect to Stripe Customer Portal.
 *
 * Authority: CONSTITUTION §17.5. Subscriptions, payment methods,
 * invoices, and cancellation all live in Stripe's hosted portal.
 * We just open the door.
 *
 * GET so a `<Link href="/api/billing/portal">Manage</Link>` works
 * without client JS.
 */

import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { convex } from "@/lib/convex-client";
import { api } from "../../../../../convex/_generated/api";

interface MinimalStripe {
  billingPortal: {
    sessions: {
      create: (params: {
        customer: string;
        return_url: string;
      }) => Promise<{ url: string }>;
    };
  };
}

export async function GET(request: Request) {
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

  const customer = await convex.query(api.customers.getByUser, { userId });
  if (!customer?.stripeCustomerId) {
    return NextResponse.json(
      {
        error: "no_subscription",
        detail: "No Stripe customer linked. Subscribe first via /pricing.",
      },
      { status: 400 },
    );
  }

  const StripeMod = (await import("stripe")) as unknown as {
    default: new (k: string, opts?: Record<string, unknown>) => MinimalStripe;
  };
  const stripe = new StripeMod.default(stripeSecret, {
    apiVersion: "2025-03-31.basil",
  });

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: `${origin}/settings#billing`,
  });

  return NextResponse.redirect(session.url, { status: 303 });
}
