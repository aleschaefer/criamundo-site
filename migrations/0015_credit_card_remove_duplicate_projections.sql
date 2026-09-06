-- Remove logicamente previsões duplicadas após a parcela real ter sido importada.
-- A comparação exige mesma fatura, data original, grupo, valor, parcela,
-- total de parcelas e o mesmo nome-base antes de "PARC".
--
-- As parcelas seguintes da série prevista antiga também são removidas, pois a
-- nova série confirmada já contém suas próprias projeções futuras.
WITH duplicate_starts AS (
  SELECT projected.series_id, projected.installment_number
  FROM credit_card_transactions projected
  JOIN credit_card_transaction_meta projected_meta
    ON projected_meta.transaction_id = projected.id
  WHERE projected.deleted_at IS NULL
    AND projected_meta.is_projected = 1
    AND instr(upper(projected.name), 'PARC') > 0
    AND EXISTS (
      SELECT 1
      FROM credit_card_transactions confirmed
      JOIN credit_card_transaction_meta confirmed_meta
        ON confirmed_meta.transaction_id = confirmed.id
      WHERE confirmed.deleted_at IS NULL
        AND confirmed_meta.is_projected = 0
        AND confirmed.period_id = projected.period_id
        AND confirmed.group_id = projected.group_id
        AND confirmed.value = projected.value
        AND confirmed.installment_number = projected.installment_number
        AND confirmed.installment_count = projected.installment_count
        AND confirmed_meta.purchase_date = projected_meta.purchase_date
        AND instr(upper(confirmed.name), 'PARC') > 0
        AND lower(trim(substr(confirmed.name, 1, instr(upper(confirmed.name), 'PARC') - 1)))
          = lower(trim(substr(projected.name, 1, instr(upper(projected.name), 'PARC') - 1)))
    )
)
UPDATE credit_card_transactions
SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    revision = revision + 1
WHERE deleted_at IS NULL
  AND id IN (
    SELECT future.id
    FROM credit_card_transactions future
    JOIN credit_card_transaction_meta future_meta
      ON future_meta.transaction_id = future.id
    JOIN duplicate_starts duplicate
      ON duplicate.series_id = future.series_id
      AND future.installment_number >= duplicate.installment_number
    WHERE future_meta.is_projected = 1
  );
