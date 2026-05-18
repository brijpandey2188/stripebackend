import { Response, NextFunction } from 'express';
import { AuthedRequest } from './auth.js';
import { findUserById } from '../services/userService.js';

export type Tier = 'free' | 'pro' | 'max';

const order: Record<Tier, number> = { free: 0, pro: 1, max: 2 };

export function tierAtLeast(actual: Tier, min: Tier): boolean {
  return order[actual] >= order[min];
}

export function requireTier(min: Tier) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHORIZED', message: 'Login required' } });
    }
    const user = await findUserById(req.user.id);
    if (!user) {
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
    }
    if (!tierAtLeast(user.tier, min)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Requires ${min} subscription`,
          requiredTier: min,
          currentTier: user.tier,
        },
      });
    }
    next();
  };
}
