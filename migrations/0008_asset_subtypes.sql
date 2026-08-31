-- Aplicar uma única vez após 0007. Preserva IDs, saldos, datas, revisões e histórico.
-- Renda Fixa existente recebe subtipo Outro, pois sua modalidade não era informada.
DROP TRIGGER IF EXISTS finance_transaction_apply;
DROP TRIGGER IF EXISTS finance_transaction_edit;
DROP TRIGGER IF EXISTS finance_transaction_delete;
DROP TRIGGER IF EXISTS finance_transaction_metadata;
DROP TRIGGER IF EXISTS finance_asset_created;
DROP TRIGGER IF EXISTS finance_asset_updated;
DROP TRIGGER IF EXISTS finance_transaction_created;
DROP TRIGGER IF EXISTS finance_transaction_updated;
DROP TRIGGER IF EXISTS finance_transaction_date_required;
DROP TRIGGER IF EXISTS finance_transaction_date_not_cleared;
CREATE TABLE finance_assets_new (
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
CREATE TABLE finance_transactions_new (
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
  FOREIGN KEY (asset_id, name, type, subtype) REFERENCES finance_assets_new(id, name, type, subtype) ON UPDATE CASCADE ON DELETE RESTRICT
);
INSERT INTO finance_assets_new (id, name, type, subtype, quantity, average_price, value, current_price, current_dy, revision, created_at, updated_at, current_income)
SELECT id, name, CASE type WHEN 3 THEN 2 WHEN 5 THEN 3 ELSE 1 END, CASE type WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 4 THEN 3 ELSE 7 END, quantity, average_price, value, current_price, current_dy, revision, created_at, updated_at, current_income FROM finance_assets ORDER BY rowid;
INSERT INTO finance_transactions_new (id, asset_id, name, type, subtype, quantity, value, created_at, updated_at, transaction_date, revision)
SELECT id, asset_id, name, CASE type WHEN 3 THEN 2 WHEN 5 THEN 3 ELSE 1 END, CASE type WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 4 THEN 3 ELSE 7 END, quantity, value, created_at, updated_at, transaction_date, revision FROM finance_transactions ORDER BY rowid;
DROP TABLE finance_transactions;
DROP TABLE finance_assets;
ALTER TABLE finance_assets_new RENAME TO finance_assets;
ALTER TABLE finance_transactions_new RENAME TO finance_transactions;
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
