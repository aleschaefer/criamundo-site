ALTER TABLE reminders ADD COLUMN title TEXT NOT NULL DEFAULT '' CHECK(length(title) <= 30);
ALTER TABLE reminders ADD COLUMN responsible TEXT NOT NULL DEFAULT 'Ale ou Ana' CHECK(responsible IN ('Ale','Ana','Ale ou Ana'));
UPDATE reminders SET title = substr(description, 1, 30);
