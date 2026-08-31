-- Aplicar uma única vez após 0004. Datas em UTC, geradas pelo banco.
ALTER TABLE finance_assets ADD COLUMN created_at TEXT;
ALTER TABLE finance_assets ADD COLUMN updated_at TEXT;
ALTER TABLE finance_transactions ADD COLUMN updated_at TEXT;
-- Apenas transações nunca editadas possuem uma última atualização histórica conhecida.
UPDATE finance_transactions SET updated_at = created_at WHERE revision = 0;
-- Não inventamos datas de inclusão/edição para registros antigos sem essa informação.
CREATE TRIGGER finance_asset_created AFTER INSERT ON finance_assets
BEGIN
  UPDATE finance_assets SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
CREATE TRIGGER finance_asset_updated
AFTER UPDATE OF name, type, quantity, average_price, value, current_price, current_income, revision ON finance_assets
BEGIN
  UPDATE finance_assets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
CREATE TRIGGER finance_transaction_created AFTER INSERT ON finance_transactions
BEGIN
  UPDATE finance_transactions SET updated_at = NEW.created_at WHERE id = NEW.id;
END;
CREATE TRIGGER finance_transaction_updated
AFTER UPDATE OF asset_id, name, type, quantity, value, revision ON finance_transactions
BEGIN
  UPDATE finance_transactions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
