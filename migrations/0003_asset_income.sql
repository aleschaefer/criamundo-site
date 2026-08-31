-- Aplicar uma única vez após 0002_asset_market_fields.sql.
-- DECIMAL(7,5): duas casas inteiras e cinco casas decimais.
ALTER TABLE finance_assets ADD COLUMN current_income DECIMAL(7,5) NOT NULL DEFAULT 0
  CHECK (current_income BETWEEN 0 AND 99.99999 AND current_income = round(current_income, 5) AND (type IN (1, 2) OR current_income = 0));
-- current_dy antigo é preservado para não apagar dados históricos, mas deixa de ser
-- lido/escrito pela aplicação. Os dois DY são calculados a cada consulta pela API.
