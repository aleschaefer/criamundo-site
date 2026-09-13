ALTER TABLE monthly_incomes ADD COLUMN month INTEGER CHECK (month IS NULL OR (typeof(month)='integer' AND month BETWEEN 1 AND 12));
ALTER TABLE monthly_incomes ADD COLUMN year INTEGER CHECK (year IS NULL OR (typeof(year)='integer' AND year BETWEEN 1900 AND 9999));
CREATE INDEX IF NOT EXISTS idx_monthly_incomes_period ON monthly_incomes(year,month);
