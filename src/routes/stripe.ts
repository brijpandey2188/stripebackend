import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import Stripe from "stripe";

import { verifyJWT, AuthedRequest } from "../middleware/auth.js";
import { findUserById } from "../services/userService.js";
import { pool } from "../db.js";
import {
  stripe,
  createCheckoutSession,
  planForPriceId,
  Plan,
} from "../services/stripeService.js";
import { Tier } from "../middleware/tier.js";

const router = Router();

router.post(
  "/create-checkout-session",
  verifyJWT,
  body("plan").isIn(["pro", "max"]),
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: {
          code: "VALIDATION",
          message: "Invalid input",
          details: errors.array(),
        },
      });
    }
    if (!req.user) return res.status(401).end();
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    const plan = req.body.plan as Plan;
    try {
      const session = await createCheckoutSession(user, plan);
      return res.json({ sessionId: session.id, url: session.url });
    } catch (err) {
      console.error("Stripe checkout error:", err);
      return res.status(500).json({
        error: {
          code: "STRIPE_ERROR",
          message: err instanceof Error ? err.message : "Stripe failure",
        },
      });
    }
  },
);

// Webhook handler — exported so index.ts can mount it with raw body parser.
export async function webhookHandler(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return res
      .status(400)
      .json({
        error: { code: "WEBHOOK", message: "Missing signature/secret" },
      });
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return res
      .status(400)
      .json({ error: { code: "WEBHOOK", message: "Invalid signature" } });
  }

  // Idempotency: insert into webhook_events first; if event_id already exists, exit early.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const dup = await client.query(
      `SELECT 1 FROM webhook_events WHERE stripe_event_id = $1`,
      [event.id],
    );
    if ((dup.rowCount ?? 0) > 0) {
      await client.query("COMMIT");
      return res.json({ received: true, duplicate: true });
    }

    await client.query(
      `INSERT INTO webhook_events (stripe_event_id, event_type, raw_payload)
       VALUES ($1, $2, $3)`,
      [event.id, event.type, event.data.object],
    );

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          client,
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          client,
          event.data.object as Stripe.Subscription,
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          client,
          event.data.object as Stripe.Subscription,
        );
        break;
      case "invoice.paid":
      case "invoice.payment_succeeded":
        await recordPayment(
          client,
          event.data.object as Stripe.Invoice,
          "succeeded",
        );
        break;
      case "invoice.payment_failed":
        await recordPayment(
          client,
          event.data.object as Stripe.Invoice,
          "failed",
        );
        break;
      default:
        // Other event types are stored in webhook_events for audit; no further action.
        break;
    }

    await client.query("COMMIT");
    return res.json({ received: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Webhook processing failed:", err);
    return res
      .status(500)
      .json({ error: { code: "WEBHOOK_ERROR", message: "Processing failed" } });
  } finally {
    client.release();
  }
}

async function recordPayment(
  client: import("pg").PoolClient,
  invoice: Stripe.Invoice,
  status: "succeeded" | "failed",
) {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer?.id ?? null);
  const userId = customerId
    ? await lookupUserIdByStripeCustomer(client, customerId)
    : null;
  const subId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : (invoice.subscription?.id ?? null);
  const piId =
    typeof invoice.payment_intent === "string"
      ? invoice.payment_intent
      : (invoice.payment_intent?.id ?? null);
  const amountCents =
    status === "succeeded"
      ? (invoice.amount_paid ?? invoice.amount_due ?? 0)
      : (invoice.amount_due ?? 0);
  await client.query(
    `INSERT INTO payments
       (user_id, stripe_invoice_id, stripe_payment_intent_id, stripe_subscription_id,
        stripe_customer_id, amount_cents, currency, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (stripe_invoice_id) DO UPDATE SET
       status                   = EXCLUDED.status,
       amount_cents             = EXCLUDED.amount_cents,
       stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id`,
    [
      userId,
      invoice.id,
      piId,
      subId,
      customerId,
      amountCents,
      invoice.currency,
      status,
    ],
  );
}

async function handleCheckoutCompleted(
  client: import("pg").PoolClient,
  session: Stripe.Checkout.Session,
) {
  const userIdRaw = session.metadata?.userId;
  const planRaw = session.metadata?.plan;
  if (!userIdRaw || !planRaw) {
    console.warn("checkout.session.completed missing metadata", session.id);
    return;
  }
  const userId = Number(userIdRaw);
  const plan = planRaw as Plan;
  if (!session.subscription) return;
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;
  const subscription = await stripe.subscriptions.retrieve(subId);
  await upsertSubscription(client, userId, plan, subscription);
  await applyTierFromSubscription(client, userId, plan, subscription.status);
}

async function handleSubscriptionUpdated(
  client: import("pg").PoolClient,
  subscription: Stripe.Subscription,
) {
  const userIdRaw =
    subscription.metadata?.userId ??
    (await lookupUserIdByStripeCustomer(
      client,
      subscription.customer as string,
    ));
  if (!userIdRaw) return;
  const userId = Number(userIdRaw);
  const priceId = subscription.items.data[0]?.price.id ?? "";
  const plan =
    (subscription.metadata?.plan as Plan | undefined) ??
    planForPriceId(priceId);
  if (!plan) return;
  await upsertSubscription(client, userId, plan, subscription);
  await applyTierFromSubscription(client, userId, plan, subscription.status);
}

async function handleSubscriptionDeleted(
  client: import("pg").PoolClient,
  subscription: Stripe.Subscription,
) {
  const userIdRaw =
    subscription.metadata?.userId ??
    (await lookupUserIdByStripeCustomer(
      client,
      subscription.customer as string,
    ));
  if (!userIdRaw) return;
  const userId = Number(userIdRaw);
  await client.query(
    `UPDATE subscriptions
       SET status = 'canceled',
           updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id],
  );
  await client.query(
    `UPDATE users SET tier = 'free', updated_at = NOW() WHERE id = $1`,
    [userId],
  );
}

async function lookupUserIdByStripeCustomer(
  client: import("pg").PoolClient,
  customerId: string,
): Promise<number | null> {
  const { rows } = await client.query<{ id: number }>(
    `SELECT id FROM users WHERE stripe_customer_id = $1`,
    [customerId],
  );
  return rows[0]?.id ?? null;
}

async function upsertSubscription(
  client: import("pg").PoolClient,
  userId: number,
  plan: Plan,
  subscription: Stripe.Subscription,
) {
  const priceId = subscription.items.data[0]?.price.id ?? "";
  const periodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000)
    : null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  await client.query(
    `INSERT INTO subscriptions
       (user_id, stripe_subscription_id, stripe_price_id, plan, status,
        current_period_start, current_period_end, cancel_at_period_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET
       stripe_price_id      = EXCLUDED.stripe_price_id,
       plan                 = EXCLUDED.plan,
       status               = EXCLUDED.status,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end   = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       updated_at           = NOW()`,
    [
      userId,
      subscription.id,
      priceId,
      plan,
      subscription.status,
      periodStart,
      periodEnd,
      subscription.cancel_at_period_end,
    ],
  );
}

async function applyTierFromSubscription(
  client: import("pg").PoolClient,
  userId: number,
  plan: Plan,
  status: Stripe.Subscription.Status,
) {
  let tier: Tier;
  if (status === "active" || status === "trialing") {
    tier = plan;
  } else if (status === "past_due" || status === "unpaid") {
    // Keep current tier — Stripe will retry. Do nothing.
    return;
  } else {
    tier = "free";
  }
  await client.query(
    `UPDATE users SET tier = $2, updated_at = NOW() WHERE id = $1`,
    [userId, tier],
  );
}

export default router;
