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
  current_dy DECIMAL(8,2) NOT NULL DEFAULT 0 CHECK (current_dy BETWEEN 0 AND 999999.99 AND current_dy = round(current_dy, 2) AND (type IN (1, 2) OR current_dy = 0)),
  CHECK ((quantity = 0 AND value = 0 AND average_price = 0) OR
    (quantity > 0 AND average_price = round(value * 1.0 / quantity, 2))),
  UNIQUE (name, type),
  UNIQUE (id, name, type)
);
CREATE TABLE IF NOT EXISTS finance_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  name CHAR(30) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 30),
  type SMALLINT NOT NULL CHECK (typeof(type) = 'integer' AND type BETWEEN 1 AND 5),
  quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 2147483647),
  value DECIMAL(10,2) NOT NULL CHECK (value BETWEEN 0 AND 99999999.99 AND value = round(value, 2)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (asset_id, name, type) REFERENCES finance_assets(id, name, type)
);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_asset ON finance_transactions(asset_id);
CREATE TRIGGER IF NOT EXISTS finance_transaction_apply
AFTER INSERT ON finance_transactions
BEGIN
  UPDATE finance_assets
  SET quantity = quantity + NEW.quantity,
      value = round(value + NEW.value, 2),
      average_price = round(round(value + NEW.value, 2) * 1.0 / (quantity + NEW.quantity), 2)
  WHERE id = NEW.asset_id;
END;
-- Histórico imutável: impede alterações que deixariam o saldo desatualizado.
CREATE TRIGGER IF NOT EXISTS finance_transaction_no_update
BEFORE UPDATE ON finance_transactions BEGIN SELECT RAISE(ABORT, 'Transações não podem ser editadas.'); END;
CREATE TRIGGER IF NOT EXISTS finance_transaction_no_delete
BEFORE DELETE ON finance_transactions BEGIN SELECT RAISE(ABORT, 'Transações não podem ser excluídas.'); END;
