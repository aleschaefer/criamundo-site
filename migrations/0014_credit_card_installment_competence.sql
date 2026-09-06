-- Corrige parcelas importadas que foram encaixadas pelo dia técnico da projeção
-- em vez do mês/ano da fatura armazenado nos metadados.
UPDATE credit_card_transactions
SET period_id = (
  SELECT p.id
  FROM credit_card_transaction_meta m
  LEFT JOIN credit_card_periods p
    ON p.month = m.billing_month AND p.year = m.billing_year
  WHERE m.transaction_id = credit_card_transactions.id
  LIMIT 1
)
WHERE id IN (
  SELECT transaction_id
  FROM credit_card_transaction_meta
  WHERE billing_month IS NOT NULL AND billing_year IS NOT NULL
);
