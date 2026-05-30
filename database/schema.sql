CREATE TABLE IF NOT EXISTS imports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    statement_payment_on DATE NOT NULL,
    source_filename VARCHAR(255) NOT NULL,
    row_count INT UNSIGNED NOT NULL DEFAULT 0,
    inserted_count INT UNSIGNED NOT NULL DEFAULT 0,
    updated_count INT UNSIGNED NOT NULL DEFAULT 0,
    unchanged_count INT UNSIGNED NOT NULL DEFAULT 0,
    superseded_count INT UNSIGNED NOT NULL DEFAULT 0,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_imports_statement_payment_on (statement_payment_on),
    KEY idx_imports_imported_at (imported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    import_id BIGINT UNSIGNED NOT NULL,
    statement_payment_on DATE NOT NULL,
    used_on DATE NOT NULL,
    merchant VARCHAR(255) NOT NULL,
    card_user VARCHAR(100) NOT NULL,
    payment_method VARCHAR(100) NOT NULL,
    payment_category VARCHAR(100) NOT NULL,
    usage_amount INT NOT NULL,
    fee_amount INT NOT NULL,
    total_amount INT NOT NULL,
    billing_amount INT NOT NULL,
    carried_forward_amount INT NOT NULL,
    adjustment_amount INT NOT NULL,
    budget_date DATE NOT NULL,
    budget_amount INT NOT NULL,
    identity_hash CHAR(64) NOT NULL,
    content_hash CHAR(64) NOT NULL,
    occurrence_no INT UNSIGNED NOT NULL,
    raw_data_json LONGTEXT NOT NULL,
    source_row_number INT UNSIGNED NOT NULL,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    superseded_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_transactions_snapshot_identity (statement_payment_on, identity_hash, occurrence_no),
    KEY idx_transactions_import_id (import_id),
    KEY idx_transactions_budget_date (budget_date),
    KEY idx_transactions_used_on (used_on),
    KEY idx_transactions_statement_payment_on (statement_payment_on),
    KEY idx_transactions_merchant (merchant),
    KEY idx_transactions_deleted (deleted_at, superseded_at),
    CONSTRAINT fk_transactions_import
        FOREIGN KEY (import_id) REFERENCES imports (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS labels (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    color CHAR(7) NOT NULL DEFAULT '#2563eb',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_labels_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transaction_labels (
    transaction_id BIGINT UNSIGNED NOT NULL,
    label_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (transaction_id, label_id),
    KEY idx_transaction_labels_label_id (label_id),
    CONSTRAINT fk_transaction_labels_transaction
        FOREIGN KEY (transaction_id) REFERENCES transactions (id)
        ON UPDATE RESTRICT
        ON DELETE CASCADE,
    CONSTRAINT fk_transaction_labels_label
        FOREIGN KEY (label_id) REFERENCES labels (id)
        ON UPDATE RESTRICT
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
