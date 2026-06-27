require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const expenseRoutes = require("./routes/expenses");
const { ensureSchema } = require("./data/db");

const app = express();

// Safety net: an error thrown inside an `async` Express handler becomes an
// unhandled promise rejection (Express doesn't await handlers), which by
// default crashes the whole Node process — taking down every other
// in-flight request too. Log it instead of dying so one bad request (e.g.
// a transient DB hiccup) doesn't bring the whole API down.
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection (likely inside an async route handler):", err);
});

// Allow the deployed frontend to call this API. Set FRONTEND_ORIGIN to your
// GitHub Pages URL (e.g. https://yourname.github.io) once it's live; falls
// back to allowing any origin for local development.
const allowedOrigin = process.env.FRONTEND_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/auth", authRoutes);
app.use("/expenses", expenseRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

const PORT = process.env.PORT || 3000;

// Create tables (if they don't already exist) before accepting traffic, so
// the very first request never races a half-initialized database.
ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Expense tracker API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
