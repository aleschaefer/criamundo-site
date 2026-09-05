-- Permite edição segura de grupos e períodos e reencaixa transações.
ALTER TABLE credit_card_groups ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE credit_card_periods ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER credit_card_period_no_overlap_update BEFORE UPDATE OF start_date, end_date ON credit_card_periods
WHEN EXISTS (SELECT 1 FROM credit_card_periods WHERE id != NEW.id AND NEW.start_date <= end_date AND NEW.end_date >= start_date)
BEGIN SELECT RAISE(ABORT, 'O período sobrepõe outra fatura.'); END;
CREATE TRIGGER credit_card_period_refit AFTER UPDATE OF start_date, end_date ON credit_card_periods
BEGIN
  UPDATE credit_card_transactions SET period_id = (
    SELECT id FROM credit_card_periods p
    WHERE credit_card_transactions.transaction_date BETWEEN p.start_date AND p.end_date LIMIT 1
  );
END;
