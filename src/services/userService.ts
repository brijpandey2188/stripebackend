import { query } from '../db.js';
import { Tier } from '../middleware/tier.js';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  tier: Tier;
  stripe_customer_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  tier: Tier;
}

export function toPublic(u: UserRow): PublicUser {
  return { id: u.id, email: u.email, name: u.name, tier: u.tier };
}

export async function createUser(
  email: string,
  passwordHash: string,
  name: string
): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email.toLowerCase(), passwordHash, name]
  );
  return rows[0];
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT * FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  return rows[0] ?? null;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT * FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listUsers(
  limit: number,
  offset: number
): Promise<{ users: UserRow[]; total: number }> {
  const { rows } = await query<UserRow>(
    `SELECT * FROM users
     ORDER BY id ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const { rows: countRows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM users`
  );
  return { users: rows, total: Number(countRows[0]?.count ?? 0) };
}

export async function setStripeCustomerId(
  userId: number,
  stripeCustomerId: string
): Promise<void> {
  await query(
    `UPDATE users
       SET stripe_customer_id = $2,
           updated_at = NOW()
     WHERE id = $1`,
    [userId, stripeCustomerId]
  );
}

export async function updateUserTier(
  userId: number,
  tier: Tier
): Promise<void> {
  await query(
    `UPDATE users
       SET tier = $2,
           updated_at = NOW()
     WHERE id = $1`,
    [userId, tier]
  );
}
