// Simple in-memory data store. Restarting the server clears all data.
// Swap this out for a real database (SQLite, Postgres, Mongo, etc.) later.

const users = []; // { id, email, passwordHash }
const expenses = []; // { id, userId, amount, category, description, createdAt }
const refreshTokens = new Map(); // token string -> userId
const resetTokens = new Map(); // token string -> { userId, expiresAt }

let nextUserId = 1;
let nextExpenseId = 1;

function createUser({ email, passwordHash }) {
  const user = { id: nextUserId++, email, passwordHash };
  users.push(user);
  return user;
}

function findUserByEmail(email) {
  return users.find((u) => u.email === email);
}

function findUserById(id) {
  return users.find((u) => u.id === id);
}

function createExpense({ userId, amount, category, description }) {
  const expense = {
    id: nextExpenseId++,
    userId,
    amount,
    category,
    description,
    createdAt: new Date().toISOString(),
  };
  expenses.push(expense);
  return expense;
}

function findExpensesByUserId(userId) {
  return expenses.filter((e) => e.userId === userId);
}

function findExpenseById(id) {
  return expenses.find((e) => e.id === id);
}

function deleteExpenseById(id) {
  const index = expenses.findIndex((e) => e.id === id);
  if (index === -1) return false;
  expenses.splice(index, 1);
  return true;
}

function saveRefreshToken(token, userId) {
  refreshTokens.set(token, userId);
}

function isRefreshTokenValid(token) {
  return refreshTokens.has(token);
}

function revokeRefreshToken(token) {
  refreshTokens.delete(token);
}

// Revoke every refresh token belonging to a user — used when a password is
// reset, so any session started before the reset is forced to log in again.
function revokeAllRefreshTokensForUser(userId) {
  for (const [token, ownerId] of refreshTokens.entries()) {
    if (ownerId === userId) refreshTokens.delete(token);
  }
}

function updateUserPassword(userId, passwordHash) {
  const user = findUserById(userId);
  if (!user) return false;
  user.passwordHash = passwordHash;
  return true;
}

function saveResetToken(token, userId, expiresAt) {
  resetTokens.set(token, { userId, expiresAt });
}

// Returns the { userId, expiresAt } entry if the token exists and hasn't
// expired. Expired entries are cleaned up lazily here.
function findResetToken(token) {
  const entry = resetTokens.get(token);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    resetTokens.delete(token);
    return undefined;
  }
  return entry;
}

function deleteResetToken(token) {
  resetTokens.delete(token);
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
