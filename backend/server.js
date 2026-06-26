require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const expenseRoutes = require("./routes/expenses");

const app = express();

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
app.listen(PORT, () => {
  console.log(`Expense tracker API listening on http://localhost:${PORT}`);
});
