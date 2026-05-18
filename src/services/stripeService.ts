import Stripe from "stripe";
import { UserRow, setStripeCustomerId } from "./userService.js";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.warn("STRIPE_SECRET_KEY not set — Stripe calls will fail");
}

export const stripe = new Stripe(secretKey || "sk_test_placeholder", {
  apiVersion: "2024-06-20",
});

export type Plan = "pro" | "max";

export function priceIdForPlan(plan: Plan): string {
  const id =
    plan === "pro"
      ? process.env.STRIPE_PRICE_PRO
      : process.env.STRIPE_PRICE_MAX;
  if (!id) {
    throw new Error(`Stripe price id for plan ${plan} is not configured`);
  }
  return id;
}

export function planForPriceId(priceId: string): Plan | null {
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_MAX) return "max";
  return null;
}

export async function getOrCreateCustomer(user: UserRow): Promise<string> {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: String(user.id) },
  });
  await setStripeCustomerId(user.id, customer.id);
  return customer.id;
}

export async function createCheckoutSession(
  user: UserRow,
  plan: Plan,
): Promise<Stripe.Checkout.Session> {
  const customerId = await getOrCreateCustomer(user);
  const priceId = priceIdForPlan(plan);
  const frontend = process.env.FRONTEND_URL || "http://localhost:3000";
  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${frontend}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontend}/subscribe?canceled=1`,
    metadata: { userId: String(user.id), plan },
    subscription_data: {
      metadata: { userId: String(user.id), plan },
    },
  });
}

export async function cancelAtPeriodEnd(
  stripeSubscriptionId: string,
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}
