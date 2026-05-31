ALTER TABLE transactions
  ADD COLUMN transaction_type VARCHAR(20) NOT NULL DEFAULT 'expense' AFTER import_id,
  ADD KEY idx_transactions_transaction_type (transaction_type);
