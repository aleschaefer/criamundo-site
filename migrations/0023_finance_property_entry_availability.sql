-- Aplicar uma única vez após 0022. Marca quais ativos podem ser usados como
-- recursos para a entrada de um imóvel. Registros existentes começam desmarcados.
ALTER TABLE finance_assets ADD COLUMN available_for_property_entry INTEGER NOT NULL DEFAULT 0
  CHECK (available_for_property_entry IN (0, 1));

DROP TRIGGER IF EXISTS finance_asset_updated;
CREATE TRIGGER finance_asset_updated
AFTER UPDATE OF owner, name, symbol, type, subtype, quantity, average_price, value, current_price, current_income, entry_date, exit_date, available_for_property_entry, revision ON finance_assets
BEGIN
  UPDATE finance_assets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
