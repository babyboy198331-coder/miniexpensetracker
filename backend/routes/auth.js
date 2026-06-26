const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const store = require("../data/store");

const router = express.Router();
const SALT_ROUNDS = 10;

function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );
}

function issueRefreshToken(user) {
  const refreshToken = jwt.sign(
    // jti makes every refresh token unique, even ones issued in the same
    // second for the same user — without it, rotation could mint a token
    // identical to the one it was meant to replace.
    { sub: user.id, jti: crypto.randomUUID() },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d" }
  );
  store.saveRefreshToken(refreshToken, user.id);
  return refreshToken;
}

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  if (store.findUserByEmail(email)) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = store.createUser({ email, passwordHash });

  return res.status(201).json({ id: user.id, email: user.email });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = store.findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const accessToken = issueAccessToken(user);
  const refreshToken = issueRefreshToken(user);

  return res.json({ accessToken, refreshToken });
});

// Exchange a valid, non-revoked refresh token for a new access token.
// Rotates the refresh token too: the old one is revoked and a new one is issued,
// so a leaked refresh token can only be used once before it stops working.
router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  if (!store.isRefreshTokenValid(refreshToken)) {
    return res.status(401).json({ error: "Refresh token has been revoked or never existed" });
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch (err) {
    store.revokeRefreshToken(refreshToken);
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }

  const user = store.findUserById(payload.sub);
  if (!user) {
    store.revokeRefreshToken(refreshToken);
    return res.status(401).json({ error: "User no longer exists" });
  }

  store.revokeRefreshToken(refreshToken);
  const newAccessToken = issueAccessToken(user);
  const newRefreshToken = issueRefreshToken(user);

  return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

// Revoke a refresh token (e.g. when the user logs out). The access token
// issued earlier remains valid until it naturally expires, since access
// tokens aren't tracked server-side.
router.post("/logout", (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  store.revokeRefreshToken(refreshToken);
  return res.status(204).send();
});

// Request a password reset. Always responds the same way whether or not the
// email exists, so an attacker can't use this endpoint to discover which
// emails are registered.
//
// DEMO-ONLY NOTE: a real app would email resetToken/resetLink to the user
// and never put it in the API response. There's no email provider wired up
// here, so the token is returned directly for the frontend to use — don't
// ship this part to production as-is.
router.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  const genericResponse = {
    message: "If an account with that email exists, a password reset link has been generated.",
  };

  const user = store.findUserByEmail(email);
  if (!user) {
    return res.json(genericResponse);
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  store.saveResetToken(resetToken, user.id, Date.now() + RESET_TOKEN_TTL_MS);

  return res.json({
    ...genericResponse,
    // Demo-only fields — see note above.
    resetToken,
    resetTokenExpiresInMinutes: RESET_TOKEN_TTL_MS / 60000,
  });
});

// Complete a password reset using the token from /forgot-password.
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: "token and newPassword are required" });
  }

  const entry = store.findResetToken(token);
  if (!entry) {
    return res.status(400).json({ error: "Invalid or expired reset token" });
  }

  const user = store.findUserById(entry.userId);
  if (!user) {
    store.deleteResetToken(token);
    return res.status(400).json({ error: "Invalid or expired reset token" });
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  store.updateUserPassword(user.id, passwordHash);
  store.deleteResetToken(token);

  // Force every existing session to log in again with the new password.
  store.revokeAllRefreshTokensForUser(user.id);

  return res.json({ message: "Password has been reset. Please log in again." });
});

module.exports = router;
