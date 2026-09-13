ALTER TABLE monthly_expense_entries ADD COLUMN disregarded INTEGER NOT NULL DEFAULT 0 CHECK (disregarded IN (0,1));
