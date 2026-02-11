const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// public als statische Website
app.use(express.static(path.join(__dirname, "public")));

// Demo-Accounts
const DEMO_USERS = [
  { email: "parent@test.de", password: "parent123", role: "parent", familyKey: "AB3F9Q" },
  { email: "kid1@test.de", password: "kid123", role: "child", familyKey: "AB3F9Q" },
  { email: "kid2@test.de", password: "kid123", role: "child", familyKey: "AB3F9Q" }
];

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Login
app.post("/api/login", (req, res) => {
  const email = normEmail(req.body?.email);
  const password = String(req.body?.password || "");

  const user = DEMO_USERS.find(u => normEmail(u.email) === email && u.password === password);
  if (!user) return res.json({ success: false, message: "Falsche Demo-Login-Daten." });

  res.json({ success: true, email: user.email, role: user.role, familyKey: user.familyKey });
});

// Startseite -> Login
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log("Server läuft auf Port", PORT));
