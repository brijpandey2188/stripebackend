import { Router, Response } from 'express';
import { verifyJWT, AuthedRequest } from '../middleware/auth.js';
import { query } from '../db.js';
import { cancelAtPeriodEnd } from '../services/stripeService.js';

const router = Router();

interface SubRow {
  stripe_subscription_id: string;
  plan: 'pro' | 'max';
  status: string;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
}

router.get('/me', verifyJWT, async (req: AuthedRequest, res: Response) => {
  if (!req.user) return res.status(401).end();
  const { rows } = await query<SubRow>(
    `SELECT stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end
       FROM subscriptions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [req.user.id]
  );
  if (rows.length === 0) return res.json(null);
  const s = rows[0];
  return res.json({
    plan: s.plan,
    status: s.status,
    current_period_end: s.current_period_end,
    cancel_at_period_end: s.cancel_at_period_end,
  });
});

router.post('/cancel', verifyJWT, async (req: AuthedRequest, res: Response) => {
  if (!req.user) return res.status(401).end();
  const { rows } = await query<{ stripe_subscription_id: string }>(
    `SELECT stripe_subscription_id
       FROM subscriptions
      WHERE user_id = $1 AND status IN ('active', 'trialing', 'past_due')
      ORDER BY created_at DESC
      LIMIT 1`,
    [req.user.id]
  );
  if (rows.length === 0) {
    return res
      .status(404)
      .json({ error: { code: 'NO_SUBSCRIPTION', message: 'No active subscription' } });
  }
  try {
    const updated = await cancelAtPeriodEnd(rows[0].stripe_subscription_id);
    return res.json({
      stripe_subscription_id: updated.id,
      cancel_at_period_end: updated.cancel_at_period_end,
      current_period_end: updated.current_period_end
        ? new Date(updated.current_period_end * 1000)
        : null,
      status: updated.status,
    });
  } catch (err) {
    console.error('Cancel failed:', err);
    return res.status(500).json({
      error: {
        code: 'STRIPE_ERROR',
        message: err instanceof Error ? err.message : 'Cancel failed',
      },
    });
  }
});

export default router;
