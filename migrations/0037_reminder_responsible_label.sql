-- Atualiza o responsável compartilhado, preservando os demais campos.
CREATE TABLE reminders_new (
 id TEXT PRIMARY KEY NOT NULL,
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 20000 AND description=trim(description)),
 category_id TEXT NOT NULL REFERENCES reminder_categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 resolution_date TEXT NOT NULL CHECK(resolution_date=date(resolution_date,'+0 days')),
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 title TEXT NOT NULL DEFAULT '' CHECK(length(title)<=30),
 responsible TEXT NOT NULL DEFAULT 'Ale/Ana' CHECK(responsible IN ('Ale','Ana','Ale/Ana'))
);
INSERT INTO reminders_new SELECT id,description,category_id,resolution_date,revision,created_at,updated_at,title,CASE WHEN responsible='Ale ou Ana' THEN 'Ale/Ana' ELSE responsible END FROM reminders;
DROP TABLE reminders;
ALTER TABLE reminders_new RENAME TO reminders;
CREATE INDEX idx_reminders_resolution_date ON reminders(resolution_date);
CREATE INDEX idx_reminders_category ON reminders(category_id);
