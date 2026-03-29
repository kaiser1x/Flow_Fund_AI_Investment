-- FlowFund AI - Full schema (Railway MySQL or local)
-- Run in your database (e.g. Railway's "railway" database)

-- 1. roles
CREATE TABLE IF NOT EXISTS roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE
);

INSERT IGNORE INTO roles (role_id, role_name) VALUES (1, 'admin'), (2, 'user');

-- 2. users
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

-- 3. user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
    profile_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    date_of_birth DATE,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 4. user_sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    user_id INT NOT NULL,
    jwt_token TEXT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 5. bank_accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
    account_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    bank_name VARCHAR(150),
    account_type ENUM('CHECKING', 'SAVINGS', 'CREDIT'),
    balance DECIMAL(15,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 6. transactions
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    account_id INT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    transaction_type ENUM('INCOME', 'EXPENSE'),
    category VARCHAR(100),
    description TEXT,
    transaction_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES bank_accounts(account_id)
);

-- 7. financial_metrics
CREATE TABLE IF NOT EXISTS financial_metrics (
    metric_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    monthly_income DECIMAL(15,2),
    monthly_expenses DECIMAL(15,2),
    savings_rate DECIMAL(5,2),
    volatility_score DECIMAL(5,2),
    cash_buffer_months DECIMAL(5,2),
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 8. investment_scores
CREATE TABLE IF NOT EXISTS investment_scores (
    score_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    score_value INT,
    risk_level ENUM('LOW', 'MEDIUM', 'HIGH'),
    recommendation TEXT,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

<<<<<<< HEAD
=======
-- transactions extended for Bank Aggregator API deduplication
ALTER TABLE transactions
  ADD COLUMN plaid_transaction_id VARCHAR(100) UNIQUE;

-- bank_accounts extended for Bank Aggregator API support
ALTER TABLE bank_accounts
  ADD COLUMN plaid_account_id VARCHAR(100) UNIQUE,
  ADD COLUMN plaid_item_id    VARCHAR(255),
  ADD COLUMN mask             VARCHAR(10);

-- Remove legacy FK that can block plaid_item_id type migrations
ALTER TABLE bank_accounts
  DROP FOREIGN KEY fk_bank_accounts_plaid_item;

-- Force correct Plaid column types on existing databases created with older schema
ALTER TABLE bank_accounts
  MODIFY COLUMN plaid_account_id VARCHAR(100),
  MODIFY COLUMN plaid_item_id    VARCHAR(255);

>>>>>>> e1cb552683721aaaf04ad8a5ff167540ce1ce3d0
-- 9. plaid_items (Bank Aggregator API — one item per institution link per user)
-- Stores the encrypted aggregator access token at the item level.
-- One item may yield multiple bank_accounts (added in commit 4).
CREATE TABLE IF NOT EXISTS plaid_items (
    item_id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id              INT NOT NULL,
    plaid_item_id        VARCHAR(255) NOT NULL UNIQUE,
    access_token_encrypted TEXT NOT NULL,
    institution_id       VARCHAR(100),
    institution_name     VARCHAR(150),
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Force correct PK behavior in case item_id was created without AUTO_INCREMENT
ALTER TABLE plaid_items
  MODIFY COLUMN item_id INT NOT NULL AUTO_INCREMENT;

-- Force correct type in case plaid_items.plaid_item_id was previously created as INT
ALTER TABLE plaid_items
  MODIFY COLUMN plaid_item_id VARCHAR(255) NOT NULL;

-- Legacy compatibility: older schemas stored encrypted token parts in separate NOT NULL columns.
-- Ensure these columns (if present) do not block inserts that now use access_token_encrypted.
ALTER TABLE plaid_items
  ADD COLUMN access_token_iv TEXT NULL,
  ADD COLUMN access_token_tag TEXT NULL,
  ADD COLUMN access_token_ciphertext LONGTEXT NULL;

ALTER TABLE plaid_items
  MODIFY COLUMN access_token_iv TEXT NULL,
  MODIFY COLUMN access_token_tag TEXT NULL,
  MODIFY COLUMN access_token_ciphertext LONGTEXT NULL;

-- 10. admins
CREATE TABLE IF NOT EXISTS admins (
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    admin_level ENUM('SUPER_ADMIN', 'MODERATOR') DEFAULT 'MODERATOR',
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 11. admin_actions
CREATE TABLE IF NOT EXISTS admin_actions (
    action_id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    target_user_id INT,
    action_type VARCHAR(100),
    description TEXT,
    action_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins(admin_id),
    FOREIGN KEY (target_user_id) REFERENCES users(user_id)
);
