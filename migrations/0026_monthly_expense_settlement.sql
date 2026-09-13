ALTER TABLE monthly_expenses ADD COLUMN payment_date TEXT CHECK (payment_date IS NULL OR payment_date=date(payment_date,'+0 days'));
ALTER TABLE monthly_expenses ADD COLUMN settled INTEGER NOT NULL DEFAULT 0 CHECK (settled IN (0,1));
