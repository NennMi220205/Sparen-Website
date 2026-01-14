const email = localStorage.getItem("loggedInEmail");
const role = localStorage.getItem("loggedInRole") || "child";

const KEY = (name) => `wertvoll:${email}:${name}`;

let state = {
  allowance: 0,
  goal: 0,
  purchases: [],
  parentMessages: []
};

let currentFeel = null;

function formatEuro(val) {
  const n = Number(val) || 0;
  return "€ " + n.toFixed(2).replace(".", ",");
}

function feelToEmoji(feel) {
  return { 5: "😍", 4: "🤩", 3: "😊", 2: "😐", 1: "☹️" }[feel] || "";
}

function loadState() {
  const raw = localStorage.getItem(KEY("state"));
  if (raw) {
    try { state = JSON.parse(raw); } catch {}
  }
}

function saveState() {
  localStorage.setItem(KEY("state"), JSON.stringify(state));
}

function getPurchasesLast7Days(purchases) {
  const now = new Date();
  const seven = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return (purchases || []).filter(p => {
    const d = new Date(p.date);
    return !Number.isNaN(d.getTime()) && d >= seven && d <= now;
  });
}

// Tabs
function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const views = document.querySelectorAll(".view");

  function showView(id) {
    views.forEach(v => (v.hidden = v.id !== id));
    tabs.forEach(t => t.classList.toggle("active", t.dataset.view === id));
  }

  tabs.forEach(t => t.addEventListener("click", () => showView(t.dataset.view)));

  document.querySelectorAll("button[data-view]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  showView("dashboard");
}

// KPI
function renderKpis() {
  const allowanceInput = document.getElementById("allowance");
  const goalInput = document.getElementById("goal");

  const kpiAllowance = document.getElementById("kpiAllowance");
  const kpiSpent = document.getElementById("kpiSpent");
  const kpiLeft = document.getElementById("kpiLeft");
  const kpiGoal = document.getElementById("kpiGoal");

  const goalBar = document.getElementById("goalBar");
  const goalHint = document.getElementById("goalHint");

  if (allowanceInput) allowanceInput.value = state.allowance || "";
  if (goalInput) goalInput.value = state.goal || "";

  const weekly = getPurchasesLast7Days(state.purchases);
  const spent = weekly.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
  const left = Math.max((Number(state.allowance) || 0) - spent, 0);

  if (kpiAllowance) kpiAllowance.textContent = formatEuro(state.allowance);
  if (kpiSpent) kpiSpent.textContent = formatEuro(spent);
  if (kpiLeft) kpiLeft.textContent = formatEuro(left);
  if (kpiGoal) kpiGoal.textContent = formatEuro(state.goal);

  let percent = 0;
  if ((Number(state.goal) || 0) > 0) {
    percent = Math.min(100, Math.round((left / state.goal) * 100));
  }
  if (goalBar) goalBar.style.width = percent + "%";
  if (goalHint) goalHint.textContent = `${percent}% des Sparziels erreicht`;
}

function setupMoneyInputs() {
  const allowanceInput = document.getElementById("allowance");
  const goalInput = document.getElementById("goal");

  if (allowanceInput) {
    allowanceInput.addEventListener("input", () => {
      state.allowance = Number(String(allowanceInput.value).replace(",", ".")) || 0;
      saveState();
      renderKpis();
      renderReflectGoal();
    });
  }

  if (goalInput) {
    goalInput.addEventListener("input", () => {
      state.goal = Number(String(goalInput.value).replace(",", ".")) || 0;
      saveState();
      renderKpis();
      renderReflectGoal();
    });
  }
}

// Purchases
function renderPurchases() {
  const tbody = document.querySelector("#purchaseTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  (state.purchases || []).forEach(p => {
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
    const del = document.createElement("button");
    del.className = "btn small ghost";
    del.textContent = "Löschen";
    del.addEventListener("click", () => {
      state.purchases = state.purchases.filter(x => x.id !== p.id);
      saveState();
      renderPurchases();
      renderKpis();
      renderReflect();
      renderStats();
      renderParent();
    });
    tdDel.appendChild(del);

    tr.append(tdDate, tdName, tdCat, tdPrice, tdFeel, tdDel);
    tbody.appendChild(tr);
  });
}

function setupNewPurchase() {
  const addQuick = document.getElementById("addQuick");
  if (addQuick) {
    addQuick.addEventListener("click", () => {
      document.querySelector('.tab[data-view="new"]')?.click();
    });
  }

  const emojiContainer = document.getElementById("initialEmojis");
  if (emojiContainer) {
    emojiContainer.addEventListener("click", (e) => {
      const btn = e.target.closest(".emoji");
      if (!btn) return;
      currentFeel = Number(btn.dataset.val) || null;
      emojiContainer.querySelectorAll(".emoji").forEach(b => b.classList.toggle("active", b === btn));
    });
  }

  const saveBtn = document.getElementById("savePurchase");
  const pName = document.getElementById("pName");
  const pPrice = document.getElementById("pPrice");
  const pCat = document.getElementById("pCat");

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      if (!pName || !pName.value.trim()) return alert("Bitte gib an, was du gekauft hast.");
      const price = Number(String(pPrice?.value || "0").replace(",", ".")) || 0;

      const purchase = {
        id: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        name: pName.value.trim(),
        category: pCat?.value || "Sonstiges",
        price,
        feel: currentFeel,
        note: "",
        parentComment: ""
      };

      state.purchases = state.purchases || [];
      state.purchases.unshift(purchase);
      saveState();

      if (pName) pName.value = "";
      if (pPrice) pPrice.value = "";
      currentFeel = null;
      emojiContainer?.querySelectorAll(".emoji").forEach(b => b.classList.remove("active"));

      renderPurchases();
      renderKpis();
      renderReflect();
      renderStats();
      renderParent();

      document.querySelector('.tab[data-view="dashboard"]')?.click();
    });
  }
}

// Reflection
function renderReflect() {
  const container = document.getElementById("reflectList");
  if (!container) return;
  container.innerHTML = "";

  if (!state.purchases?.length) {
    container.innerHTML = `<p class="muted">Noch keine Käufe zum Reflektieren.</p>`;
    return;
  }

  state.purchases.forEach(p => {
    const box = document.createElement("div");
    box.className = "parent-child-card";
    box.style.marginBottom = "10px";

    const title = document.createElement("div");
    title.innerHTML = `<strong>${p.name}</strong> · ${formatEuro(p.price)} · ${p.date} · ${p.category} · ${feelToEmoji(p.feel)}`;

    const label = document.createElement("label");
    label.textContent = "Deine Notiz:";
    label.style.marginTop = "8px";

    const ta = document.createElement("textarea");
    ta.value = p.note || "";
    ta.rows = 2;

    ta.addEventListener("input", () => {
      p.note = ta.value;
      saveState();
    });

    box.appendChild(title);
    box.appendChild(label);
    box.appendChild(ta);
    container.appendChild(box);
  });
}

function setupReflectionSave() {
  const btn = document.getElementById("saveReflection");
  if (!btn) return;
  btn.addEventListener("click", () => {
    saveState();
    alert("Reflexion gespeichert.");
  });
}

function renderReflectGoal() {
  const bar = document.getElementById("reflectGoalBar");
  const hint = document.getElementById("reflectGoalHint");

  const weekly = getPurchasesLast7Days(state.purchases);
  const spent = weekly.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
  const left = Math.max((Number(state.allowance) || 0) - spent, 0);

  let percent = 0;
  if ((Number(state.goal) || 0) > 0) percent = Math.min(100, Math.round((left / state.goal) * 100));

  if (bar) bar.style.width = percent + "%";
  if (hint) hint.textContent = `${percent}% erreicht`;
}

// Stats
function renderStats() {
  const catStats = document.getElementById("catStats");
  const valuePrice = document.getElementById("valuePrice");
  if (catStats) catStats.innerHTML = "";
  if (valuePrice) valuePrice.innerHTML = "";

  const purchases = state.purchases || [];
  if (!purchases.length) {
    if (catStats) catStats.innerHTML = `<p class="muted">Noch keine Daten.</p>`;
    if (valuePrice) valuePrice.innerHTML = `<p class="muted">Noch keine Daten.</p>`;
    return;
  }

  const sums = {};
  purchases.forEach(p => {
    const k = p.category || "Sonstiges";
    sums[k] = (sums[k] || 0) + (Number(p.price) || 0);
  });

  if (catStats) {
    Object.entries(sums)
      .sort((a,b) => b[1]-a[1])
      .forEach(([k,v]) => {
        const row = document.createElement("div");
        row.className = "muted";
        row.style.marginBottom = "6px";
        row.textContent = `${k}: ${formatEuro(v)}`;
        catStats.appendChild(row);
      });
  }

  if (valuePrice) {
    purchases.slice(0, 10).forEach(p => {
      const row = document.createElement("div");
      row.className = "muted";
      row.style.marginBottom = "6px";
      row.textContent = `${feelToEmoji(p.feel)}  ${p.name} – ${formatEuro(p.price)}`;
      valuePrice.appendChild(row);
    });
  }
}

// Parent
function renderParent() {
  const parentList = document.getElementById("parentList");
  const parentMessages = document.getElementById("parentMessages");
  if (parentList) parentList.innerHTML = "";
  if (parentMessages) parentMessages.innerHTML = "";

  (state.parentMessages || []).forEach((m) => {
    const box = document.createElement("div");
    box.className = "parent-child-card";
    box.textContent = m;
    parentMessages?.appendChild(box);
  });

  if (!parentList) return;
  if (!state.purchases?.length) {
    parentList.innerHTML = `<p class="muted">Noch keine Käufe.</p>`;
    return;
  }

  state.purchases.forEach(p => {
    const box = document.createElement("div");
    box.className = "parent-child-card";

    const title = document.createElement("div");
    title.innerHTML = `<strong>${p.name}</strong> · ${formatEuro(p.price)} · ${p.date} · ${p.category} · Gefühl: ${feelToEmoji(p.feel)}`;

    const label = document.createElement("label");
    label.textContent = "Eltern-Kommentar:";
    label.style.marginTop = "8px";

    const ta = document.createElement("textarea");
    ta.rows = 2;
    ta.value = p.parentComment || "";
    ta.addEventListener("input", () => {
      p.parentComment = ta.value;
      saveState();
    });

    box.appendChild(title);
    box.appendChild(label);
    box.appendChild(ta);
    parentList.appendChild(box);
  });
}

function setupParentMessage() {
  const ta = document.getElementById("parentMessage");
  const btn = document.getElementById("parentMessageSave");
  if (!ta || !btn) return;

  btn.addEventListener("click", () => {
    const msg = ta.value.trim();
    if (!msg) return;
    state.parentMessages = state.parentMessages || [];
    state.parentMessages.unshift(msg);
    ta.value = "";
    saveState();
    renderParent();
  });
}

function setupLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("loggedInEmail");
    localStorage.removeItem("loggedInRole");
    window.location.href = "index.html";
  });
}

function applyRole() {
  const parentTab = document.querySelector('.tab[data-view="parent"]');
  if (parentTab) parentTab.style.display = role === "parent" ? "inline-flex" : "none";
}

// Init
document.addEventListener("DOMContentLoaded", () => {
  if (!email) {
    window.location.href = "index.html";
    return;
  }

  loadState();
  applyRole();

  setupTabs();
  setupLogout();
  setupMoneyInputs();
  setupNewPurchase();
  setupReflectionSave();
  setupParentMessage();

  renderKpis();
  renderPurchases();
  renderReflect();
  renderReflectGoal();
  renderStats();
  renderParent();
});
