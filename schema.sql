CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  xml_content TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_content_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  xml_content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (content_id) REFERENCES site_content(id)
);

CREATE INDEX IF NOT EXISTS idx_site_content_backups_created_at
ON site_content_backups(created_at DESC);

-- Finanças: aplicar antes de publicar o código novo.
-- Tipos: 1=Renda Variável, 2=Renda Fixa, 3=Outro.
-- Subtipos: 1=Ações, 2=FII, 3=BDR, 4=CBD, 5=LCA, 6=LCI, 7=Outro.
-- SQLite/D1 não impõe CHAR/DECIMAL: os CHECKs abaixo validam os limites.
CREATE TABLE IF NOT EXISTS finance_assets (
  id TEXT PRIMARY KEY NOT NULL,
  name CHAR(30) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 30 AND name = trim(name)),
  type SMALLINT NOT NULL CHECK (typeof(type) = 'integer' AND type BETWEEN 1 AND 3),
  subtype SMALLINT NOT NULL CHECK (typeof(subtype) = 'integer' AND (
    (type = 1 AND subtype IN (1, 2, 3)) OR
    (type = 2 AND subtype IN (4, 5, 6, 7)) OR (type = 3 AND subtype = 7)
  )),
  quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 0 AND 2147483647),
  average_price DECIMAL(8,2) NOT NULL CHECK (average_price BETWEEN 0 AND 999999.99 AND average_price = round(average_price, 2)),
  value DECIMAL(10,2) NOT NULL CHECK (value BETWEEN 0 AND 99999999.99 AND value = round(value, 2)),
  current_price DECIMAL(8,2) CHECK (current_price IS NULL OR (((type = 1 AND subtype IN (1, 2)) OR type = 2) AND current_price BETWEEN 0 AND 999999.99 AND current_price = round(current_price, 2))),
  -- Campo legado preservado; a API calcula os DY usando current_income.
  current_dy DECIMAL(8,2) NOT NULL DEFAULT 0 CHECK (current_dy BETWEEN 0 AND 999999.99 AND current_dy = round(current_dy, 2) AND ((type = 1 AND subtype IN (1, 2)) OR current_dy = 0)),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  current_income DECIMAL(7,5) NOT NULL DEFAULT 0 CHECK (current_income BETWEEN 0 AND 99.99999 AND current_income = round(current_income, 5) AND ((type = 1 AND subtype IN (1, 2)) OR current_income = 0)),
  CHECK ((quantity = 0 AND value = 0 AND average_price = 0) OR
    (quantity > 0 AND average_price = round(value * 1.0 / quantity, 2))),
  UNIQUE (name, type, subtype),
  UNIQUE (id, name, type, subtype)
);
CREATE TABLE IF NOT EXISTS finance_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  transaction_date TEXT CHECK (transaction_date IS NULL OR (
    transaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND transaction_date >= '0001-01-01'
    AND date(transaction_date, '+0 days') IS NOT NULL
    AND transaction_date = date(transaction_date, '+0 days')
  )),
  name CHAR(30) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 30),
  type SMALLINT NOT NULL CHECK (typeof(type) = 'integer' AND type BETWEEN 1 AND 3),
  subtype SMALLINT NOT NULL CHECK (typeof(subtype) = 'integer' AND (
    (type = 1 AND subtype IN (1, 2, 3)) OR
    (type = 2 AND subtype IN (4, 5, 6, 7)) OR (type = 3 AND subtype = 7)
  )),
  quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 2147483647),
  value DECIMAL(10,2) NOT NULL CHECK (value BETWEEN 0 AND 99999999.99 AND value = round(value, 2)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (asset_id, name, type, subtype) REFERENCES finance_assets(id, name, type, subtype) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_asset ON finance_transactions(asset_id);
CREATE TRIGGER IF NOT EXISTS finance_transaction_apply AFTER INSERT ON finance_transactions
BEGIN
  UPDATE finance_assets SET
    quantity = quantity + NEW.quantity,
    value = round(value + NEW.value, 2),
    average_price = round(round(value + NEW.value, 2) * 1.0 / (quantity + NEW.quantity), 2),
    revision = revision + 1
  WHERE id = NEW.asset_id;
END;
CREATE TRIGGER IF NOT EXISTS finance_transaction_edit AFTER UPDATE OF asset_id, quantity, value ON finance_transactions
BEGIN
  UPDATE finance_assets SET
    quantity = quantity - CASE WHEN id = OLD.asset_id THEN OLD.quantity ELSE 0 END + CASE WHEN id = NEW.asset_id THEN NEW.quantity ELSE 0 END,
    value = round(value - CASE WHEN id = OLD.asset_id THEN OLD.value ELSE 0 END + CASE WHEN id = NEW.asset_id THEN NEW.value ELSE 0 END, 2),
    average_price = CASE WHEN quantity - CASE WHEN id = OLD.asset_id THEN OLD.quantity ELSE 0 END + CASE WHEN id = NEW.asset_id THEN NEW.quantity ELSE 0 END = 0 THEN 0 ELSE
      round(round(value - CASE WHEN id = OLD.asset_id THEN OLD.value ELSE 0 END + CASE WHEN id = NEW.asset_id THEN NEW.value ELSE 0 END, 2) * 1.0 /
      (quantity - CASE WHEN id = OLD.asset_id THEN OLD.quantity ELSE 0 END + CASE WHEN id = NEW.asset_id THEN NEW.quantity ELSE 0 END), 2) END,
    revision = revision + 1
  WHERE id IN (OLD.asset_id, NEW.asset_id);
END;
CREATE TRIGGER IF NOT EXISTS finance_transaction_delete AFTER DELETE ON finance_transactions
BEGIN
  UPDATE finance_assets SET
    quantity = quantity - OLD.quantity,
    value = round(value - OLD.value, 2),
    average_price = CASE WHEN quantity = OLD.quantity THEN 0 ELSE round(round(value - OLD.value, 2) * 1.0 / (quantity - OLD.quantity), 2) END,
    revision = revision + 1
  WHERE id = OLD.asset_id;
END;
CREATE TRIGGER IF NOT EXISTS finance_transaction_metadata AFTER UPDATE OF name, type, subtype ON finance_transactions
WHEN NEW.name != OLD.name OR NEW.type != OLD.type OR NEW.subtype != OLD.subtype
BEGIN
  UPDATE finance_transactions SET revision = revision + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS finance_asset_created AFTER INSERT ON finance_assets
BEGIN
  UPDATE finance_assets SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS finance_asset_updated
AFTER UPDATE OF name, type, subtype, quantity, average_price, value, current_price, current_income, revision ON finance_assets
BEGIN
  UPDATE finance_assets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS finance_transaction_created AFTER INSERT ON finance_transactions
BEGIN
  UPDATE finance_transactions SET updated_at = NEW.created_at WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS finance_transaction_updated
AFTER UPDATE OF asset_id, name, type, subtype, quantity, value, revision, transaction_date ON finance_transactions
BEGIN
  UPDATE finance_transactions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS finance_transaction_date_required BEFORE INSERT ON finance_transactions
WHEN NEW.transaction_date IS NULL
BEGIN SELECT RAISE(ABORT, 'Informe a data da transação.'); END;
CREATE TRIGGER IF NOT EXISTS finance_transaction_date_not_cleared BEFORE UPDATE OF transaction_date ON finance_transactions
WHEN NEW.transaction_date IS NULL
BEGIN SELECT RAISE(ABORT, 'Informe a data da transação.'); END;
-- Cartão de crédito: grupos, períodos de fatura e parcelas.
CREATE TABLE IF NOT EXISTS credit_card_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name CHAR(30) COLLATE NOCASE NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 30 AND name = trim(name)),
  name_key TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS credit_card_periods (
  id TEXT PRIMARY KEY NOT NULL,
  month INTEGER NOT NULL CHECK (typeof(month) = 'integer' AND month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (typeof(year) = 'integer' AND year BETWEEN 1900 AND 9999),
  start_date TEXT NOT NULL CHECK (start_date = date(start_date, '+0 days')),
  end_date TEXT NOT NULL CHECK (end_date = date(end_date, '+0 days') AND end_date >= start_date),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revision INTEGER NOT NULL DEFAULT 0,
  UNIQUE (month, year)
);
CREATE TRIGGER IF NOT EXISTS credit_card_period_no_overlap_insert BEFORE INSERT ON credit_card_periods
WHEN EXISTS (SELECT 1 FROM credit_card_periods WHERE NEW.start_date <= end_date AND NEW.end_date >= start_date)
BEGIN SELECT RAISE(ABORT, 'O período sobrepõe outra fatura.'); END;
CREATE TABLE IF NOT EXISTS credit_card_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  series_id TEXT NOT NULL,
  transaction_date TEXT NOT NULL CHECK (transaction_date = date(transaction_date, '+0 days')),
  name CHAR(50) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 50 AND name = trim(name)),
  value DECIMAL(10,2) NOT NULL CHECK (value BETWEEN 0 AND 99999999.99 AND value = round(value, 2)),
  group_id TEXT NOT NULL,
  payment SMALLINT NOT NULL CHECK (payment IN (1, 2)),
  installment_number INTEGER NOT NULL CHECK (typeof(installment_number) = 'integer' AND installment_number >= 1),
  installment_count INTEGER NOT NULL CHECK (typeof(installment_count) = 'integer' AND installment_count >= installment_number AND installment_count <= 999),
  period_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (group_id) REFERENCES credit_card_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (period_id) REFERENCES credit_card_periods(id) ON UPDATE CASCADE ON DELETE SET NULL,
  UNIQUE (series_id, installment_number),
  CHECK ((payment = 1 AND installment_number = 1 AND installment_count = 1) OR payment = 2)
);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_period ON credit_card_transactions(period_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_group ON credit_card_transactions(group_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_date ON credit_card_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_credit_card_transactions_created ON credit_card_transactions(deleted_at, created_at DESC);
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
-- Permite edição segura de grupos e períodos e reencaixa transações.
CREATE TRIGGER IF NOT EXISTS credit_card_period_no_overlap_update BEFORE UPDATE OF start_date, end_date ON credit_card_periods
WHEN EXISTS (SELECT 1 FROM credit_card_periods WHERE id != NEW.id AND NEW.start_date <= end_date AND NEW.end_date >= start_date)
BEGIN SELECT RAISE(ABORT, 'O período sobrepõe outra fatura.'); END;
CREATE TRIGGER IF NOT EXISTS credit_card_period_refit AFTER UPDATE OF start_date, end_date ON credit_card_periods
BEGIN
  UPDATE credit_card_transactions SET period_id = (
    SELECT id FROM credit_card_periods p
    WHERE credit_card_transactions.transaction_date BETWEEN p.start_date AND p.end_date LIMIT 1
  );
END;

-- Importação auditável de faturas em PDF e reconciliação de parcelas projetadas.
CREATE TABLE IF NOT EXISTS credit_card_imports (
  id TEXT PRIMARY KEY NOT NULL,
  file_hash TEXT NOT NULL UNIQUE CHECK (length(file_hash) = 64),
  file_name TEXT NOT NULL CHECK (length(trim(file_name)) BETWEEN 1 AND 180),
  period_id TEXT NOT NULL,
  item_count INTEGER NOT NULL CHECK (item_count BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status = 'CONFIRMED'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (period_id) REFERENCES credit_card_periods(id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS credit_card_import_items (
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
CREATE TABLE IF NOT EXISTS credit_card_transaction_meta (
  transaction_id TEXT PRIMARY KEY NOT NULL,
  purchase_date TEXT NOT NULL CHECK (purchase_date = date(purchase_date, '+0 days')),
  source_series_key TEXT NOT NULL,
  source_import_item_id TEXT UNIQUE,
  is_projected INTEGER NOT NULL DEFAULT 0 CHECK (is_projected IN (0, 1)),
  billing_month INTEGER NOT NULL CHECK (billing_month BETWEEN 1 AND 12),
  billing_year INTEGER NOT NULL CHECK (billing_year BETWEEN 1900 AND 9999),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (transaction_id) REFERENCES credit_card_transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (source_import_item_id) REFERENCES credit_card_import_items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_card_imports_period ON credit_card_imports(period_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_import_items_import ON credit_card_import_items(import_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_meta_series ON credit_card_transaction_meta(source_series_key, is_projected);
CREATE INDEX IF NOT EXISTS idx_credit_card_meta_billing ON credit_card_transaction_meta(billing_year, billing_month);
CREATE TRIGGER IF NOT EXISTS credit_card_period_fit_import AFTER INSERT ON credit_card_periods
BEGIN
  UPDATE credit_card_transactions SET period_id=NEW.id
  WHERE id IN (SELECT transaction_id FROM credit_card_transaction_meta WHERE billing_month=NEW.month AND billing_year=NEW.year);
END;
DROP TRIGGER IF EXISTS credit_card_period_refit;
CREATE TRIGGER credit_card_period_refit AFTER UPDATE OF month, year, start_date, end_date ON credit_card_periods
BEGIN
  UPDATE credit_card_transactions SET period_id=COALESCE(
    (SELECT p.id FROM credit_card_periods p JOIN credit_card_transaction_meta m
      ON m.transaction_id=credit_card_transactions.id AND m.billing_month=p.month AND m.billing_year=p.year LIMIT 1),
    (SELECT p.id FROM credit_card_periods p WHERE credit_card_transactions.transaction_date BETWEEN p.start_date AND p.end_date LIMIT 1)
  );
END;
