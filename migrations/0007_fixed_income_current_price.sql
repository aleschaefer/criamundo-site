-- Aplicar uma vez após 0006. Libera valor atual para Renda Fixa (tipo 3).
-- Substitui apenas a coluna para ampliar seu CHECK, preservando valores e auditoria.
DROP TRIGGER finance_asset_updated;
ALTER TABLE finance_assets ADD COLUMN current_price_new DECIMAL(8,2)
  CHECK (current_price_new IS NULL OR (type IN (1, 2, 3) AND current_price_new BETWEEN 0 AND 999999.99 AND current_price_new = round(current_price_new, 2)));
UPDATE finance_assets SET current_price_new = current_price;
ALTER TABLE finance_assets DROP COLUMN current_price;
ALTER TABLE finance_assets RENAME COLUMN current_price_new TO current_price;
CREATE TRIGGER finance_asset_updated
AFTER UPDATE OF name, type, quantity, average_price, value, current_price, current_income, revision ON finance_assets
BEGIN
  UPDATE finance_assets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
