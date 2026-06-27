// PostgreSQL-backed data store. Replaces the old in-memory arrays/maps —
// see db.js for the connection pool and schema setup. Every function here
// is async now since it talks to the database.

const { pool } = require("./db");

function mapUserRow(row) {
  return { id: row.id, email: row.email, passwordHash: row.password_hash };
}

function mapExpenseRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    amount: parseFloat(row.amount),
    category: row.category,
    description: row.description,
    createdAt: row.created_at.toISOString(),
  };
}

async function createUser({ email, passwordHash }) {
  const { rows } = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, password_hash",
    [email, passwordHash]
  );
  return mapUserRow(rows[0]);
}

async function findUserByEmail(email) {
  const { rows } = await pool.query(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [email]
  );
  return rows[0] ? mapUserRow(rows[0]) : undefined;
}

async function findUserById(id) {
  const { rows } = await pool.query(
    "SELECT id, email, password_hash FROM users WHERE id = $1",
    [id]
  );
  return rows[0] ? mapUserRow(rows[0]) : undefined;
}

async function createExpense({ userId, amount, category, description }) {
  const { rows } = await pool.query(
    `INSERT INTO expenses (user_id, amount, category, description)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, amount, category, description, created_at`,
    [userId, amount, category, description]
  );
  return mapExpenseRow(rows[0]);
}

async function findExpensesByUserId(userId) {
  const { rows } = await pool.query(
    `SELECT id, user_id, amount, category, description, created_at
     FROM expenses WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(mapExpenseRow);
}

async function findExpenseById(id) {
  const { rows } = await pool.query(
    "SELECT id, user_id, amount, category, description, created_at FROM expenses WHERE id = $1",
    [id]
  );
  return rows[0] ? mapExpenseRow(rows[0]) : undefined;
}

async function deleteExpenseById(id) {
  const { rowCount } = await pool.query("DELETE FROM expenses WHERE id = $1", [id]);
  return rowCount > 0;
}

async function saveRefreshToken(token, userId) {
  await pool.query(
    "INSERT INTO refresh_tokens (token, user_id) VALUES ($1, $2) ON CONFLICT (token) DO NOTHING",
    [token, userId]
  );
}

async function isRefreshTokenValid(token) {
  const { rows } = await pool.query("SELECT 1 FROM refresh_tokens WHERE token = $1", [token]);
  return rows.length > 0;
}

async function revokeRefreshToken(token) {
  await pool.query("DELETE FROM refresh_tokens WHERE token = $1", [token]);
}

// Revoke every refresh token belonging to a user — used when a password is
// reset, so any session started before the reset is forced to log in again.
async function revokeAllRefreshTokensForUser(userId) {
  await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
}

async function updateUserPassword(userId, passwordHash) {
  const { rowCount } = await pool.query(
    "UPDATE users SET password_hash = $1 WHERE id = $2",
    [passwordHash, userId]
  );
  return rowCount > 0;
}

async function saveResetToken(token, userId, expiresAt) {
  await pool.query(
    `INSERT INTO reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at`,
    [token, userId, expiresAt]
  );
}

// Returns the { userId, expiresAt } entry if the token exists and hasn't
// expired. Expired entries are cleaned up lazily here.
async function findResetToken(token) {
  const { rows } = await pool.query(
    "SELECT user_id, expires_at FROM reset_tokens WHERE token = $1",
    [token]
  );
  const row = rows[0];
  if (!row) return undefined;

  const expiresAt = Number(row.expires_at);
  if (expiresAt < Date.now()) {
    await pool.query("DELETE FROM reset_tokens WHERE token = $1", [token]);
    return undefined;
  }

  return { userId: row.user_id, expiresAt };
}

async function deleteResetToken(token) {
  await pool.query("DELETE FROM reset_tokens WHERE token = $1", [token]);
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  createExpense,
  findExpensesByUserId,
  findExpenseById,
  deleteExpenseById,
  saveRefreshToken,
  isRefreshTokenValid,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
  updateUserPassword,
  saveResetToken,
  findResetToken,
  deleteResetToken,
};
