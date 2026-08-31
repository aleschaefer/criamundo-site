-- Aplicar uma única vez após 0001_finance.sql, antes de publicar o código novo.
-- NULL significa que o valor atual acompanha o preço médio (COALESCE na API).
ALTER TABLE finance_assets ADD COLUMN current_price DECIMAL(8,2)
  CHECK (current_price IS NULL OR (type IN (1, 2) AND current_price BETWEEN 0 AND 999999.99 AND current_price = round(current_price, 2)));
ALTER TABLE finance_assets ADD COLUMN current_dy DECIMAL(8,2) NOT NULL DEFAULT 0
  CHECK (current_dy BETWEEN 0 AND 999999.99 AND current_dy = round(current_dy, 2) AND (type IN (1, 2) OR current_dy = 0));
