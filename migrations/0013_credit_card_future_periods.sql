-- Competência explícita das parcelas importadas para encaixe nas faturas futuras.
ALTER TABLE credit_card_transaction_meta ADD COLUMN billing_month INTEGER CHECK (billing_month BETWEEN 1 AND 12);
ALTER TABLE credit_card_transaction_meta ADD COLUMN billing_year INTEGER CHECK (billing_year BETWEEN 1900 AND 9999);
UPDATE credit_card_transaction_meta
SET billing_month = CAST(strftime('%m', (SELECT transaction_date FROM credit_card_transactions WHERE id=transaction_id)) AS INTEGER),
    billing_year = CAST(strftime('%Y', (SELECT transaction_date FROM credit_card_transactions WHERE id=transaction_id)) AS INTEGER)
WHERE billing_month IS NULL OR billing_year IS NULL;
CREATE INDEX idx_credit_card_meta_billing ON credit_card_transaction_meta(billing_year, billing_month);
CREATE TRIGGER credit_card_period_fit_import AFTER INSERT ON credit_card_periods
BEGIN
  UPDATE credit_card_transactions SET period_id=NEW.id
  WHERE id IN (SELECT transaction_id FROM credit_card_transaction_meta WHERE billing_month=NEW.month AND billing_year=NEW.year);
END;
DROP TRIGGER credit_card_period_refit;
CREATE TRIGGER credit_card_period_refit AFTER UPDATE OF month, year, start_date, end_date ON credit_card_periods
BEGIN
  UPDATE credit_card_transactions SET period_id=COALESCE(
    (SELECT p.id FROM credit_card_periods p JOIN credit_card_transaction_meta m
      ON m.transaction_id=credit_card_transactions.id AND m.billing_month=p.month AND m.billing_year=p.year LIMIT 1),
    (SELECT p.id FROM credit_card_periods p WHERE credit_card_transactions.transaction_date BETWEEN p.start_date AND p.end_date LIMIT 1)
  );
END;
