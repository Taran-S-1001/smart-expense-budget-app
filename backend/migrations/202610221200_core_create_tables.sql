-- Migration: 202610221200_core_create_tables.sql
-- Description: Create initial schema for SEBM per approved ER Diagram (SRS v4.0 / SAD v1.1)
-- Tables: User, Account, Category, Transaction, Budget, Receipt, Notification

-- 1. User Table
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'User' CHECK (LOWER(role) IN ('user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Account Table
CREATE TABLE IF NOT EXISTS accounts (
    account_id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    account_type VARCHAR(50) NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- 3. Category Table
CREATE TABLE IF NOT EXISTS categories (
    category_id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(64) REFERENCES users(user_id) ON DELETE CASCADE, -- Nullable for predefined categories
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (LOWER(type) IN ('expense', 'income')),
    is_custom BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_categories_user_name_type UNIQUE NULLS NOT DISTINCT (user_id, name, type)
);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);

-- 4. Transaction Table
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    account_id VARCHAR(64) NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    category_id VARCHAR(64) NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    date DATE NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (LOWER(type) IN ('expense', 'income')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

-- 5. Budget Table
CREATE TABLE IF NOT EXISTS budgets (
    budget_id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    category_id VARCHAR(64) REFERENCES categories(category_id) ON DELETE CASCADE, -- Nullable for overall monthly budget
    period VARCHAR(50) NOT NULL,
    limit_amount NUMERIC(12, 2) NOT NULL CHECK (limit_amount > 0),
    alert_threshold NUMERIC(5, 2) NOT NULL CHECK (alert_threshold >= 0 AND alert_threshold <= 100),
    CONSTRAINT uq_budgets_user_cat_period UNIQUE NULLS NOT DISTINCT (user_id, category_id, period)
);

CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);

-- 6. Receipt Table
CREATE TABLE IF NOT EXISTS receipts (
    receipt_id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    transaction_id VARCHAR(64) NOT NULL UNIQUE REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receipts_transaction_id ON receipts(transaction_id);

-- 7. Notification Table
CREATE TABLE IF NOT EXISTS notifications (
    notification_id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
