-- Cartão de crédito: grupos, períodos de fatura e parcelas.
CREATE TABLE IF NOT EXISTS credit_card_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name CHAR(30) COLLATE NOCASE NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 30 AND name = trim(name)),
  name_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS credit_card_periods (
  id TEXT PRIMARY KEY NOT NULL,
  month INTEGER NOT NULL CHECK (typeof(month) = 'integer' AND month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (typeof(year) = 'integer' AND year BETWEEN 1900 AND 9999),
  start_date TEXT NOT NULL CHECK (start_date = date(start_date, '+0 days')),
  end_date TEXT NOT NULL CHECK (end_date = date(end_date, '+0 days') AND end_date >= start_date),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (month, year)
);
CREATE TRIGGER IF NOT EXISTS credit_card_period_no_overlap_insert BEFORE INSERT ON credit_card_periods
WHEN EXISTS (SELECT 1 FROM credit_card_periods WHERE NEW.start_date <= end_date AND NEW.end_date >= start_date)
BEGIN SELECT RAISE(ABORT, 'O período sobrepõe outra fatura.'); END;
CREATE TABLE IF NOT EXISTS credit_card_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  series_id TEXT NOT NULL,
  transaction_date TEXT NOT NULL CHECK (transaction_date = date(transaction_date, '+0 days')),
  name CHAR(120) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120 AND name = trim(name)),
  value DECIMAL(10,2) NOT NULL CHECK (value BETWEEN 0 AND 99999999.99 AND value = round(value, 2)),
  group_id TEXT NOT NULL,
  payment SMALLINT NOT NULL CHECK (payment IN (1, 2)),
  installment_number INTEGER NOT NULL CHECK (typeof(installment_number) = 'integer' AND installment_number >= 1),
  installment_count INTEGER NOT NULL CHECK (typeof(installment_count) = 'integer' AND installment_count >= installment_number AND installment_count <= 999),
  period_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (group_id) REFERENCES credit_card_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (period_id) REFERENCES credit_card_periods(id) ON UPDATE CASCADE ON DELETE SET NULL,
  UNIQUE (series_id, installment_number),
  CHECK ((payment = 1 AND installment_number = 1 AND installment_count = 1) OR payment = 2)
);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_period ON credit_card_transactions(period_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_group ON credit_card_transactions(group_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_date ON credit_card_transactions(transaction_date);
CREATE TRIGGER IF NOT EXISTS credit_card_transaction_fit AFTER INSERT ON credit_card_transactions
BEGIN
  UPDATE credit_card_transactions SET period_id = (
    SELECT id FROM credit_card_periods WHERE NEW.transaction_date BETWEEN start_date AND end_date LIMIT 1
  ) WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS credit_card_period_fit AFTER INSERT ON credit_card_periods
BEGIN
  UPDATE credit_card_transactions SET period_id = NEW.id
  WHERE transaction_date BETWEEN NEW.start_date AND NEW.end_date;
END;
