-- Adiciona o proprietário aos ativos e transações existentes, preservando os dados.
-- Registros anteriores recebem Ale; novos registros devem informar Ale ou Ana.
ALTER TABLE finance_assets ADD COLUMN owner TEXT NOT NULL DEFAULT 'Ale'
  CHECK (owner IN ('Ale', 'Ana'));
ALTER TABLE finance_transactions ADD COLUMN owner TEXT NOT NULL DEFAULT 'Ale'
  CHECK (owner IN ('Ale', 'Ana'));

DROP TRIGGER IF EXISTS finance_asset_updated;
CREATE TRIGGER finance_asset_updated
AFTER UPDATE OF owner, name, symbol, type, subtype, quantity, average_price, value, current_price, current_income, revision ON finance_assets
BEGIN
  UPDATE finance_assets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS finance_transaction_updated;
CREATE TRIGGER finance_transaction_updated
AFTER UPDATE OF owner, asset_id, name, type, subtype, quantity, value, revision, transaction_date ON finance_transactions
BEGIN
  UPDATE finance_transactions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
