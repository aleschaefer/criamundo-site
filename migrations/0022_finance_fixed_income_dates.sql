-- Aplicar uma única vez após 0021. Adiciona as datas opcionais de entrada e retirada
-- aos ativos de renda fixa, preservando todos os registros existentes.
ALTER TABLE finance_assets ADD COLUMN entry_date TEXT CHECK (entry_date IS NULL OR (
  entry_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  AND entry_date >= '0001-01-01' AND date(entry_date, '+0 days') = entry_date
));
ALTER TABLE finance_assets ADD COLUMN exit_date TEXT CHECK (exit_date IS NULL OR (
  exit_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  AND exit_date >= '0001-01-01' AND date(exit_date, '+0 days') = exit_date
));
CREATE TRIGGER finance_asset_fixed_dates_insert BEFORE INSERT ON finance_assets
WHEN (NEW.entry_date IS NOT NULL OR NEW.exit_date IS NOT NULL) AND
  (NEW.type != 2 OR (NEW.exit_date IS NOT NULL AND (NEW.entry_date IS NULL OR NEW.exit_date < NEW.entry_date)))
BEGIN SELECT RAISE(ABORT, 'Datas de renda fixa inválidas.'); END;
CREATE TRIGGER finance_asset_fixed_dates_update BEFORE UPDATE OF type, entry_date, exit_date ON finance_assets
WHEN (NEW.entry_date IS NOT NULL OR NEW.exit_date IS NOT NULL) AND
  (NEW.type != 2 OR (NEW.exit_date IS NOT NULL AND (NEW.entry_date IS NULL OR NEW.exit_date < NEW.entry_date)))
BEGIN SELECT RAISE(ABORT, 'Datas de renda fixa inválidas.'); END;
DROP TRIGGER IF EXISTS finance_asset_updated;
CREATE TRIGGER finance_asset_updated
AFTER UPDATE OF owner, name, symbol, type, subtype, quantity, average_price, value, current_price, current_income, entry_date, exit_date, revision ON finance_assets
BEGIN
  UPDATE finance_assets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
