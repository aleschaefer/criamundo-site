-- Categorias e lembretes pessoais.
CREATE TABLE reminder_categories (
  id TEXT PRIMARY KEY NOT NULL,
  name CHAR(40) COLLATE NOCASE NOT NULL UNIQUE
    CHECK(length(trim(name)) BETWEEN 1 AND 40 AND name=trim(name)),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY NOT NULL,
  description CHAR(200) NOT NULL
    CHECK(length(trim(description)) BETWEEN 1 AND 200 AND description=trim(description)),
  category_id TEXT NOT NULL,
  resolution_date TEXT NOT NULL CHECK(resolution_date=date(resolution_date,'+0 days')),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(category_id) REFERENCES reminder_categories(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX idx_reminders_resolution_date ON reminders(resolution_date);
CREATE INDEX idx_reminders_category ON reminders(category_id);
