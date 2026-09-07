-- Adiciona a sigla sem alterar ou excluir os ativos existentes.
ALTER TABLE finance_assets ADD COLUMN symbol VARCHAR(7)
  CHECK (symbol IS NULL OR (length(trim(symbol)) BETWEEN 1 AND 7 AND symbol = trim(symbol) AND symbol = upper(symbol)));

DROP TRIGGER IF EXISTS finance_asset_updated;
CREATE TRIGGER finance_asset_updated
AFTER UPDATE OF name, symbol, type, subtype, quantity, average_price, value, current_price, current_income, revision ON finance_assets
BEGIN
  UPDATE finance_assets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
