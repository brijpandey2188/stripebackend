import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import stripeRoutes, { webhookHandler } from './routes/stripe';
import subscriptionRoutes from './routes/subscription';
import contentRoutes from './routes/content';

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);

// IMPORTANT: webhook MUST be mounted with raw body BEFORE express.json().
// Stripe signature verification requires the unparsed request body.
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  webhookHandler
);

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/content', contentRoutes);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  const message =
    err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: { code: 'INTERNAL', message } });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`BrijeshAchievement API listening on :${port}`);
});
