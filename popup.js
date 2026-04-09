const SENS_HINTS = {
  low: "Flags only clear high-risk content (medical, legal, DV).",
  medium: "Balanced — flags most uncertain or high-stakes responses.",
  high: "Flags aggressively; expect more yellow ratings.",
};

const toggle = document.getElementById("enableToggle");
const statusEl = document.getElementById("status");
const sensHint = document.getElementById("sensHint");
const sensBtns = document.querySelectorAll(".sens-btn");

function setStatus(enabled) {
  statusEl.textContent = enabled
    ? "Scoring is active. Reload the page to apply any changes."
    : "Scoring is paused. Reload the page to disable on current tab.";
}

function setSensUI(value) {
  sensBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
  sensHint.textContent = SENS_HINTS[value] || "";
}

// Load saved settings
chrome.storage.sync.get(
  { aeraLens_enabled: true, aeraLens_sensitivity: "medium" },
  (items) => {
    toggle.checked = items.aeraLens_enabled;
    setStatus(items.aeraLens_enabled);
    setSensUI(items.aeraLens_sensitivity);
  }
);

// On/off toggle
toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  chrome.storage.sync.set({ aeraLens_enabled: enabled });
  setStatus(enabled);
});

// Sensitivity buttons
sensBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const value = btn.dataset.value;
    chrome.storage.sync.set({ aeraLens_sensitivity: value });
    setSensUI(value);
  });
});
