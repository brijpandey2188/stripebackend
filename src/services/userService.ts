import { query } from '../db';
import { Tier } from '../middleware/tier';

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
