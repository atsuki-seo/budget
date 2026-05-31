ALTER TABLE imports
  ADD COLUMN source_type VARCHAR(20) NOT NULL DEFAULT 'csv' AFTER id,
  ADD KEY idx_imports_source_type (source_type);
