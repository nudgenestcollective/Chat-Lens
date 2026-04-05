/**
 * Chat Lens — VERA (Validated Epistemic Risk Assessment)
 * 3-dimension weighted scoring engine.
 * Runs on chatgpt.com / chat.openai.com.
 */

const VERA_DEBUG = true; // set false in production

// ─── Dimension 1: Assertion Strength (AS) ────────────────────────────────────

const AS_ABSOLUTE = [
  "the best way", "the only way", "will always", "always works",
  "guaranteed to", "without question", "without a doubt", "the most effective",
  "most effective way", "the right way", "the correct way", "naturally builds",
  "naturally leads", "naturally creates", "cannot fail", "the best approach",
  "the best strategy", "the best method", "clearly the", "obviously the",
  "certainly will", "the proven way", "always the case", "100%",
  "there is no doubt", "undoubtedly", "unquestionably",
];

const AS_HEDGED = [
  "may", "might", "could", "sometimes", "it depends", "varies",
  "in some cases", "can be", "tends to", "not always", "for some people",
  "in certain situations", "one possibility", "potentially", "perhaps",
  "arguably", "often", "generally", "usually", "typically", "in many cases",
  "worth exploring",
];

// ─── Dimension 2: Evidence Signal (ES) ───────────────────────────────────────

const ES_STRONG = [
  "according to", "research shows", "studies suggest", "study shows",
  "data indicates", "evidence suggests", "for example", "for instance",
  "published", "peer-reviewed", "statistics show", "survey found",
  "reported by", "findings show", "researchers found", "meta-analysis",
  "experts say", "scientists found", "based on data", "clinical trial",
  "a study", "the research", "documented", "cited",
];

const ES_WEAK = [
  "many people find", "some people", "often reported", "commonly seen",
  "anecdotally", "in practice", "in my experience", "some experts",
  "many experts", "widely believed", "often said", "many find",
];

const ES_UNCERTAINTY = [
  "i could be wrong", "worth verifying", "consult a professional",
  "seek advice", "talk to a", "speak to a", "i'm not certain",
  "i'm not sure", "you may want to verify", "double-check",
  "this isn't guaranteed", "results may vary", "not a substitute",
  "your situation may differ", "i cannot guarantee",
];

// ─── Dimension 3: Scope Coverage (SC) ────────────────────────────────────────

const SC_SCOPE = [
  "if you're", "if you are", "depending on", "in your situation",
  "in your case", "for your specific", "given your", "based on your",
  "in some industries", "in some workplaces", "for those who",
  "assuming you", "context-dependent", "varies by",
];

const SC_LIMIT = [
  "not always", "may not apply", "there are exceptions",
  "this may not", "won't work for everyone", "not universal",
  "exceptions exist", "your mileage may vary", "not for everyone",
  "this varies", "individual results",
];

const SC_UNIVERSAL = [
  "everyone should", "anyone can", "always works", "in any situation",
  "regardless of", "universally", "no matter what", "works for everyone",
  "applies to all", "in every case", "without exception",
];

// ─── Sensitivity (optional — medium is ×1.0, effectively off) ────────────────

const SENSITIVITY_MULTIPLIERS = { low: 0.7, medium: 1.0, high: 1.3 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchAny(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.filter(p => lower.includes(p));
}

// ─── Dimension Scorers ────────────────────────────────────────────────────────

function scoreAS(text) {
  const absolute = matchAny(text, AS_ABSOLUTE);
  const hedged   = matchAny(text, AS_HEDGED);

  let score;
  if      (absolute.length === 0 && hedged.length === 0) score = 1; // unknown → not safe by default
  else if (absolute.length === 0 && hedged.length  > 0) score = 0;
  else if (absolute.length  > 0 && hedged.length   > 0) score = 1;
  else if (absolute.length  > 0 && hedged.length  === 0) score = 2;
  if      (absolute.length >= 3 && hedged.length  === 0) score = 3;

  if (VERA_DEBUG) {
    console.groupCollapsed(`[VERA] Assertion Strength → ${score}/3`);
    console.log("Absolute phrases:", absolute);
    console.log("Hedged phrases:  ", hedged);
    console.groupEnd();
  }

  return { score, matched: { absolute, hedged } };
}

function scoreES(text) {
  const strong      = matchAny(text, ES_STRONG);
  const weak        = matchAny(text, ES_WEAK);
  const uncertainty = matchAny(text, ES_UNCERTAINTY);

  // Waterfall — first match wins, no double-counting
  let score;
  if      (strong.length      > 0) score = 0;
  else if (weak.length        > 0) score = 1;
  else if (uncertainty.length > 0) score = 2;
  else                              score = 3;

  if (VERA_DEBUG) {
    console.groupCollapsed(`[VERA] Evidence Signal → ${score}/3`);
    console.log("Strong evidence:  ", strong);
    console.log("Weak evidence:    ", weak);
    console.log("Uncertainty signals:", uncertainty);
    console.groupEnd();
  }

  return { score, matched: { strong, weak, uncertainty } };
}

function scoreSC(text) {
  const scope     = matchAny(text, SC_SCOPE);
  const limit     = matchAny(text, SC_LIMIT);
  const universal = matchAny(text, SC_UNIVERSAL);

  let score;
  if      (universal.length > 0)                                   score = 3;
  else if (scope.length >= 2 || (scope.length >= 1 && limit.length >= 1)) score = 0;
  else if (scope.length === 1 || limit.length === 1)               score = 1;
  else                                                              score = 2;

  if (VERA_DEBUG) {
    console.groupCollapsed(`[VERA] Scope Coverage → ${score}/3`);
    console.log("Scope markers:    ", scope);
    console.log("Limit markers:    ", limit);
    console.log("Universal markers:", universal);
    console.groupEnd();
  }

  return { score, matched: { scope, limit, universal } };
}

// ─── VERA Engine ──────────────────────────────────────────────────────────────

function computeVERA(text, sensitivity) {
  const as = scoreAS(text);
  const es = scoreES(text);
  const sc = scoreSC(text);

  // W = (AS × 0.25) + (ES × 0.45) + (SC × 0.30) — max 3.0
  const weighted   = (as.score * 0.25) + (es.score * 0.45) + (sc.score * 0.30);
  const multiplier = SENSITIVITY_MULTIPLIERS[sensitivity] || 1.0;
  const score      = Math.min(10, Math.max(0, Math.round((weighted / 3) * 10 * multiplier)));

  if (VERA_DEBUG) {
    console.groupCollapsed(`[VERA] Final Score → ${score}/10`);
    console.log(`Weighted raw: ${weighted.toFixed(3)} / 3.0`);
    console.log(`Sensitivity:  ${sensitivity} (×${multiplier})`);
    console.log(`Final score:  ${score}/10`);
    console.groupEnd();
  }

  const LABELS_AS = ["Well hedged", "Mixed certainty", "Mostly absolute", "Entirely absolute"];
  const LABELS_ES = ["Evidence cited", "Weak evidence", "Ungrounded but honest", "Pure assertion"];
  const LABELS_SC = ["Explicitly bounded", "Partially bounded", "Implicitly universal", "Actively universal"];

  const breakdown = [
    {
      dimension: "Assertion Strength", score: as.score, max: 3,
      label: LABELS_AS[as.score],
      detail: as.score === 3
        ? `No hedging. Absolute: ${as.matched.absolute.slice(0,3).map(p=>`"${p}"`).join(", ")}`
        : as.score === 2
        ? `Absolute dominates: ${as.matched.absolute.slice(0,2).map(p=>`"${p}"`).join(", ")}`
        : as.score === 1 && as.matched.absolute.length
        ? `Mixed: "${as.matched.absolute[0]}" alongside "${as.matched.hedged[0]}"`
        : as.score === 1
        ? "Neutral — neither clearly hedged nor absolute"
        : `Hedged: ${as.matched.hedged.slice(0,3).map(p=>`"${p}"`).join(", ")}`,
    },
    {
      dimension: "Evidence Signal", score: es.score, max: 3,
      label: LABELS_ES[es.score],
      detail: es.score === 0
        ? `Grounded: ${es.matched.strong.slice(0,2).map(p=>`"${p}"`).join(", ")}`
        : es.score === 1
        ? `Weak reference only: ${es.matched.weak.slice(0,2).map(p=>`"${p}"`).join(", ")}`
        : es.score === 2
        ? `No evidence but acknowledges limits: ${es.matched.uncertainty.slice(0,2).map(p=>`"${p}"`).join(", ")}`
        : "No data, sources, examples, or uncertainty signals — claims stated as fact",
    },
    {
      dimension: "Scope Coverage", score: sc.score, max: 3,
      label: LABELS_SC[sc.score],
      detail: sc.score === 0
        ? `Scoped: ${[...sc.matched.scope, ...sc.matched.limit].slice(0,2).map(p=>`"${p}"`).join(", ")}`
        : sc.score === 1
        ? `Partial: "${[...sc.matched.scope, ...sc.matched.limit][0]}"`
        : sc.score === 2
        ? "No scope conditions — implies advice applies to everyone in all situations"
        : `Actively universal: ${sc.matched.universal.slice(0,2).map(p=>`"${p}"`).join(", ")}`,
    },
  ];

  return { score, breakdown };
}

// ─── UI Component (unchanged) ─────────────────────────────────────────────────

const BADGE_ATTR = "data-chat-lens-scored";

function badgeColor(score) {
  if (score >= 7) return "#e53935";
  if (score >= 4) return "#fb8c00";
  return "#43a047";
}

function scoreLabel(score) {
  if (score >= 7) return "Get a human opinion";
  if (score >= 4) return "Worth a second look";
  return "Looks balanced";
}

function dimColor(s) { return s === 0 ? "#43a047" : s <= 1 ? "#fb8c00" : "#e53935"; }

function createBadge(veraResult) {
  const { score, breakdown } = veraResult;
  const wrapper = document.createElement("div");
  wrapper.className = "cl-wrapper";

  const badge = document.createElement("button");
  badge.className = "cl-badge";
  badge.setAttribute("aria-expanded", "false");
  badge.style.setProperty("--cl-color", badgeColor(score));
  badge.innerHTML =
    `<span class="cl-icon">\u26a0\ufe0f</span>` +
    `<span class="cl-score">Risk\u00a0${score}/10</span>` +
    `<span class="cl-level">${scoreLabel(score)}</span>` +
    `<span class="cl-chevron">\u25be</span>`;

  const panel = document.createElement("div");
  panel.className = "cl-panel";
  panel.hidden = true;

  const title = document.createElement("p");
  title.className = "cl-panel-title";
  title.textContent = `Epistemic Risk Score: ${score}/10`;

  const list = document.createElement("ul");
  list.className = "cl-list";

  for (const dim of breakdown) {
    const li = document.createElement("li");
    li.className = "cl-item";
    li.innerHTML =
      `<span class="cl-delta" style="color:${dimColor(dim.score)}">${dim.score}/${dim.max}</span>` +
      `<span class="cl-body"><strong>${dim.dimension} \u2014 ${dim.label}</strong><em>${dim.detail}</em></span>`;
    list.appendChild(li);
  }

  const footer = document.createElement("p");
  footer.className = "cl-footer";
  footer.textContent = "Chat Lens \u2014 AI can sound certain and still be wrong";

  panel.appendChild(title);
  panel.appendChild(list);
  panel.appendChild(footer);

  badge.addEventListener("click", () => {
    const open = badge.getAttribute("aria-expanded") === "true";
    badge.setAttribute("aria-expanded", String(!open));
    badge.querySelector(".cl-chevron").textContent = open ? "\u25be" : "\u25b4";
    panel.hidden = open;
  });

  wrapper.appendChild(badge);
  wrapper.appendChild(panel);
  return wrapper;
}

function injectBadge(turnEl, text, sensitivity) {
  if (turnEl.hasAttribute(BADGE_ATTR)) return;
  turnEl.setAttribute(BADGE_ATTR, "true");
  turnEl.after(createBadge(computeVERA(text, sensitivity)));
}

function removeAllBadges() {
  document.querySelectorAll(".cl-wrapper").forEach(el => el.remove());
  document.querySelectorAll(`[${BADGE_ATTR}]`).forEach(el => el.removeAttribute(BADGE_ATTR));
}

// ─── Observer & Init (unchanged) ──────────────────────────────────────────────

const TURN_SEL  = '[data-message-author-role="assistant"]';
const PROSE_SEL = ".markdown, .prose, [class*='markdown'], [class*='prose']";

let enabled     = true;
let sensitivity = "medium";
let observer    = null;

function extractText(el) { return (el.querySelector(PROSE_SEL) || el).innerText || ""; }

function processTurn(el) {
  if (!enabled) return;
  const text = extractText(el);
  if (text.trim().length < 30) return;
  injectBadge(el, text, sensitivity);
}

function scanAll() { document.querySelectorAll(TURN_SEL).forEach(processTurn); }

function startObserver() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(TURN_SEL)) { processTurn(node); continue; }
        node.querySelectorAll(TURN_SEL).forEach(processTurn);
      }
      if (m.type === "characterData" || m.type === "childList") {
        const target = m.target instanceof HTMLElement ? m.target : m.target.parentElement;
        if (!target) continue;
        const turn = target.closest(TURN_SEL);
        if (!turn) continue;
        clearTimeout(turn._clTimer);
        turn._clTimer = setTimeout(() => {
          const prev = turn.nextElementSibling;
          if (prev && prev.classList.contains("cl-wrapper")) {
            prev.remove();
            turn.removeAttribute(BADGE_ATTR);
          }
          processTurn(turn);
        }, 800);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

chrome.storage.sync.get({ chatLens_enabled: true, chatLens_sensitivity: "medium" }, (items) => {
  enabled     = items.chatLens_enabled;
  sensitivity = items.chatLens_sensitivity;
  scanAll();
  startObserver();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.chatLens_enabled !== undefined) {
    enabled = changes.chatLens_enabled.newValue;
    if (!enabled) { removeAllBadges(); } else { scanAll(); }
  }
  if (changes.chatLens_sensitivity !== undefined) {
    sensitivity = changes.chatLens_sensitivity.newValue;
    removeAllBadges();
    scanAll();
  }
});
