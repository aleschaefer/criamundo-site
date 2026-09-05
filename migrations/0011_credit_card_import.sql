-- Importação auditável de faturas em PDF e reconciliação de parcelas projetadas.
CREATE TABLE credit_card_imports (
  id TEXT PRIMARY KEY NOT NULL,
  file_hash TEXT NOT NULL UNIQUE CHECK (length(file_hash) = 64),
  file_name TEXT NOT NULL CHECK (length(trim(file_name)) BETWEEN 1 AND 180),
  period_id TEXT NOT NULL,
  item_count INTEGER NOT NULL CHECK (item_count BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status = 'CONFIRMED'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (period_id) REFERENCES credit_card_periods(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE credit_card_import_items (
  id TEXT PRIMARY KEY NOT NULL,
  import_id TEXT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  row_number INTEGER NOT NULL CHECK (row_number >= 1),
  purchase_date TEXT NOT NULL CHECK (purchase_date = date(purchase_date, '+0 days')),
  raw_name TEXT NOT NULL CHECK (length(trim(raw_name)) BETWEEN 1 AND 120),
  value DECIMAL(10,2) NOT NULL CHECK (value > 0 AND value <= 99999999.99 AND value = round(value, 2)),
  confidence DECIMAL(5,2) NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  transaction_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (import_id, page_number, row_number),
  FOREIGN KEY (import_id) REFERENCES credit_card_imports(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES credit_card_transactions(id) ON DELETE RESTRICT
);

CREATE TABLE credit_card_transaction_meta (
  transaction_id TEXT PRIMARY KEY NOT NULL,
  purchase_date TEXT NOT NULL CHECK (purchase_date = date(purchase_date, '+0 days')),
  source_series_key TEXT NOT NULL,
  source_import_item_id TEXT UNIQUE,
  is_projected INTEGER NOT NULL DEFAULT 0 CHECK (is_projected IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (transaction_id) REFERENCES credit_card_transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (source_import_item_id) REFERENCES credit_card_import_items(id) ON DELETE SET NULL
);

CREATE INDEX idx_credit_card_imports_period ON credit_card_imports(period_id);
CREATE INDEX idx_credit_card_import_items_import ON credit_card_import_items(import_id);
CREATE INDEX idx_credit_card_meta_series ON credit_card_transaction_meta(source_series_key, is_projected);
