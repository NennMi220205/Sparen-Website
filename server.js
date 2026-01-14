const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Static Frontend
app.use(express.static(path.join(__dirname, "public")));

// Files
const USERS_FILE = path.join(__dirname, "users.json");
const STATE_FILE = path.join(__dirname, "userData.json");

// ---------- Helpers ----------
function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error("readJson error:", e);
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function makeFamilyKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Ensure files exist
function ensureFiles() {
  if (!fs.existsSync(USERS_FILE)) writeJson(USERS_FILE, []);
  if (!fs.existsSync(STATE_FILE)) writeJson(STATE_FILE, {});
}
ensureFiles();

// ---------- API ----------
app.post("/api/register", (req, res) => {
  const { email, password, role = "child", familyKey = "" } = req.body || {};

  const e = normalizeEmail(email);
  const p = String(password || "");

  if (!e || !p) return res.json({ success: false, message: "Email und Passwort nötig." });
  if (!["child", "parent"].includes(role)) return res.json({ success: false, message: "Ungültige Rolle." });

  const users = readJson(USERS_FILE, []);
  if (users.some(u => normalizeEmail(u.email) === e)) {
    return res.json({ success: false, message: "User existiert schon." });
  }

  // Eltern bekommen einen Familien-Key
  let finalFamilyKey = "";
  if (role === "parent") {
    finalFamilyKey = makeFamilyKey();
  } else {
    finalFamilyKey = String(familyKey || "").trim().toUpperCase();
  }

  // Für echten Einsatz: Passwort hashen (bcrypt). Für Test: Klartext.
  users.push({ email: e, password: p, role, familyKey: finalFamilyKey });
  writeJson(USERS_FILE, users);

  // initialer State
  const allStates = readJson(STATE_FILE, {});
  if (!allStates[e]) {
    allStates[e] = { allowance: 0, goal: 0, purchases: [], parentGlobalMessage: "" };
    writeJson(STATE_FILE, allStates);
  }

  return res.json({
    success: true,
    email: e,
    role,
    familyKey: role === "parent" ? finalFamilyKey : finalFamilyKey || ""
  });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  const e = normalizeEmail(email);
  const p = String(password || "");

  const users = readJson(USERS_FILE, []);
  const user = users.find(u => normalizeEmail(u.email) === e);

  if (!user) return res.json({ success: false, message: "User nicht gefunden." });
  if (String(user.password) !== p) return res.json({ success: false, message: "Passwort falsch." });

  return res.json({
    success: true,
    email: user.email,
    role: user.role,
    familyKey: user.familyKey || ""
  });
});

// State laden
app.get("/api/state", (req, res) => {
  const e = normalizeEmail(req.query.email);
  if (!e) return res.json({ success: false, message: "email fehlt" });

  const allStates = readJson(STATE_FILE, {});
  const state = allStates[e] || { allowance: 0, goal: 0, purchases: [], parentGlobalMessage: "" };
  return res.json({ success: true, state });
});

// State speichern
app.post("/api/state", (req, res) => {
  const { email, state } = req.body || {};
  const e = normalizeEmail(email);
  if (!e || !state) return res.json({ success: false, message: "email/state fehlt" });

  const allStates = readJson(STATE_FILE, {});
  allStates[e] = state;
  writeJson(STATE_FILE, allStates);

  return res.json({ success: true });
});

// Familieninfo: Key + Mitglieder + deren States
app.get("/api/familyStates", (req, res) => {
  const e = normalizeEmail(req.query.email);
  if (!e) return res.json({ success: false, message: "email fehlt" });

  const users = readJson(USERS_FILE, []);
  const allStates = readJson(STATE_FILE, {});
  const me = users.find(u => normalizeEmail(u.email) === e);
  if (!me) return res.json({ success: false, message: "User nicht gefunden" });

  const familyKey = (me.familyKey || "").toUpperCase();

  if (!familyKey) {
    return res.json({ success: true, familyKey: "", members: [] });
  }

  const members = users
    .filter(u => (u.familyKey || "").toUpperCase() === familyKey)
    .map(u => ({
      email: u.email,
      role: u.role,
      state: allStates[normalizeEmail(u.email)] || { allowance: 0, goal: 0, purchases: [] }
    }));

  return res.json({ success: true, familyKey, members });
});

// Kind verbindet sich mit FamilyKey
app.post("/api/joinFamily", (req, res) => {
  const { email, familyKey } = req.body || {};
  const e = normalizeEmail(email);
  const key = String(familyKey || "").trim().toUpperCase();

  if (!e || !key) return res.json({ success: false, message: "email/familyKey fehlt" });

  const users = readJson(USERS_FILE, []);
  const idx = users.findIndex(u => normalizeEmail(u.email) === e);
  if (idx === -1) return res.json({ success: false, message: "User nicht gefunden" });

  // Key muss existieren (mind. ein Eltern-Account mit diesem Key)
  const hasParent = users.some(u => u.role === "parent" && (u.familyKey || "").toUpperCase() === key);
  if (!hasParent) return res.json({ success: false, message: "Familien-Schlüssel ungültig." });

  users[idx].familyKey = key;
  writeJson(USERS_FILE, users);

  return res.json({ success: true });
});

// Fallback: Startseite
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
