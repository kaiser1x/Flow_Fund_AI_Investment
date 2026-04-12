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
    volatility_score DECIMAL(15,4),
    cash_buffer_months DECIMAL(15,4),
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

-- 9. plaid_items (Bank Aggregator API — one item per institution link per user)
CREATE TABLE IF NOT EXISTS plaid_items (
    item_id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id              INT NOT NULL,
    plaid_item_id        VARCHAR(255) NOT NULL UNIQUE,
    access_token_encrypted TEXT NOT NULL,
    institution_id       VARCHAR(100),
    institution_name     VARCHAR(150),
    transactions_sync_cursor TEXT NULL,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 10. notifications
CREATE TABLE IF NOT EXISTS notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    type            ENUM('spending_alert','budget_warning','large_transaction','system') NOT NULL DEFAULT 'system',
    title           VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 12. simulations (saved snapshots)
CREATE TABLE IF NOT EXISTS simulations (
    sim_id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    name            VARCHAR(100) NOT NULL,
    scenario_type   ENUM('compound_interest','stock_market','debt_payoff','emergency_fund') NOT NULL,
    inputs          JSON NOT NULL,
    result_summary  JSON NOT NULL,
    projection_data JSON NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 13. goals
CREATE TABLE IF NOT EXISTS goals (
    goal_id        INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT NOT NULL,
    name           VARCHAR(100) NOT NULL,
    type           ENUM('savings','debt_payoff','spending_limit','investment_target') NOT NULL,
    target_amount  DECIMAL(15,2) NOT NULL,
    current_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    target_date    DATE NOT NULL,
    notes          TEXT,
    status         ENUM('active','completed','archived') NOT NULL DEFAULT 'active',
    auto_track     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 11. admins
CREATE TABLE IF NOT EXISTS admins (
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    admin_level ENUM('SUPER_ADMIN', 'MODERATOR') DEFAULT 'MODERATOR',
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 10b. user_alert_preferences (configure alerts — UC-7)
CREATE TABLE IF NOT EXISTS user_alert_preferences (
    user_id INT PRIMARY KEY,
    anomaly_amount_enabled TINYINT(1) NOT NULL DEFAULT 1,
    anomaly_amount_multiplier DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    spending_spike_enabled TINYINT(1) NOT NULL DEFAULT 1,
    low_cash_buffer_enabled TINYINT(1) NOT NULL DEFAULT 1,
    low_cash_buffer_threshold_months DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    readiness_change_enabled TINYINT(1) NOT NULL DEFAULT 1,
    readiness_change_min_points INT NOT NULL DEFAULT 1,
    goal_milestone_enabled TINYINT(1) NOT NULL DEFAULT 1,
    weekly_expense_highlight_enabled TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 10c. anomaly_events (logged detections — Req. 9)
CREATE TABLE IF NOT EXISTS anomaly_events (
    anomaly_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    transaction_id INT NULL,
    anomaly_type VARCHAR(64) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning',
    details JSON NULL,
    notification_sent TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_anomaly_user_time (user_id, created_at)
);

-- 10d. notification_delivery_log (failed in-app inserts — UC-7 exception path)
CREATE TABLE IF NOT EXISTS notification_delivery_log (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    channel VARCHAR(32) NOT NULL DEFAULT 'in_app',
    notification_type VARCHAR(32) NULL,
    title VARCHAR(255) NULL,
    success TINYINT(1) NOT NULL DEFAULT 1,
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
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
