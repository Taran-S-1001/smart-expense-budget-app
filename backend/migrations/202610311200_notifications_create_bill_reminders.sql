CREATE TABLE IF NOT EXISTS bill_reminders (
    reminder_id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    bill_name VARCHAR(100) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    due_date DATE NOT NULL,
    reminder_lead_days INTEGER NOT NULL DEFAULT 1 CHECK (reminder_lead_days >= 1 AND reminder_lead_days <= 30),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'cancelled')),
    last_notified_at TIMESTAMPTZ,
    last_notified_due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bill_reminders_user_id ON bill_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_bill_reminders_status_due_date ON bill_reminders(status, due_date);

-- Persistent dispatch log table for strict idempotency and duplicate prevention
CREATE TABLE IF NOT EXISTS reminder_dispatch_log (
    reminder_id VARCHAR(64) NOT NULL REFERENCES bill_reminders(reminder_id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    notification_id VARCHAR(64),
    dispatched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (reminder_id, due_date)
);

CREATE INDEX IF NOT EXISTS idx_reminder_dispatch_log_due ON reminder_dispatch_log(due_date);
