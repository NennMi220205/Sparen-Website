const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --------------------
// Demo-Accounts (fix)
// --------------------
const DEMO_USERS = [
  { email: "parent@test.de", password: "parent123", role: "parent", familyKey: "AB3F9Q" },
  { email: "kid1@test.de", password: "kid123", role: "child", familyKey: "AB3F9Q" },
  { email: "kid2@test.de", password: "kid123", role: "child", familyKey: "AB3F9Q" }
];

function norm(email) {
  return String(email || "").trim().toLowerCase();
}

// --------------------
// Demo-State (RAM)
// --------------------
const demoState = {
  "parent@test.de": { allowance: 0, goal: 0, purchases: [], parentGlobalMessage: "" },
  "kid1@test.de": { allowance: 20, goal: 50, purchases: [], parentGlobalMessage: "" },
  "kid2@test.de": { allowance: 15, goal: 30, purchases: [], parentGlobalMessage: "" }
};

// Registrierung deaktiviert (Demo)
app.post("/api/register", (_req, res) => {
  res.json({ success: false, message: "Demo: Registrierung deaktiviert. Bitte Demo-Accounts nutzen." });
});

// Login nur Demo-Accounts
app.post("/api/login", (req, res) => {
  const email = norm(req.body?.email);
  const password = String(req.body?.password || "");

  const user = DEMO_USERS.find(
    u => norm(u.email) === email && u.password === password
  );

  if (!user) {
    return res.json({ success: false, message: "Falsche Demo-Login-Daten." });
  }

  return res.json({
    success: true,
    email: user.email,
    role: user.role,
    familyKey: user.familyKey
  });
});

// State laden
app.get("/api/state", (req, res) => {
  const email = norm(req.query.email);
  if (!email) return res.json({ success: false, message: "email fehlt" });

  const state = demoState[email] || { allowance: 0, goal: 0, purchases: [], parentGlobalMessage: "" };
  return res.json({ success: true, state });
});

// State speichern
app.post("/api/state", (req, res) => {
  const email = norm(req.body?.email);
  const state = req.body?.state;

  if (!email || !state) return res.json({ success: false, message: "email/state fehlt" });

  const isDemoUser = DEMO_USERS.some(u => norm(u.email) === email);
  if (!isDemoUser) return res.json({ success: false, message: "Unbekannter Demo-Account." });

  demoState[email] = state;
  return res.json({ success: true });
});

// Familienübersicht (Key + Members + deren State)
app.get("/api/familyStates", (req, res) => {
  const email = norm(req.query.email);
  if (!email) return res.json({ success: false, message: "email fehlt" });

  const me = DEMO_USERS.find(u => norm(u.email) === email);
  if (!me) return res.json({ success: true, familyKey: "", members: [] });

  const familyKey = (me.familyKey || "").toUpperCase();

  const members = DEMO_USERS
    .filter(u => (u.familyKey || "").toUpperCase() === familyKey)
    .map(u => ({
      email: u.email,
      role: u.role,
      state: demoState[norm(u.email)] || { allowance: 0, goal: 0, purchases: [] }
    }));

  return res.json({ success: true, familyKey, members });
});

// joinFamily: in Demo fix – aber Route existiert, damit Frontend nicht bricht
app.post("/api/joinFamily", (_req, res) => {
  res.json({ success: false, message: "Demo: Familienzuordnung ist fest (AB3F9Q)." });
});

// Fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log("Server läuft auf Port", PORT));
