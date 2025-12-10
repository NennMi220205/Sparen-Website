const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

// ⭐ WICHTIG für Render
const PORT = process.env.PORT || 3000;

// -----------------------------
// Pfade zu JSON-Dateien
// -----------------------------
const USERS_FILE = path.join(__dirname, "users.json");
const USERDATA_FILE = path.join(__dirname, "userData.json");

// -----------------------------
// Hilfsfunktionen für Files
// -----------------------------
function loadJson(path, fallback) {
  try {
    const data = fs.readFileSync(path, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.warn(`Konnte ${path} nicht lesen, benutze Fallback.`, err.message);
    return fallback;
  }
}

function saveJson(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

// users: [{ email, password, role: "parent" | "child", familyKey?: "ABC123" }]
let users = loadJson(USERS_FILE, []);

// userData: { [email]: { allowance, goal, purchases: [], ... } }
let userData = loadJson(USERDATA_FILE, {});

// -----------------------------
// Express Setup
// -----------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// -----------------------------
// Hilfsfunktionen User
// -----------------------------
function findUser(email) {
  return users.find((u) => u.email === email);
}

function generateFamilyKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key;
  do {
    key = "";
    for (let i = 0; i < 6; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (users.some((u) => u.familyKey === key));
  return key;
}

// -----------------------------
// Routes
// -----------------------------

// Startseite -> Login
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- REGISTRIEREN ----------
app.post("/api/register", (req, res) => {
  const { email, password, role, familyKey } = req.body;

  if (!email || !password || !role) {
    return res
      .status(400)
      .json({ success: false, message: "Email, Passwort und Rolle sind nötig." });
  }

  if (findUser(email)) {
    return res
      .status(400)
      .json({ success: false, message: "Diese E-Mail ist bereits registriert." });
  }

  let finalFamilyKey = null;

  if (role === "parent") {
    finalFamilyKey = generateFamilyKey();
  } else if (role === "child") {
    if (familyKey && familyKey.trim() !== "") {
      const parentExists = users.some(
        (u) => u.familyKey === familyKey.trim() && u.role === "parent"
      );
      if (!parentExists) {
        return res.status(400).json({
          success: false,
          message: "Dieser Familien-Schlüssel ist ungültig."
        });
      }
      finalFamilyKey = familyKey.trim();
    } else {
      finalFamilyKey = null;
    }
  } else {
    return res
      .status(400)
      .json({ success: false, message: "Rolle muss 'parent' oder 'child' sein." });
  }

  const newUser = { email, password, role, familyKey: finalFamilyKey };
  users.push(newUser);
  saveJson(USERS_FILE, users);

  if (!userData[email]) {
    userData[email] = {
      allowance: 0,
      goal: 0,
      purchases: [],
      parentGlobalMessage: ""
    };
    saveJson(USERDATA_FILE, userData);
  }

  return res.json({
    success: true,
    message: "Registrierung erfolgreich.",
    email,
    role,
    familyKey: finalFamilyKey
  });
});

// ---------- LOGIN ----------
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  const user = users.find(
    (u) => u.email === email && u.password === password
  );

  if (!user) {
    return res
      .status(401)
      .json({ success: false, message: "Falsche E-Mail oder Passwort." });
  }

  return res.json({
    success: true,
    message: "Login erfolgreich.",
    email: user.email,
    role: user.role,
    familyKey: user.familyKey || null
  });
});

// ---------- STATE LADEN ----------
app.get("/api/state", (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "Parameter 'email' fehlt." });
  }
  const state = userData[email] || null;
  return res.json({ success: true, state });
});

// ---------- STATE SPEICHERN ----------
app.post("/api/state", (req, res) => {
  const { email, state } = req.body;
  if (!email || !state) {
    return res
      .status(400)
      .json({ success: false, message: "email und state erforderlich." });
  }

  if (!findUser(email)) {
    return res
      .status(400)
      .json({ success: false, message: "Unbekannter Benutzer." });
  }

  userData[email] = state;
  saveJson(USERDATA_FILE, userData);
  return res.json({ success: true });
});

// ---------- FAMILY JOIN ----------
app.post("/api/joinFamily", (req, res) => {
  const { email, familyKey } = req.body;

  const user = findUser(email);
  if (!user) {
    return res.status(400).json({ success: false, message: "Unbekannter Benutzer." });
  }
  if (user.role !== "child") {
    return res
      .status(400)
      .json({ success: false, message: "Nur Kinder können einer Familie beitreten." });
  }
  if (!familyKey || !familyKey.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Familien-Schlüssel fehlt." });
  }

  const parentExists = users.some(
    (u) => u.familyKey === familyKey.trim() && u.role === "parent"
  );
  if (!parentExists) {
    return res
      .status(400)
      .json({ success: false, message: "Familien-Schlüssel ist ungültig." });
  }

  user.familyKey = familyKey.trim();
  saveJson(USERS_FILE, users);

  return res.json({
    success: true,
    message: "Familie beigetreten.",
    familyKey: user.familyKey
  });
});

// ---------- FAMILY STATES ----------
app.get("/api/familyStates", (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "Parameter 'email' fehlt." });
  }

  const user = findUser(email);
  if (!user) {
    return res
      .status(400)
      .json({ success: false, message: "Unbekannter Benutzer." });
  }

  const key = user.familyKey || null;

  if (!key) {
    const ownState = userData[email] || null;
    return res.json({
      success: true,
      familyKey: null,
      members: [
        { email: user.email, role: user.role, state: ownState }
      ]
    });
  }

  const members = users
    .filter((u) => u.familyKey === key)
    .map((u) => ({
      email: u.email,
      role: u.role,
      state: userData[u.email] || null
    }));

  return res.json({
    success: true,
    familyKey: key,
    members
  });
});

// -----------------------------
// Server starten
// -----------------------------
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
