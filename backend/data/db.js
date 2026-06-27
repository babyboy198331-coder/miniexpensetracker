// PostgreSQL connection pool + one-time schema setup.
//
// DATABASE_URL is read from the environment (set it in backend/.env for
// local development, and in the Render web service's environment variables
// for the live deployment). Render's managed Postgres requires SSL but
// doesn't give you a verifiable CA chain on the free tier, so we disable
// certificate verification for any non-localhost connection.
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
const isLocal = (connectionString || "").includes("localhost") || (connectionString || "").includes("127.0.0.1");

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

// Idempotent — safe to run on every server start. Swap this for a real
// migration tool (node-pg-migrate, Prisma migrate, etc.) if the schema
// starts changing often.
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC NOT NULL,
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reset_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    );
  `);
}

module.exports = { pool, ensureSchema };
