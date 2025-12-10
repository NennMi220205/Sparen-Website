// -----------------------------
// Imports
// -----------------------------
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");

// -----------------------------
// App & Port
// -----------------------------
const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------
// MongoDB Verbindung
// -----------------------------
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("✅ Mit MongoDB verbunden"))
  .catch((err) => console.error("❌ MongoDB Verbindungsfehler:", err));

// -----------------------------
// Schemas & Models
// -----------------------------

// User: { email, password, role: "parent" | "child", familyKey?: "ABC123" }
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Klartext für Schulprojekt ok
  role: { type: String, required: true, enum: ["parent", "child"] },
  familyKey: { type: String, default: null }
});

const User = mongoose.model("User", userSchema);

// UserData: { email, allowance, goal, purchases: [], parentGlobalMessage }
const userDataSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  allowance: { type: Number, default: 0 },
  goal: { type: Number, default: 0 },
  purchases: { type: Array, default: [] },
  parentGlobalMessage: { type: String, default: "" }
});

const UserData = mongoose.model("UserData", userDataSchema);

// -----------------------------
// Express Setup
// -----------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// -----------------------------
// Hilfsfunktionen
// -----------------------------
async function findUser(email) {
  return User.findOne({ email });
}

async function generateFamilyKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key;
  let exists = true;

  while (exists) {
    key = "";
    for (let i = 0; i < 6; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    exists = await User.exists({ familyKey: key });
  }

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
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, role, familyKey } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Email, Passwort und Rolle sind nötig."
      });
    }

    const existing = await findUser(email);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Diese E-Mail ist bereits registriert."
      });
    }

    let finalFamilyKey = null;

    if (role === "parent") {
      finalFamilyKey = await generateFamilyKey();
    } else if (role === "child") {
      if (familyKey && familyKey.trim() !== "") {
        const parentExists = await User.exists({
          familyKey: familyKey.trim(),
          role: "parent"
        });
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
      return res.status(400).json({
        success: false,
        message: "Rolle muss 'parent' oder 'child' sein."
      });
    }

    const newUser = new User({
      email,
      password,
      role,
      familyKey: finalFamilyKey
    });
    await newUser.save();

    // Standard-Userdaten anlegen
    let data = await UserData.findOne({ email });
    if (!data) {
      data = new UserData({
        email,
        allowance: 0,
        goal: 0,
        purchases: [],
        parentGlobalMessage: ""
      });
      await data.save();
    }

    return res.json({
      success: true,
      message: "Registrierung erfolgreich.",
      email,
      role,
      familyKey: finalFamilyKey
    });
  } catch (err) {
    console.error("Fehler bei /api/register:", err);
    return res
      .status(500)
      .json({ success: false, message: "Serverfehler bei Registrierung." });
  }
});

// ---------- LOGIN ----------
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, password });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Falsche E-Mail oder Passwort."
      });
    }

    return res.json({
      success: true,
      message: "Login erfolgreich.",
      email: user.email,
      role: user.role,
      familyKey: user.familyKey || null
    });
  } catch (err) {
    console.error("Fehler bei /api/login:", err);
    return res
      .status(500)
      .json({ success: false, message: "Serverfehler beim Login." });
  }
});

// ---------- STATE LADEN ----------
app.get("/api/state", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Parameter 'email' fehlt."
      });
    }

    const state = await UserData.findOne({ email });
    return res.json({ success: true, state: state || null });
  } catch (err) {
    console.error("Fehler bei /api/state (GET):", err);
    return res
      .status(500)
      .json({ success: false, message: "Serverfehler beim Laden des States." });
  }
});

// ---------- STATE SPEICHERN ----------
app.post("/api/state", async (req, res) => {
  try {
    const { email, state } = req.body;
    if (!email || !state) {
      return res.status(400).json({
        success: false,
        message: "email und state erforderlich."
      });
    }

    const user = await findUser(email);
    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Unbekannter Benutzer." });
    }

    await UserData.findOneAndUpdate(
      { email },
      { ...state, email },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("Fehler bei /api/state (POST):", err);
    return res
      .status(500)
      .json({ success: false, message: "Serverfehler beim Speichern des States." });
  }
});

// ---------- FAMILY JOIN ----------
app.post("/api/joinFamily", async (req, res) => {
  try {
    const { email, familyKey } = req.body;

    const user = await findUser(email);
    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Unbekannter Benutzer." });
    }
    if (user.role !== "child") {
      return res.status(400).json({
        success: false,
        message: "Nur Kinder können einer Familie beitreten."
      });
    }
    if (!familyKey || !familyKey.trim()) {
      return res.status(400).json({
        success: false,
        message: "Familien-Schlüssel fehlt."
      });
    }

    const parentExists = await User.exists({
      familyKey: familyKey.trim(),
      role: "parent"
    });
    if (!parentExists) {
      return res.status(400).json({
        success: false,
        message: "Familien-Schlüssel ist ungültig."
      });
    }

    user.familyKey = familyKey.trim();
    await user.save();

    return res.json({
      success: true,
      message: "Familie beigetreten.",
      familyKey: user.familyKey
    });
  } catch (err) {
    console.error("Fehler bei /api/joinFamily:", err);
    return res
      .status(500)
      .json({ success: false, message: "Serverfehler beim Familienbeitritt." });
  }
});

// ---------- FAMILY STATES ----------
app.get("/api/familyStates", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Parameter 'email' fehlt."
      });
    }

    const user = await findUser(email);
    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Unbekannter Benutzer." });
    }

    const key = user.familyKey || null;

    if (!key) {
      const ownState = await UserData.findOne({ email });
      return res.json({
        success: true,
        familyKey: null,
        members: [
          {
            email: user.email,
            role: user.role,
            state: ownState || null
          }
        ]
      });
    }

    const members = await User.find({ familyKey: key });

    const memberStates = await Promise.all(
      members.map(async (m) => {
        const state = await UserData.findOne({ email: m.email });
        return {
          email: m.email,
          role: m.role,
          state: state || null
        };
      })
    );

    return res.json({
      success: true,
      familyKey: key,
      members: memberStates
    });
  } catch (err) {
    console.error("Fehler bei /api/familyStates:", err);
    return res
      .status(500)
      .json({ success: false, message: "Serverfehler beim Laden der Familie." });
  }
});

// -----------------------------
// Server starten
// -----------------------------
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
