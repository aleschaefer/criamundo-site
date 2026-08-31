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
-- Tipos: 1=Ação, 2=FII, 3=Renda Fixa, 4=BDR, 5=Outro.
-- SQLite/D1 não impõe CHAR/DECIMAL: os CHECKs abaixo validam os limites.
CREATE TABLE IF NOT EXISTS finance_assets (
  id TEXT PRIMARY KEY NOT NULL,
  name CHAR(30) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 30 AND name = trim(name)),
  type SMALLINT NOT NULL CHECK (typeof(type) = 'integer' AND type BETWEEN 1 AND 5),
  quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 0 AND 2147483647),
  average_price DECIMAL(8,2) NOT NULL CHECK (average_price BETWEEN 0 AND 999999.99 AND average_price = round(average_price, 2)),
  value DECIMAL(10,2) NOT NULL CHECK (value BETWEEN 0 AND 99999999.99 AND value = round(value, 2)),
  current_price DECIMAL(8,2) CHECK (current_price IS NULL OR (type IN (1, 2) AND current_price BETWEEN 0 AND 999999.99 AND current_price = round(current_price, 2))),
  -- Campo legado preservado; a API calcula os DY usando current_income.
  current_dy DECIMAL(8,2) NOT NULL DEFAULT 0 CHECK (current_dy BETWEEN 0 AND 999999.99 AND current_dy = round(current_dy, 2) AND (type IN (1, 2) OR current_dy = 0)),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  current_income DECIMAL(7,5) NOT NULL DEFAULT 0 CHECK (current_income BETWEEN 0 AND 99.99999 AND current_income = round(current_income, 5) AND (type IN (1, 2) OR current_income = 0)),
  CHECK ((quantity = 0 AND value = 0 AND average_price = 0) OR
    (quantity > 0 AND average_price = round(value * 1.0 / quantity, 2))),
  UNIQUE (name, type),
  UNIQUE (id, name, type)
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
  type SMALLINT NOT NULL CHECK (typeof(type) = 'integer' AND type BETWEEN 1 AND 5),
  quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 2147483647),
  value DECIMAL(10,2) NOT NULL CHECK (value BETWEEN 0 AND 99999999.99 AND value = round(value, 2)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (asset_id, name, type) REFERENCES finance_assets(id, name, type) ON UPDATE CASCADE ON DELETE RESTRICT
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
CREATE TRIGGER IF NOT EXISTS finance_transaction_metadata AFTER UPDATE OF name, type ON finance_transactions
WHEN NEW.name != OLD.name OR NEW.type != OLD.type
BEGIN
  UPDATE finance_transactions SET revision = revision + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS finance_asset_created AFTER INSERT ON finance_assets
BEGIN
  UPDATE finance_assets SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS finance_asset_updated
AFTER UPDATE OF name, type, quantity, average_price, value, current_price, current_income, revision ON finance_assets
BEGIN
  UPDATE finance_assets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS finance_transaction_created AFTER INSERT ON finance_transactions
BEGIN
  UPDATE finance_transactions SET updated_at = NEW.created_at WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS finance_transaction_updated
AFTER UPDATE OF asset_id, name, type, quantity, value, revision, transaction_date ON finance_transactions
BEGIN
  UPDATE finance_transactions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS finance_transaction_date_required BEFORE INSERT ON finance_transactions
WHEN NEW.transaction_date IS NULL
BEGIN SELECT RAISE(ABORT, 'Informe a data da transação.'); END;
CREATE TRIGGER IF NOT EXISTS finance_transaction_date_not_cleared BEFORE UPDATE OF transaction_date ON finance_transactions
WHEN NEW.transaction_date IS NULL
BEGIN SELECT RAISE(ABORT, 'Informe a data da transação.'); END;
