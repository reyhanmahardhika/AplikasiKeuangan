ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'transfer';

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fee_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  schedule_type VARCHAR(40) NOT NULL,
  due_day SMALLINT NOT NULL,
  next_due_date DATE NOT NULL,
  amount NUMERIC(18,2),
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  destination_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  payment_method VARCHAR(80),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (schedule_type IN ('transaction', 'transfer', 'topup')),
  CHECK (due_day BETWEEN 1 AND 31),
  CHECK (amount IS NULL OR amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_schedules_user_due ON schedules(user_id, is_active, next_due_date);
