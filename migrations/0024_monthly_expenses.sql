CREATE TABLE IF NOT EXISTS monthly_expense_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name CHAR(30) COLLATE NOCASE NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 30 AND name=trim(name)),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS monthly_expenses (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL CHECK (owner IN ('Ale','Ana')),
  name CHAR(50) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 50 AND name=trim(name)),
  value DECIMAL(10,2) NOT NULL CHECK (value>=0 AND value<=99999999.99 AND value=round(value,2)),
  group_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(group_id) REFERENCES monthly_expense_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS monthly_expense_entries (
  expense_id TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (typeof(month)='integer' AND month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (typeof(year)='integer' AND year BETWEEN 1900 AND 9999),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(expense_id,month,year),
  FOREIGN KEY(expense_id) REFERENCES monthly_expenses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_monthly_expense_entries_period ON monthly_expense_entries(year,month);
