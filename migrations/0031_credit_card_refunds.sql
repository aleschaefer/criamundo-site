-- Permite créditos e reembolsos com valor negativo nas faturas.
PRAGMA defer_foreign_keys = true;

DROP TRIGGER IF EXISTS credit_card_transaction_fit;
DROP TRIGGER IF EXISTS credit_card_period_fit;
DROP TRIGGER IF EXISTS credit_card_period_fit_import;
DROP TRIGGER IF EXISTS credit_card_period_refit;

ALTER TABLE credit_card_transactions RENAME TO credit_card_transactions_before_refunds;
ALTER TABLE credit_card_import_items RENAME TO credit_card_import_items_before_refunds;
ALTER TABLE credit_card_transaction_meta RENAME TO credit_card_transaction_meta_before_refunds;

CREATE TABLE credit_card_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  series_id TEXT NOT NULL,
  transaction_date TEXT NOT NULL CHECK (transaction_date = date(transaction_date, '+0 days')),
  name CHAR(120) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120 AND name = trim(name)),
  value DECIMAL(10,2) NOT NULL CHECK (value BETWEEN -99999999.99 AND 99999999.99 AND value = round(value, 2)),
  group_id TEXT NOT NULL,
  payment SMALLINT NOT NULL CHECK (payment IN (1, 2)),
  installment_number INTEGER NOT NULL CHECK (typeof(installment_number) = 'integer' AND installment_number >= 1),
  installment_count INTEGER NOT NULL CHECK (typeof(installment_count) = 'integer' AND installment_count >= installment_number AND installment_count <= 999),
  period_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (group_id) REFERENCES credit_card_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (period_id) REFERENCES credit_card_periods(id) ON UPDATE CASCADE ON DELETE SET NULL,
  UNIQUE (series_id, installment_number),
  CHECK ((payment = 1 AND installment_number = 1 AND installment_count = 1) OR payment = 2)
);

CREATE TABLE credit_card_import_items (
  id TEXT PRIMARY KEY NOT NULL,
  import_id TEXT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  row_number INTEGER NOT NULL CHECK (row_number >= 1),
  purchase_date TEXT NOT NULL CHECK (purchase_date = date(purchase_date, '+0 days')),
  raw_name TEXT NOT NULL CHECK (length(trim(raw_name)) BETWEEN 1 AND 120),
  value DECIMAL(10,2) NOT NULL CHECK (value != 0 AND value BETWEEN -99999999.99 AND 99999999.99 AND value = round(value, 2)),
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
  billing_month INTEGER CHECK (billing_month BETWEEN 1 AND 12),
  billing_year INTEGER CHECK (billing_year BETWEEN 1900 AND 9999),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (transaction_id) REFERENCES credit_card_transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (source_import_item_id) REFERENCES credit_card_import_items(id) ON DELETE SET NULL
);

INSERT INTO credit_card_transactions
SELECT id,series_id,transaction_date,name,value,group_id,payment,installment_number,installment_count,
       period_id,created_at,revision,updated_at,deleted_at
FROM credit_card_transactions_before_refunds;

INSERT INTO credit_card_import_items
SELECT id,import_id,page_number,row_number,purchase_date,raw_name,value,confidence,transaction_id,created_at
FROM credit_card_import_items_before_refunds;

INSERT INTO credit_card_transaction_meta
SELECT transaction_id,purchase_date,source_series_key,source_import_item_id,is_projected,billing_month,billing_year,created_at
FROM credit_card_transaction_meta_before_refunds;

DROP TABLE credit_card_transaction_meta_before_refunds;
DROP TABLE credit_card_import_items_before_refunds;
DROP TABLE credit_card_transactions_before_refunds;

CREATE INDEX idx_credit_card_transactions_period ON credit_card_transactions(period_id);
CREATE INDEX idx_credit_card_transactions_group ON credit_card_transactions(group_id);
CREATE INDEX idx_credit_card_transactions_date ON credit_card_transactions(transaction_date);
CREATE INDEX idx_credit_card_transactions_created ON credit_card_transactions(deleted_at, created_at DESC);
CREATE INDEX idx_credit_card_import_items_import ON credit_card_import_items(import_id);
CREATE INDEX idx_credit_card_meta_series ON credit_card_transaction_meta(source_series_key, is_projected);
CREATE INDEX idx_credit_card_meta_billing ON credit_card_transaction_meta(billing_year, billing_month);

CREATE TRIGGER credit_card_transaction_fit AFTER INSERT ON credit_card_transactions
BEGIN
  UPDATE credit_card_transactions SET period_id = (
    SELECT id FROM credit_card_periods WHERE NEW.transaction_date BETWEEN start_date AND end_date LIMIT 1
  ) WHERE id = NEW.id;
END;
CREATE TRIGGER credit_card_period_fit AFTER INSERT ON credit_card_periods
BEGIN
  UPDATE credit_card_transactions SET period_id = NEW.id
  WHERE transaction_date BETWEEN NEW.start_date AND NEW.end_date;
END;
CREATE TRIGGER credit_card_period_fit_import AFTER INSERT ON credit_card_periods
BEGIN
  UPDATE credit_card_transactions SET period_id=NEW.id
  WHERE id IN (SELECT transaction_id FROM credit_card_transaction_meta WHERE billing_month=NEW.month AND billing_year=NEW.year);
END;
CREATE TRIGGER credit_card_period_refit AFTER UPDATE OF month, year, start_date, end_date ON credit_card_periods
BEGIN
  UPDATE credit_card_transactions SET period_id=COALESCE(
    (SELECT p.id FROM credit_card_periods p JOIN credit_card_transaction_meta m
      ON m.transaction_id=credit_card_transactions.id AND m.billing_month=p.month AND m.billing_year=p.year LIMIT 1),
    (SELECT p.id FROM credit_card_periods p WHERE credit_card_transactions.transaction_date BETWEEN p.start_date AND p.end_date LIMIT 1)
  );
END;
