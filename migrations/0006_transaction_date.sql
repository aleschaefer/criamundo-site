-- Aplicar uma vez após 0005. Data de negócio, sem hora ou conversão de fuso.
-- Registros antigos ficam NULL, pois a data de cadastro não comprova a data da transação.
ALTER TABLE finance_transactions ADD COLUMN transaction_date TEXT
  CHECK (transaction_date IS NULL OR (
    transaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND transaction_date >= '0001-01-01'
    AND date(transaction_date, '+0 days') IS NOT NULL
    AND transaction_date = date(transaction_date, '+0 days')
  ));
CREATE TRIGGER finance_transaction_date_required BEFORE INSERT ON finance_transactions
WHEN NEW.transaction_date IS NULL
BEGIN SELECT RAISE(ABORT, 'Informe a data da transação.'); END;
CREATE TRIGGER finance_transaction_date_not_cleared BEFORE UPDATE OF transaction_date ON finance_transactions
WHEN NEW.transaction_date IS NULL
BEGIN SELECT RAISE(ABORT, 'Informe a data da transação.'); END;
DROP TRIGGER finance_transaction_updated;
CREATE TRIGGER finance_transaction_updated
AFTER UPDATE OF asset_id, name, type, quantity, value, revision, transaction_date ON finance_transactions
BEGIN
  UPDATE finance_transactions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
