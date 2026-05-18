import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';

import {
  createUser,
  findUserByEmail,
  findUserById,
  listUsers,
  toPublic,
} from '../services/userService.js';
import { signToken, verifyJWT, AuthedRequest } from '../middleware/auth.js';

const router = Router();

router.post(
  '/register',
  body('email').isEmail().normalizeEmail(),
  body('password')
    .isString()
    .isLength({ min: 8 })
    .matches(/[A-Za-z]/)
    .matches(/[0-9]/)
    .withMessage('Password must be 8+ chars with at least one letter and one number'),
  body('name').isString().trim().isLength({ min: 1, max: 120 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Invalid input', details: errors.array() },
      });
    }
    const { email, password, name } = req.body as {
      email: string;
      password: string;
      name: string;
    };
    const existing = await findUserByEmail(email);
    if (existing) {
      return res
        .status(409)
        .json({ error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser(email, passwordHash, name);
    const token = signToken(user.id);
    return res.status(201).json({ user: toPublic(user), token });
  }
);

router.post(
  '/login',
  body('email').isEmail().normalizeEmail(),
  body('password').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Invalid input', details: errors.array() },
      });
    }
    const { email, password } = req.body as { email: string; password: string };
    const user = await findUserByEmail(email);
    if (!user) {
      return res
        .status(401)
        .json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res
        .status(401)
        .json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
    const token = signToken(user.id);
    return res.json({ user: toPublic(user), token });
  }
);

router.get('/me', verifyJWT, async (req: AuthedRequest, res: Response) => {
  if (!req.user) return res.status(401).end();
  const user = await findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
  return res.json(toPublic(user));
});

router.get('/users', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { users, total } = await listUsers(limit, offset);
  return res.json({
    users: users.map(toPublic),
    total,
    limit,
    offset,
  });
});

export default router;
