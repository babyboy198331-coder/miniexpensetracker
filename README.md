# Mini Expense Tracker

A small Express API (`backend/`) demonstrating register, login, bcrypt password hashing, JWT creation with refresh tokens, and protected routes — plus a plain HTML/JS frontend (`frontend/`) to use it from a browser.

Data is stored in memory only — restarting the server clears everything. Swap `backend/data/store.js` for a real database later if you want to persist data.

## Setup

### 1. Backend (API)

```bash
cd backend
npm install
cp .env.example .env
# edit .env and set real values for JWT_SECRET and REFRESH_TOKEN_SECRET
npm start
```

The API runs on `http://localhost:3000` by default.

### 2. Frontend (UI)

The frontend is a single static HTML file with no build step or dependencies — just open it with a local server so the browser allows fetch requests to localhost cleanly:

```bash
cd frontend
npx serve .
```

(`npx serve` will print a URL, usually `http://localhost:3000` is already taken by the API, so it'll pick something like `http://localhost:3001` — open that in your browser.) Opening `index.html` directly via `file://` also works in most browsers, but a local server is more reliable.

Make sure the backend is running first — the frontend talks to it at `http://localhost:3000` (see the `API_BASE` constant near the top of `frontend/index.html` if you need to change the port).

## Using the UI

Register an account, you'll be logged in automatically. From there you can add expenses with an amount/category/description, see them listed with a delete button, and see a live summary (total spent + breakdown by category). Logging out revokes your refresh token; the app also auto-refreshes your access token behind the scenes when it expires, so you generally won't get logged out mid-session.

## API Endpoints

### Register

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"hunter2"}'
```

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"hunter2"}'
```

Returns `{ "accessToken": "<jwt>", "refreshToken": "<jwt>" }`.

- `accessToken` — short-lived (default 15m). Send this in the `Authorization` header for the protected routes below.
- `refreshToken` — long-lived (default 7d). Use it to get a new access token once the old one expires, without making the user log in again.

### Refresh an access token

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

Returns a new `{ "accessToken": "...", "refreshToken": "..." }` pair. The refresh token is rotated — the one you sent is revoked and a new one comes back — so each refresh token can only be used once.

### Logout

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

Revokes the refresh token so it can no longer be used to mint new access tokens. (The current access token stays valid until it naturally expires — it isn't tracked server-side.)

### Forgot password

```bash
curl -X POST http://localhost:3000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com"}'
```

Always returns the same generic message, whether or not the email is registered, so this endpoint can't be used to discover which emails have accounts. If the email does exist, the response also includes a `resetToken` (valid for 15 minutes).

**Demo-only:** a real app would email the reset link instead of returning the token in the API response — there's no email provider wired up here, so the frontend just displays it directly. Don't ship this part to production as-is; swap in something like SendGrid or Nodemailer and email the link instead.

### Reset password

```bash
curl -X POST http://localhost:3000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"<resetToken>","newPassword":"newpass456"}'
```

Sets the new password and revokes all of that user's existing refresh tokens, so any other logged-in sessions are forced to log in again with the new password. The reset token can only be used once.

### Create an expense (protected)

```bash
curl -X POST http://localhost:3000/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"amount": 42.50, "category": "groceries", "description": "Trader Joe'"'"'s"}'
```

### List your expenses (protected)

```bash
curl http://localhost:3000/expenses \
  -H "Authorization: Bearer <accessToken>"
```

### Get a summary (protected)

```bash
curl http://localhost:3000/expenses/summary \
  -H "Authorization: Bearer <accessToken>"
```

Returns total spent, a breakdown by category, and a count.

### Delete an expense (protected)

```bash
curl -X DELETE http://localhost:3000/expenses/1 \
  -H "Authorization: Bearer <accessToken>"
```

## How the auth flow works

1. `POST /auth/register` hashes the password with bcrypt (never stores plaintext) and saves the user.
2. `POST /auth/login` compares the submitted password against the stored hash with `bcrypt.compare`, then issues two tokens: a short-lived access token (signed with `JWT_SECRET`) and a long-lived refresh token (signed with a *different* secret, `REFRESH_TOKEN_SECRET`, and recorded in the store so it can be revoked).
3. Protected routes (everything under `/expenses`) run through `middleware/auth.js`, which reads the `Authorization: Bearer <accessToken>` header, verifies the signature/expiry, and attaches `req.user` for downstream handlers.
4. When the access token expires, the client calls `POST /auth/refresh` with its refresh token. The server checks the refresh token hasn't been revoked, verifies its signature, then issues a brand-new access + refresh token pair and revokes the old refresh token (rotation).
5. `POST /auth/logout` revokes the refresh token so it's no longer usable, ending that session.
6. `POST /auth/forgot-password` issues a time-limited reset token (15 min) tied to the user; `POST /auth/reset-password` consumes it, hashes the new password with bcrypt, and revokes all of that user's refresh tokens so old sessions can't keep using the old password.
7. Each expense is tied to `req.user.id`, so users can only see/delete their own data.

## Next steps if you want to go further

- Swap in-memory storage for SQLite or Postgres (this also makes refresh-token revocation survive a server restart).
- Add rate limiting on `/auth/login` to slow down brute-force attempts.
- Add input validation with a library like `zod` or `joi`.
- Track refresh tokens per-device/session so a user can log out of one device without logging out everywhere.
- Wire up real email delivery (SendGrid, Nodemailer, etc.) for the forgot-password flow instead of returning the reset token in the API response.
