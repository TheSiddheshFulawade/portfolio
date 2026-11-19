-- Spec 003 V11-03: visitor counter (REQ-COUNT-002..004). Apply once to the D1 database bound as VISITS_DB.
-- daily_visitors keeps one salted, daily-rotating hash per visitor per UTC day, for two days only.
-- totals keeps one count per day, forever. No IP address or user agent is ever stored.
CREATE TABLE IF NOT EXISTS daily_visitors (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY (day, visitor_hash)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS totals (
  day TEXT PRIMARY KEY,
  unique_visitors INTEGER NOT NULL
) WITHOUT ROWID;
