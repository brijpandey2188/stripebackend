import { Router } from 'express';
import { param, query as q, validationResult } from 'express-validator';
import { findUserById, listUsers, UserRow } from '../services/userService.js';

const router = Router();

function toListItem(u: UserRow) {
  return { id: u.id, name: u.name, tier: u.tier };
}

router.get(
  '/',
  q('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  q('offset').optional().isInt({ min: 0 }).toInt(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION', message: errors.array()[0].msg } });
    }
    try {
      const limit = Number(req.query?.limit ?? 20);
      const offset = Number(req.query?.offset ?? 0);
      const { users, total } = await listUsers(limit, offset);
      res.json({
        users: users.map(toListItem),
        total,
        limit,
        offset,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id',
  param('id').isInt({ min: 1 }).toInt(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION', message: 'Invalid id' } });
    }
    try {
      const id = Number(req.params?.id);
      const user = await findUserById(id);
      if (!user) {
        return res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      }
      res.json(toListItem(user));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
