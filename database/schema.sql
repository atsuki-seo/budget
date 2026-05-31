CREATE TABLE IF NOT EXISTS imports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_type VARCHAR(20) NOT NULL DEFAULT 'csv',
    statement_payment_on DATE NOT NULL,
    source_filename VARCHAR(255) NOT NULL,
    row_count INT UNSIGNED NOT NULL DEFAULT 0,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_imports_source_type (source_type),
    KEY idx_imports_statement_payment_on (statement_payment_on),
    KEY idx_imports_imported_at (imported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    import_id BIGINT UNSIGNED NULL,
    transaction_type VARCHAR(20) NOT NULL DEFAULT 'expense',
    statement_payment_on DATE NOT NULL,
    used_on DATE NOT NULL,
    merchant VARCHAR(255) NOT NULL,
    card_user VARCHAR(100) NOT NULL,
    payment_method VARCHAR(100) NOT NULL,
    payment_category VARCHAR(100) NOT NULL,
    usage_amount INT NOT NULL,
    billing_amount INT NOT NULL,
    carried_forward_amount INT NOT NULL,
    adjustment_amount INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_transactions_import_id (import_id),
    KEY idx_transactions_transaction_type (transaction_type),
    KEY idx_transactions_statement_payment_on (statement_payment_on),
    KEY idx_transactions_used_on (used_on),
    KEY idx_transactions_merchant (merchant),
    CONSTRAINT fk_transactions_import
        FOREIGN KEY (import_id) REFERENCES imports (id)
        ON UPDATE RESTRICT
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
