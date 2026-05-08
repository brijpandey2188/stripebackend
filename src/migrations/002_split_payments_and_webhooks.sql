-- Split payment_events into:
--   webhook_events: idempotency + raw audit log of every Stripe webhook
--   payments:       structured record of money movement (one row per invoice)

CREATE TABLE IF NOT EXISTS webhook_events (
  id               SERIAL PRIMARY KEY,
  stripe_event_id  VARCHAR(255) NOT NULL UNIQUE,
  event_type       VARCHAR(80)  NOT NULL,
  raw_payload      JSONB        NOT NULL,
  received_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);

CREATE TABLE IF NOT EXISTS payments (
  id                       SERIAL PRIMARY KEY,
  user_id                  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  stripe_invoice_id        VARCHAR(255) UNIQUE,
  stripe_payment_intent_id VARCHAR(255),
  stripe_subscription_id   VARCHAR(255),
  stripe_customer_id       VARCHAR(255),
  amount_cents             INTEGER     NOT NULL,
  currency                 VARCHAR(10) NOT NULL,
  status                   VARCHAR(30) NOT NULL CHECK (status IN ('succeeded', 'failed')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_user_id          ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id  ON payments(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_status           ON payments(status);

DROP TABLE IF EXISTS payment_events;
