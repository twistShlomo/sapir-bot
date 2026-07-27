-- סופר ספיר - D1 Database Schema
-- טבלת סניפים

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  sunday TEXT,
  monday TEXT,
  tuesday TEXT,
  wednesday TEXT,
  thursday TEXT,
  friday TEXT,
  saturday TEXT,
  waze TEXT,
  group_link TEXT,
  notes TEXT
);

-- טבלת מבצעים
CREATE TABLE IF NOT EXISTS promos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  image TEXT,
  description TEXT,
  expiry TEXT,
  branches TEXT DEFAULT 'ALL'
);

-- טבלת תוכן (טיפים ומידע כללי)
CREATE TABLE IF NOT EXISTS content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL UNIQUE,
  text TEXT
);

-- אינדקסים לביצועים
CREATE INDEX IF NOT EXISTS idx_promos_expiry ON promos(expiry);
CREATE INDEX IF NOT EXISTS idx_branches_name ON branches(name);
CREATE INDEX IF NOT EXISTS idx_content_type ON content(type);
