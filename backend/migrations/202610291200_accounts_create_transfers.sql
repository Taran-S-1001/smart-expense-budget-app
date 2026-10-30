CREATE TABLE IF NOT EXISTS transfers (
    transfer_id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    from_account_id VARCHAR(64) NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    to_account_id VARCHAR(64) NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_transfers_different_accounts CHECK (from_account_id <> to_account_id)
);

CREATE INDEX IF NOT EXISTS idx_transfers_user_id ON transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from_account_id ON transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_account_id ON transfers(to_account_id);
