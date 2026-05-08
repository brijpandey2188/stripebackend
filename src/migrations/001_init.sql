-- BrijeshAchievement initial schema
-- Database: myapp

CREATE TABLE IF NOT EXISTS users (
  id                 SERIAL PRIMARY KEY,
  email              VARCHAR(255) NOT NULL UNIQUE,
  password_hash      VARCHAR(255) NOT NULL,
  name               VARCHAR(120) NOT NULL,
  tier               VARCHAR(10)  NOT NULL DEFAULT 'free'
                     CHECK (tier IN ('free', 'pro', 'max')),
  stripe_customer_id VARCHAR(255) UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                       SERIAL PRIMARY KEY,
  user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id   VARCHAR(255) NOT NULL UNIQUE,
  stripe_price_id          VARCHAR(255) NOT NULL,
  plan                     VARCHAR(10)  NOT NULL CHECK (plan IN ('pro', 'max')),
  status                   VARCHAR(30)  NOT NULL,
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status  ON subscriptions(status);

CREATE TABLE IF NOT EXISTS payment_events (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  stripe_event_id     VARCHAR(255) NOT NULL UNIQUE,
  event_type          VARCHAR(80)  NOT NULL,
  stripe_object_id    VARCHAR(255),
  amount_cents        INTEGER,
  currency            VARCHAR(10),
  status              VARCHAR(30),
  raw_payload         JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_user_id ON payment_events(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type    ON payment_events(event_type);
