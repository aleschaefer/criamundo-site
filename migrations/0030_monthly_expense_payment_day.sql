ALTER TABLE monthly_expenses ADD COLUMN payment_day INTEGER
CHECK(payment_day IS NULL OR (typeof(payment_day)='integer' AND payment_day BETWEEN 1 AND 31));

UPDATE monthly_expenses
SET payment_day=CAST(strftime('%d',payment_date) AS INTEGER)
WHERE payment_date IS NOT NULL;
