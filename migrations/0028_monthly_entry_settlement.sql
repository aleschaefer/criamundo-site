ALTER TABLE monthly_expense_entries ADD COLUMN settled INTEGER NOT NULL DEFAULT 0 CHECK (settled IN (0,1));
UPDATE monthly_expense_entries
SET settled=COALESCE((SELECT settled FROM monthly_expenses WHERE monthly_expenses.id=monthly_expense_entries.expense_id),0);
