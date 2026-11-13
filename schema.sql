CREATE TABLE IF NOT EXISTS spaces (
  space TEXT PRIMARY KEY CHECK (space IN ('personal', 'demo')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  state TEXT NOT NULL CHECK (json_valid(state))
);
