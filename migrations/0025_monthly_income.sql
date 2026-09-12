CREATE TABLE IF NOT EXISTS monthly_incomes (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL CHECK (owner IN ('Ale','Ana')),
  name CHAR(50) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 50 AND name=trim(name)),
  value DECIMAL(10,2) NOT NULL CHECK (value>=0 AND value<=99999999.99 AND value=round(value,2)),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
