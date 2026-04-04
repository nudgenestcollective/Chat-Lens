const SENS_DESCRIPTIONS = {
  low:    "Relaxed detection — only strong, obvious amplification signals.",
  medium: "Balanced detection — standard scoring weights.",
  high:   "Strict detection — flags subtle patterns and light praise.",
};

const toggle   = document.getElementById("enabledToggle");
const controls = document.getElementById("controls");
const sensDesc = document.getElementById("sensDesc");
const sensBtns = document.querySelectorAll(".sens-btn");

chrome.storage.sync.get({ chatLens_enabled: true, chatLens_sensitivity: "medium" }, (items) => {
  toggle.checked = items.chatLens_enabled;
  controls.classList.toggle("disabled", !items.chatLens_enabled);
  setActiveSens(items.chatLens_sensitivity);
});

toggle.addEventListener("change", () => {
  chrome.storage.sync.set({ chatLens_enabled: toggle.checked });
  controls.classList.toggle("disabled", !toggle.checked);
});

sensBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    chrome.storage.sync.set({ chatLens_sensitivity: btn.dataset.value });
    setActiveSens(btn.dataset.value);
  });
});

function setActiveSens(val) {
  sensBtns.forEach((b) => b.classList.toggle("active", b.dataset.value === val));
  sensDesc.textContent = SENS_DESCRIPTIONS[val] || "";
}
