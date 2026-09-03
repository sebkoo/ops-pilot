CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  details TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('equipment','safety','cleanliness','inventory','other')),
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','resolved')),
  location TEXT NOT NULL,
  assignee TEXT,
  ai_summary TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issues_created_idx ON issues (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS issues_status_created_idx ON issues (status, created_at DESC);