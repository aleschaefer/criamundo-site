-- Aplicar uma vez, após 0003. Preserva os registros e habilita edição/exclusão.
ALTER TABLE finance_assets ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
DROP TRIGGER IF EXISTS finance_transaction_apply;
DROP TRIGGER IF EXISTS finance_transaction_no_update;
DROP TRIGGER IF EXISTS finance_transaction_no_delete;
CREATE TABLE finance_transactions_new (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  name CHAR(30) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 30),
  type SMALLINT NOT NULL CHECK (typeof(type) = 'integer' AND type BETWEEN 1 AND 5),
  quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 2147483647),
  value DECIMAL(10,2) NOT NULL CHECK (value BETWEEN 0 AND 99999999.99 AND value = round(value, 2)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revision INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (asset_id, name, type) REFERENCES finance_assets(id, name, type) ON UPDATE CASCADE ON DELETE RESTRICT
);
INSERT INTO finance_transactions_new (id, asset_id, name, type, quantity, value, created_at)
SELECT id, asset_id, name, type, quantity, value, created_at FROM finance_transactions ORDER BY rowid;
DROP TABLE finance_transactions;
ALTER TABLE finance_transactions_new RENAME TO finance_transactions;
CREATE INDEX idx_finance_transactions_asset ON finance_transactions(asset_id);
CREATE TRIGGER finance_transaction_apply AFTER INSERT ON finance_transactions
BEGIN
  UPDATE finance_assets SET
    quantity = quantity + NEW.quantity,
    value = round(value + NEW.value, 2),
    average_price = round(round(value + NEW.value, 2) * 1.0 / (quantity + NEW.quantity), 2),
    revision = revision + 1
  WHERE id = NEW.asset_id;
END;
CREATE TRIGGER finance_transaction_edit AFTER UPDATE OF asset_id, quantity, value ON finance_transactions
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
CREATE TRIGGER finance_transaction_delete AFTER DELETE ON finance_transactions
BEGIN
  UPDATE finance_assets SET
    quantity = quantity - OLD.quantity,
    value = round(value - OLD.value, 2),
    average_price = CASE WHEN quantity = OLD.quantity THEN 0 ELSE round(round(value - OLD.value, 2) * 1.0 / (quantity - OLD.quantity), 2) END,
    revision = revision + 1
  WHERE id = OLD.asset_id;
END;
CREATE TRIGGER finance_transaction_metadata AFTER UPDATE OF name, type ON finance_transactions
WHEN NEW.name != OLD.name OR NEW.type != OLD.type
BEGIN
  UPDATE finance_transactions SET revision = revision + 1 WHERE id = NEW.id;
END;
