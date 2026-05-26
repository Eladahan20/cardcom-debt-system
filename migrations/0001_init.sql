-- =========================================
-- Cardcom Debt Manager - Initial Schema
-- =========================================

PRAGMA foreign_keys = ON;

-- =========================================
-- CUSTOMERS
-- =========================================

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    cardcom_customer_number TEXT NOT NULL UNIQUE,

    name TEXT,
    email TEXT,
    id_number TEXT,

    current_last4 TEXT,
    previous_last4 TEXT,

    monthly_amount REAL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_customer_number
ON customers(cardcom_customer_number);

CREATE INDEX IF NOT EXISTS idx_customers_email
ON customers(email);

CREATE INDEX IF NOT EXISTS idx_customers_id_number
ON customers(id_number);

-- =========================================
-- IMPORTS
-- =========================================

CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    file_name TEXT NOT NULL,

    total_rows INTEGER DEFAULT 0,

    new_transactions INTEGER DEFAULT 0,
    duplicate_transactions INTEGER DEFAULT 0,

    new_customers INTEGER DEFAULT 0,
    updated_customers INTEGER DEFAULT 0,

    new_cases INTEGER DEFAULT 0,
    updated_cases INTEGER DEFAULT 0,
    closed_cases INTEGER DEFAULT 0,

    card_replacements_detected INTEGER DEFAULT 0,

    status TEXT DEFAULT 'PROCESSING',

    error_message TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- =========================================
-- TRANSACTIONS
-- =========================================

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    import_id INTEGER,

    customer_id INTEGER,

    cardcom_transaction_number TEXT NOT NULL UNIQUE,

    transaction_date TEXT,
    transaction_time TEXT,

    transaction_datetime DATETIME,

    response_text TEXT,
    response_category TEXT,

    amount REAL,

    last4 TEXT,

    transaction_type TEXT,
    transaction_source TEXT,

    brand TEXT,

    is_3ds INTEGER DEFAULT 0,

    cardholder_name TEXT,

    email TEXT,
    id_number TEXT,

    cardcom_customer_number TEXT,

    document_linked INTEGER DEFAULT 0,

    charge_location TEXT,

    debtors_list_value TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (customer_id)
    REFERENCES customers(id),

    FOREIGN KEY (import_id)
    REFERENCES imports(id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_customer_id
ON transactions(customer_id);

CREATE INDEX IF NOT EXISTS idx_transactions_datetime
ON transactions(transaction_datetime);

CREATE INDEX IF NOT EXISTS idx_transactions_response_category
ON transactions(response_category);

CREATE INDEX IF NOT EXISTS idx_transactions_charge_location
ON transactions(charge_location);

CREATE INDEX IF NOT EXISTS idx_transactions_customer_number
ON transactions(cardcom_customer_number);

-- =========================================
-- DEBT CASES
-- =========================================

CREATE TABLE IF NOT EXISTS debt_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    customer_id INTEGER NOT NULL,

    status TEXT NOT NULL,

    first_failed_at DATETIME,
    last_failed_at DATETIME,

    last_success_at DATETIME,

    first_failed_last4 TEXT,
    current_last4 TEXT,

    failure_count INTEGER DEFAULT 0,

    last_failure_reason TEXT,

    card_replaced INTEGER DEFAULT 0,
    card_replaced_at DATETIME,

    assigned_to TEXT,

    closed_at DATETIME,
    close_reason TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (customer_id)
    REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_debt_cases_customer_id
ON debt_cases(customer_id);

CREATE INDEX IF NOT EXISTS idx_debt_cases_status
ON debt_cases(status);

CREATE INDEX IF NOT EXISTS idx_debt_cases_card_replaced
ON debt_cases(card_replaced);

-- =========================================
-- CASE EVENTS
-- =========================================

CREATE TABLE IF NOT EXISTS case_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    case_id INTEGER NOT NULL,

    customer_id INTEGER NOT NULL,

    event_type TEXT NOT NULL,

    event_text TEXT,

    created_by TEXT DEFAULT 'system',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (case_id)
    REFERENCES debt_cases(id),

    FOREIGN KEY (customer_id)
    REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_case_events_case_id
ON case_events(case_id);

CREATE INDEX IF NOT EXISTS idx_case_events_customer_id
ON case_events(customer_id);

CREATE INDEX IF NOT EXISTS idx_case_events_event_type
ON case_events(event_type);