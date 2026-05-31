CREATE TABLE IF NOT EXISTS "purchases" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "stripe_session_id" TEXT,
  "package_name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
