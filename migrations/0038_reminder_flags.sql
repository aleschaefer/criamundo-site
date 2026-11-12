CREATE TABLE reminders_new (
 id TEXT PRIMARY KEY NOT NULL,
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 20000 AND description=trim(description)),
 category_id TEXT NOT NULL REFERENCES reminder_categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 resolution_date TEXT CHECK(resolution_date IS NULL OR resolution_date=date(resolution_date,'+0 days')),
 no_date_defined INTEGER NOT NULL DEFAULT 0 CHECK(no_date_defined IN (0,1)),
 priority INTEGER NOT NULL DEFAULT 0 CHECK(priority IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 title TEXT NOT NULL DEFAULT '' CHECK(length(title)<=30),
 responsible TEXT NOT NULL DEFAULT 'Ale/Ana' CHECK(responsible IN ('Ale','Ana','Ale/Ana'))
);
INSERT INTO reminders_new(id,description,category_id,resolution_date,revision,created_at,updated_at,title,responsible) SELECT id,description,category_id,resolution_date,revision,created_at,updated_at,title,responsible FROM reminders;
DROP TABLE reminders;
ALTER TABLE reminders_new RENAME TO reminders;
CREATE INDEX idx_reminders_resolution_date ON reminders(resolution_date);
CREATE INDEX idx_reminders_category ON reminders(category_id);
