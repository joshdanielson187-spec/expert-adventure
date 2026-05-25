CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  package_type TEXT NOT NULL,
  stripe_session_id TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);
