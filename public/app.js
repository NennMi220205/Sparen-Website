// =========================
// Globale Variablen
// =========================
const CURRENT_USER_EMAIL = localStorage.getItem("loggedInEmail");
const CURRENT_USER_ROLE = localStorage.getItem("loggedInRole") || "child";

let state = {
  allowance: 0,
  goal: 0,
  purchases: [],
  parentGlobalMessage: ""
};

let familyInfo = null; // vom Server: { familyKey, members: [...] }
let currentFeel = null;

// =========================
// Utils
// =========================
function formatEuro(val) {
  const n = Number(val) || 0;
  return "€ " + n.toFixed(2).replace(".", ",");
}

function feelToEmoji(feel) {
  switch (feel) {
    case 5:
      return "😍";
    case 4:
      return "🤩";
    case 3:
      return "😊";
    case 2:
      return "😐";
    case 1:
      return "☹️";
    default:
      return "";
  }
}

// Käufe der letzten 7 Tage – für KPIs
function getPurchasesLast7Days(purchases) {
  const now = new Date();
  const seven = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return purchases.filter((p) => {
    if (!p.date) return false;
    const d = new Date(p.date);
    if (Number.isNaN(d.getTime())) return false;
    return d >= seven && d <= now;
  });
}

// =========================
// Server-Calls
// =========================
async function loadStateFromServer() {
  if (!CURRENT_USER_EMAIL) return;
  try {
    const res = await fetch(
      "/api/state?email=" + encodeURIComponent(CURRENT_USER_EMAIL)
    );
    const data = await res.json();
    if (data.success && data.state) {
      state = data.state;
    }
  } catch (err) {
    console.error("Konnte State nicht laden", err);
  }
}

function saveState() {
  if (!CURRENT_USER_EMAIL) return;
  fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: CURRENT_USER_EMAIL, state })
  }).catch((err) => console.error("State speichern fehlgeschlagen", err));
}

// Eltern können für ihre Kinder State speichern (Taschengeld, Ziel, ...).
async function saveForeignState(email, foreignState) {
  try {
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, state: foreignState })
    });
    const data = await res.json();
    if (!data.success) {
      console.error("State für Kind konnte nicht gespeichert werden:", data.message);
    }
  } catch (err) {
    console.error("Fehler beim Speichern des Kind-States:", err);
  }
}


async function loadFamilyInfoFromServer() {
  if (!CURRENT_USER_EMAIL) return;
  try {
    const res = await fetch(
      "/api/familyStates?email=" + encodeURIComponent(CURRENT_USER_EMAIL)
    );
    const data = await res.json();
    if (data.success) {
      familyInfo = data;
      if (data.familyKey) {
        localStorage.setItem("familyKey", data.familyKey);
      }
    }
  } catch (err) {
    console.error("Konnte Familieninfo nicht laden", err);
  }
}

async function joinFamilyWithKey(key) {
  const res = await fetch("/api/joinFamily", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: CURRENT_USER_EMAIL, familyKey: key })
  });
  return res.json();
}

// =========================
// Tabs / Views
// =========================
function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const views = document.querySelectorAll(".view");

  function showView(id) {
    views.forEach((v) => (v.hidden = v.id !== id));
    tabs.forEach((t) =>
      t.classList.toggle("active", t.dataset.view === id)
    );
  }

  tabs.forEach((t) =>
    t.addEventListener("click", async () => {
      const id = t.dataset.view;
      showView(id);
      if (id === "family") {
        await loadFamilyInfoFromServer();
        renderFamilyView();
      }
    })
  );

  document.querySelectorAll("button[data-view]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.view;
      showView(id);
    })
  );

  showView("dashboard");
}

// =========================
// Dashboard (Kind + Eltern)
// =========================
function renderKpis() {
  const allowanceInput = document.getElementById("allowance");
  const goalInput = document.getElementById("goal");
  const kpiAllowance = document.getElementById("kpiAllowance");
  const kpiGoal = document.getElementById("kpiGoal");
  const kpiSpent = document.getElementById("kpiSpent");
  const kpiLeft = document.getElementById("kpiLeft");
  const goalBar = document.getElementById("goalBar");
  const goalHint = document.getElementById("goalHint");

  const weekly = getPurchasesLast7Days(state.purchases || []);
  const spent = weekly.reduce((s, p) => s + (p.price || 0), 0);
  const left = Math.max((state.allowance || 0) - spent, 0);

  // ---- NEU: Taschengeld ist IMMER nur Anzeige, nicht editierbar ----
  if (allowanceInput) {
    allowanceInput.value = state.allowance || "";
    allowanceInput.disabled = true; // Kind kann das nicht mehr ändern
  }

  // Sparziel darf das Kind weiterhin selbst setzen
  if (goalInput) {
    goalInput.value = state.goal || "";
    goalInput.disabled = (CURRENT_USER_ROLE === "parent");
  }

  if (kpiAllowance) kpiAllowance.textContent = formatEuro(state.allowance);
  if (kpiGoal) kpiGoal.textContent = formatEuro(state.goal);
  if (kpiSpent) kpiSpent.textContent = formatEuro(spent);
  if (kpiLeft) kpiLeft.textContent = formatEuro(left);

  let percent = 0;
  if (state.goal > 0) {
    percent = Math.min(100, Math.round((left / state.goal) * 100));
  }
  if (goalBar) goalBar.style.width = percent + "%";
  if (goalHint) goalHint.textContent = `${percent}% des Sparziels erreicht.`;
}
function setupAllowanceInputs() {
  const allowanceInput = document.getElementById("allowance");
  const goalInput = document.getElementById("goal");

  if (CURRENT_USER_ROLE === "parent") return;

  if (allowanceInput) {
    allowanceInput.addEventListener("input", () => {
      const v = parseFloat(allowanceInput.value.replace(",", "."));
      state.allowance = isNaN(v) ? 0 : v;
      renderKpis();
      saveState();
    });
  }
  if (goalInput) {
    goalInput.addEventListener("input", () => {
      const v = parseFloat(goalInput.value.replace(",", "."));
      state.goal = isNaN(v) ? 0 : v;
      renderKpis();
      saveState();
    });
  }
}

// Tabelle der Käufe (immer: eigener Account / Kind)
function renderPurchases() {
  const tbody = document.querySelector("#purchaseTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  (state.purchases || []).forEach((p) => {
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = p.date;

    const tdName = document.createElement("td");
    tdName.textContent = p.name;

    const tdCat = document.createElement("td");
    tdCat.textContent = p.category;

    const tdPrice = document.createElement("td");
    tdPrice.textContent = formatEuro(p.price);

    const tdFeel = document.createElement("td");
    tdFeel.textContent = feelToEmoji(p.feel);

    const tdDel = document.createElement("td");
    if (CURRENT_USER_ROLE === "child") {
      const btn = document.createElement("button");
      btn.className = "btn small ghost";
      btn.textContent = "Löschen";
      btn.addEventListener("click", () => {
        state.purchases = state.purchases.filter((x) => x.id !== p.id);
        renderKpis();
        renderPurchases();
        saveState();
      });
      tdDel.appendChild(btn);
    }

    tr.append(tdDate, tdName, tdCat, tdPrice, tdFeel, tdDel);
    tbody.appendChild(tr);
  });
}

function updateDashboardRoleUI() {
  const headerSubtitle = document.getElementById("headerSubtitle");
  const cardChild = document.getElementById("cardChildDashboard");
  const cardParent = document.getElementById("cardParentDashboard");
  const tabNew = document.getElementById("tabNew");
  const childDashText = document.getElementById("childDashText");

  if (CURRENT_USER_ROLE === "parent") {
    headerSubtitle.textContent = "Eltern-Ansicht · Familie im Blick";
    cardChild.hidden = true;
    cardParent.hidden = false;
    tabNew.style.display = "none";
  } else {
    headerSubtitle.textContent = "Kinder-Ansicht · Dein Taschengeld";
    cardChild.hidden = false;
    cardParent.hidden = true;
    tabNew.style.display = "inline-flex";
    childDashText.textContent = "Behalte dein Taschengeld im Blick.";
  }
}

function renderParentFamilySummary() {
  const container = document.getElementById("parentFamilySummary");
  if (!container) return;
  container.innerHTML = "";

  if (!familyInfo || !familyInfo.members) {
    container.innerHTML = '<p class="muted">Noch keine Familien-Daten.</p>';
    return;
  }

  const children = familyInfo.members.filter((m) => m.role === "child");
  if (children.length === 0) {
    container.innerHTML =
      '<p class="muted">Noch keine Kinder mit deinem Familien-Schlüssel verbunden.</p>';
    return;
  }

  children.forEach((child) => {
    const box = document.createElement("div");
    box.className = "parent-child-card";

    const title = document.createElement("div");
    title.innerHTML = `<strong>${child.email}</strong>`;

    const s = child.state || { purchases: [], allowance: 0, goal: 0 };
    const weekly = getPurchasesLast7Days(s.purchases || []);
    const spent = weekly.reduce((sum, p) => sum + (p.price || 0), 0);

    const info = document.createElement("p");
    info.className = "muted";
    info.textContent =
      "Ausgaben diese Woche: " + formatEuro(spent) +
      " · Taschengeld: " + formatEuro(s.allowance || 0);

    box.appendChild(title);
    box.appendChild(info);
    container.appendChild(box);
  });
}

// =========================
// Neuer Kauf (nur Kind)
// =========================
function setupPurchaseForm() {
  if (CURRENT_USER_ROLE === "parent") {
    document.getElementById("new").innerHTML =
      '<div class="card"><h2 class="headline">Nur Lesemodus</h2><p class="muted">Als Eltern kannst du keine Käufe eingeben. Melde dich als Kind an, um deine eigenen Ausgaben zu erfassen.</p></div>';
    return;
  }

  const emojiContainer = document.getElementById("initialEmojis");
  const saveBtn = document.getElementById("savePurchase");
  const pName = document.getElementById("pName");
  const pPrice = document.getElementById("pPrice");
  const pCat = document.getElementById("pCat");

  if (emojiContainer) {
    emojiContainer.addEventListener("click", (e) => {
      const btn = e.target.closest(".emoji");
      if (!btn) return;
      currentFeel = Number(btn.dataset.val) || null;
      emojiContainer.querySelectorAll(".emoji").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      if (!pName.value.trim()) {
        alert("Bitte gib an, was du gekauft hast.");
        return;
      }
      const price = parseFloat((pPrice.value || "0").replace(",", "."));
      const purchase = {
        id: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        name: pName.value.trim(),
        category: pCat.value || "Sonstiges",
        price: isNaN(price) ? 0 : price,
        feel: currentFeel,
        note: ""
      };
      state.purchases = state.purchases || [];
      state.purchases.unshift(purchase);

      currentFeel = null;
      if (emojiContainer) {
        emojiContainer.querySelectorAll(".emoji").forEach((b) =>
          b.classList.remove("active")
        );
      }
      pName.value = "";
      pPrice.value = "";

      renderKpis();
      renderPurchases();
      saveState();

      // zurück zur Übersicht
      document.querySelector('.tab[data-view="dashboard"]').click();
    });
  }
}

// =========================
// Familien-View
// =========================
function renderFamilyView() {
  const parentView = document.getElementById("familyParentView");
  const childView = document.getElementById("familyChildView");

  if (CURRENT_USER_ROLE === "parent") {
    parentView.hidden = false;
    childView.hidden = true;
    const keyText = document.getElementById("familyKeyText");
    keyText.textContent = (familyInfo && familyInfo.familyKey) || "–";
    renderParentChildrenList();
  } else {
    parentView.hidden = true;
    childView.hidden = false;
    renderChildFamilyInfo();
  }
}

function renderParentChildrenList() {
  const list = document.getElementById("familyChildrenList");
  if (!list) return;
  list.innerHTML = "";

  if (!familyInfo || !familyInfo.members) {
    list.innerHTML = '<p class="muted">Keine Daten.</p>';
    return;
  }

  const children = familyInfo.members.filter((m) => m.role === "child");

  if (children.length === 0) {
    list.innerHTML =
      '<p class="muted">Noch kein Kind mit deinem Schlüssel verbunden.</p>';
    return;
  }

  children.forEach((child) => {
    const box = document.createElement("div");
    box.className = "parent-child-card";

    const title = document.createElement("div");
    title.innerHTML = `<strong>${child.email}</strong>`;
    box.appendChild(title);

    const s = child.state || { allowance: 0, goal: 0, purchases: [] };

    // Zeile mit Eingaben
    const row = document.createElement("div");
    row.className = "row";
    row.style.marginTop = "8px";

    // Taschengeld
    const allowanceWrap = document.createElement("div");
    allowanceWrap.style.flex = "1";
    const allowanceLabel = document.createElement("label");
    allowanceLabel.textContent = "Taschengeld / Monat (€)";
    const allowanceInput = document.createElement("input");
    allowanceInput.type = "number";
    allowanceInput.min = "0";
    allowanceInput.step = "0.5";
    allowanceInput.value = s.allowance || 0;
    allowanceWrap.appendChild(allowanceLabel);
    allowanceWrap.appendChild(allowanceInput);

    // Sparziel (optional für Eltern)
    const goalWrap = document.createElement("div");
    goalWrap.style.flex = "1";
    const goalLabel = document.createElement("label");
    goalLabel.textContent = "Sparziel (€)";
    const goalInput = document.createElement("input");
    goalInput.type = "number";
    goalInput.min = "0";
    goalInput.step = "1";
    goalInput.value = s.goal || 0;
    goalWrap.appendChild(goalLabel);
    goalWrap.appendChild(goalInput);

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn small secondary";
    saveBtn.textContent = "Speichern";

    row.appendChild(allowanceWrap);
    row.appendChild(goalWrap);
    row.appendChild(saveBtn);
    box.appendChild(row);

    // Info-Ausgaben der letzten 7 Tage
    const weekly = getPurchasesLast7Days(s.purchases || []);
    const spent = weekly.reduce((sum, p) => sum + (p.price || 0), 0);
    const info = document.createElement("p");
    info.className = "muted";
    info.style.marginTop = "6px";
    info.textContent =
      "Ausgaben letzte 7 Tage: " +
      formatEuro(spent) +
      " · aktuelles Taschengeld: " +
      formatEuro(s.allowance || 0);
    box.appendChild(info);

    // Speicher-Logik für diesen Eintrag
    saveBtn.addEventListener("click", async () => {
      const newAllowance = parseFloat(allowanceInput.value.replace(",", "."));
      const newGoal = parseFloat(goalInput.value.replace(",", "."));

      const newState = {
        ...s,
        allowance: isNaN(newAllowance) ? 0 : newAllowance,
        goal: isNaN(newGoal) ? 0 : newGoal
      };

      await saveForeignState(child.email, newState);

      // lokal updaten, damit UI stimmt
      child.state = newState;
      if (child.email === CURRENT_USER_EMAIL) {
        state = newState;
        renderKpis();
        renderPurchases();
      }

      info.textContent =
        "Ausgaben letzte 7 Tage: " +
        formatEuro(spent) +
        " · aktuelles Taschengeld: " +
        formatEuro(newState.allowance || 0);

      alert("Taschengeld/Sparziel für " + child.email + " gespeichert.");
    });

    list.appendChild(box);
  });
}


function renderChildFamilyInfo() {
  const info = document.getElementById("familyInfoChild");
  const msg = document.getElementById("joinFamilyMsg");
  if (!info) return;
  info.innerHTML = "";
  msg.textContent = "";

  if (!familyInfo || !familyInfo.familyKey) {
    info.innerHTML =
      '<p class="muted">Du bist noch mit keiner Familie verknüpft.</p>';
    return;
  }

  const keyText = document.createElement("p");
  keyText.className = "muted";
  keyText.textContent =
    "Verbunden mit Familie (Schlüssel): " + familyInfo.familyKey;
  info.appendChild(keyText);
}

function setupFamilyChildActions() {
  if (CURRENT_USER_ROLE !== "child") return;

  const btn = document.getElementById("joinFamilyBtn");
  const input = document.getElementById("joinFamilyKey");
  const msg = document.getElementById("joinFamilyMsg");

  if (!btn) return;

  btn.addEventListener("click", async () => {
    msg.textContent = "";
    const key = input.value.trim().toUpperCase();
    if (!key) {
      msg.textContent = "Bitte gib einen Schlüssel ein.";
      return;
    }
    try {
      const data = await joinFamilyWithKey(key);
      if (!data.success) {
        msg.textContent = data.message || "Schlüssel ungültig.";
        return;
      }
      msg.textContent = "Erfolgreich verbunden! 🎉";
      await loadFamilyInfoFromServer();
      renderChildFamilyInfo();
    } catch (err) {
      console.error(err);
      msg.textContent = "Fehler beim Verbinden.";
    }
  });
}

// =========================
// Init
// =========================
document.addEventListener("DOMContentLoaded", async () => {
  if (!CURRENT_USER_EMAIL) {
    window.location.href = "index.html";
    return;
  }

  await loadStateFromServer();
  await loadFamilyInfoFromServer();

  setupTabs();
  updateDashboardRoleUI();
  setupAllowanceInputs();
  setupPurchaseForm();
  renderKpis();
  renderPurchases();
  renderParentFamilySummary();
  renderFamilyView();
  setupFamilyChildActions();

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("loggedInEmail");
      localStorage.removeItem("loggedInRole");
      localStorage.removeItem("familyKey");
      window.location.href = "index.html";
    });
  }
});
