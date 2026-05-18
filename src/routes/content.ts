import { Router } from 'express';
import { verifyJWT } from '../middleware/auth.js';
import { requireTier } from '../middleware/tier.js';

const router = Router();

router.get('/premium', verifyJWT, requireTier('pro'), (_req, res) => {
  res.json({
    title: 'Premium Content',
    body: 'Welcome to BrijeshAchievement Premium. Pro and Max tiers unlock this section.',
    items: [
      { id: 'p1', name: 'Premium Achievement #1' },
      { id: 'p2', name: 'Premium Achievement #2' },
      { id: 'p3', name: 'Premium Achievement #3' },
    ],
  });
});

router.get('/ultra-premium', verifyJWT, requireTier('max'), (_req, res) => {
  res.json({
    title: 'Ultra Premium Content',
    body: 'Welcome to BrijeshAchievement Ultra Premium. Only Max tier unlocks this section.',
    items: [
      { id: 'u1', name: 'Ultra Achievement #1' },
      { id: 'u2', name: 'Ultra Achievement #2' },
      { id: 'u3', name: 'Ultra Achievement #3' },
    ],
  });
});

export default router;
