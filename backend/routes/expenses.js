const express = require("express");
const store = require("../data/store");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// All routes below require a valid JWT
router.use(requireAuth);

router.get("/", async (req, res) => {
  const expenses = await store.findExpensesByUserId(req.user.id);
  res.json(expenses);
});

router.post("/", async (req, res) => {
  const { amount, category, description } = req.body;

  if (typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  if (!category) {
    return res.status(400).json({ error: "category is required" });
  }

  const expense = await store.createExpense({
    userId: req.user.id,
    amount,
    category,
    description: description || "",
  });

  res.status(201).json(expense);
});

router.get("/summary", async (req, res) => {
  const expenses = await store.findExpensesByUserId(req.user.id);

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  res.json({ total, byCategory, count: expenses.length });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const expense = await store.findExpenseById(id);

  if (!expense || expense.userId !== req.user.id) {
    return res.status(404).json({ error: "Expense not found" });
  }

  await store.deleteExpenseById(id);
  res.status(204).send();
});

module.exports = router;
