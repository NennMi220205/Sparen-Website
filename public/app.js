const email = localStorage.getItem("loggedInEmail");
const role = localStorage.getItem("loggedInRole");

if (!email) {
  window.location.href = "index.html";
}

document.getElementById("who").textContent = `Eingeloggt als: ${email} (${role})`;

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("loggedInEmail");
  localStorage.removeItem("loggedInRole");
  localStorage.removeItem("familyKey");
  window.location.href = "index.html";
});

document.getElementById("loadBtn").addEventListener("click", async () => {
  const res = await fetch(`/api/state?email=${encodeURIComponent(email)}`);
  const data = await res.json();
  document.getElementById("out").textContent = JSON.stringify(data, null, 2);
});
