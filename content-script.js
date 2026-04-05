const VERA_DEBUG = true;

const AS_ABSOLUTE = [
  "the best way", "the only way", "will always", "always works",
  "guaranteed to", "without question", "without a doubt", "the most effective",
  "most effective way", "the right way", "the correct way", "naturally builds",
  "naturally leads", "naturally creates", "the best approach", "the best strategy",
  "clearly the", "obviously the", "certainly will", "always the case",
  "there is no doubt", "undoubtedly", "will ensure", "always leads to",
];
const AS_HEDGED = [
  "may", "might", "could", "sometimes", "it depends", "varies",
  "in some cases", "can be", "tends to", "not always", "for some people",
  "in certain situations", "one possibility", "potentially", "perhaps",
  "arguably", "often", "generally", "usually", "typically", "in many cases",
];
const GS_REAL = [
  "for example", "for instance", "such as", "specifically", "published",
  "peer-reviewed", "cited", "in a study of", "from a survey of", "documented",
  "in trials", "the experiment showed", "the data from", "the results of",
];
const GS_VAGUE = [
  "some might say", "it has been noted", "generally observed",
  "widely reported", "commonly cited", "often referenced",
];
const FAS_MILD = [
  "research suggests", "studies suggest", "experts say", "it is believed",
  "experts believe", "many researchers", "some studies",
];
const FAS_STRONG = [
  "research shows", "studies show", "data shows", "proven",
  "scientifically proven", "the science shows", "evidence shows",
];
const FAS_HIGH_CONF = [
  "92%", "93%", "94%", "95%", "96%", "97%", "98%", "99%",
  "scientists agree", "consensus shows", "all experts agree",
  "universally proven", "clinically proven",
];
const US_EXPLICIT = [
  "may", "might", "could", "can vary", "varies", "depends",
  "depending on", "in many cases", "in some cases", "generally",
  "often", "sometimes", "not always", "is not guaranteed",
  "can depend", "tends to", "i could be wrong", "worth verifying",
  "consult a professional", "seek advice", "i'm not certain",
  "i'm not sure", "results may vary", "your situation may differ",
];
const SC_SCOPE = [
  "if you're", "if you are", "depending on", "in your situation",
  "in your case", "for your specific", "given your", "based on your",
  "in some industries", "in some workplaces", "for those who",
  "assuming you", "context-dependent", "varies by",
];
const SC_LIMIT = [
  "not always", "may not apply", "there are exceptions", "this may not",
  "won't work for everyone", "not universal", "exceptions exist",
  "your mileage may vary", "not for everyone", "this varies", "individual results",
];
const SC_UNIVERSAL = [
  "everyone should", "anyone can", "always works", "in any situation",
  "regardless of", "universally", "no matter what", "works for everyone",
  "applies to all", "in every case", "without exception",
];
const SENSITIVITY_MULTIPLIERS = { low: 0.7, medium: 1.0, high: 1.3 };

function matchAny(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.filter(p => lower.includes(p));
}

function scoreAS(text) {
  const absolute = matchAny(text, AS_ABSOLUTE);
  const hedged   = matchAny(text, AS_HEDGED);
  let score;
  if      (absolute.length === 0 && hedged.length === 0) score = 1;
  else if (absolute.length === 0 && hedged.length  > 0) score = 0;
  else if (absolute.length  > 0 && hedged.length   > 0) score = 1;
  else if (absolute.length  > 0 && hedged.length  === 0) score = 2;
  if      (absolute.length >= 3 && hedged.length  === 0) score = 3;
  if (VERA_DEBUG) {
    console.groupCollapsed("[VERA] Assertion Strength: " + score + "/3");
    console.log("Absolute:", absolute);
    console.log("Hedged:  ", hedged);
    console.groupEnd();
  }
  return { score, matched: { absolute, hedged } };
}

function scoreGS(text) {
  const real  = matchAny(text, GS_REAL);
  const vague = matchAny(text, GS_VAGUE);
  const score = real.length > 0 ? 0 : vague.length > 0 ? 1 : 2;
  return { score, matched: { real, vague } };
}

function scoreFAS(text) {
  const mild     = matchAny(text, FAS_MILD);
  const strong   = matchAny(text, FAS_STRONG);
  const highConf = matchAny(text, FAS_HIGH_CONF);
  let score;
  if      (highConf.length > 0) score = 3;
  else if (strong.length   > 0) score = 2;
  else if (mild.length     > 0) score = 1;
  else                           score = 0;
  return { score, matched: { mild, strong, highConf } };
}

function scoreUS(text) {
  const matched = matchAny(text, US_EXPLICIT);
  const score   = matched.length > 0 ? 0 : 2;
  return { score, matched: { explicit: matched, hedged: [] } };
}

function scoreES(text) {
  const gs  = scoreGS(text);
  const fas = scoreFAS(text);
  const us  = scoreUS(text);
  const raw = (0.5 * gs.score) + (1.0 * fas.score) + (0.5 * us.score);
  // Cautious response correction: hedging + no strong authority = lower risk
  let adjusted = raw;
  if (us.score === 0 && fas.score <= 1) {
    adjusted = Math.max(0, raw - 1.5);
  }
  const score = Math.min(3, Math.max(0, Math.round(adjusted)));
  if (VERA_DEBUG) {
    console.groupCollapsed("[VERA] Evidence Signal: " + score + "/3 (raw: " + raw.toFixed(2) + ")");
    console.groupCollapsed("  GS Grounding: " + gs.score + "/2");
    console.log("  Real:", gs.matched.real, "  Vague:", gs.matched.vague);
    console.groupEnd();
    console.groupCollapsed("  FAS Authority: " + fas.score + "/3");
    console.log("  Mild:", fas.matched.mild, "  Strong:", fas.matched.strong, "  High:", fas.matched.highConf);
    console.groupEnd();
    console.groupCollapsed("  US Uncertainty: " + us.score + "/2");
    console.log("  Explicit:", us.matched.explicit, "  Hedged:", us.matched.hedged);
    console.groupEnd();
    console.log("  (0.5x" + gs.score + ") + (1.0x" + fas.score + ") + (0.5x" + us.score + ") = " + raw.toFixed(2) + " -> " + score);
    console.groupEnd();
  }
  return { score, sub: { gs, fas, us }, raw };
}

function scoreSC(text) {
  const scope     = matchAny(text, SC_SCOPE);
  const limit     = matchAny(text, SC_LIMIT);
  const universal = matchAny(text, SC_UNIVERSAL);
  let score;
  if      (universal.length > 0)                                           score = 3;
  else if (scope.length >= 2 || (scope.length >= 1 && limit.length >= 1)) score = 0;
  else if (scope.length === 1 || limit.length === 1)                       score = 1;
  else                                                                      score = 2;
  if (VERA_DEBUG) {
    console.groupCollapsed("[VERA] Scope Coverage: " + score + "/3");
    console.log("Scope:", scope, "  Limit:", limit, "  Universal:", universal);
    console.groupEnd();
  }
  return { score, matched: { scope, limit, universal } };
}

function computeVERA(text, sensitivity) {
  const as = scoreAS(text);
  const es = scoreES(text);
  const sc = scoreSC(text);
  const weighted   = (as.score * 0.25) + (es.score * 0.45) + (sc.score * 0.30);
  const multiplier = SENSITIVITY_MULTIPLIERS[sensitivity] || 1.0;
  const score      = Math.min(10, Math.max(0, Math.round((weighted / 3) * 10 * multiplier)));
  if (VERA_DEBUG) {
    console.groupCollapsed("[VERA] Final: " + score + "/10");
    console.log("W = (" + as.score + "x0.25) + (" + es.score + "x0.45) + (" + sc.score + "x0.30) = " + weighted.toFixed(3));
    console.log("Sensitivity: " + sensitivity + " (x" + multiplier + ")");
    console.log("Score: " + score + "/10");
    console.groupEnd();
  }
  let esDetail;
  if (es.sub.fas.score === 3)
    esDetail = "High-confidence authority claim: " + es.sub.fas.matched.highConf.slice(0,2).map(function(p){return '"'+p+'"';}).join(", ");
  else if (es.sub.fas.score === 2)
    esDetail = "Strong authority framing without evidence: " + es.sub.fas.matched.strong.slice(0,2).map(function(p){return '"'+p+'"';}).join(", ");
  else if (es.sub.fas.score === 1)
    esDetail = "Mild authority framing: " + es.sub.fas.matched.mild.slice(0,2).map(function(p){return '"'+p+'"';}).join(", ");
  else if (es.sub.gs.score === 0)
    esDetail = "Grounded: " + es.sub.gs.matched.real.slice(0,2).map(function(p){return '"'+p+'"';}).join(", ");
  else if (es.sub.us.score === 0)
    esDetail = "No evidence but signals uncertainty: " + es.sub.us.matched.explicit.slice(0,2).map(function(p){return '"'+p+'"';}).join(", ");
  else
    esDetail = "No data, sources, examples, or uncertainty signals -- claims stated as fact";
  const LABELS_AS = ["Well hedged","Mixed certainty","Mostly absolute","Entirely absolute"];
  const LABELS_ES = ["Evidence cited","Weak evidence","Ungrounded but honest","Pure assertion"];
  const LABELS_SC = ["Explicitly bounded","Partially bounded","Implicitly universal","Actively universal"];
  const asDetail = as.score === 3
    ? "No hedging. Absolute: " + as.matched.absolute.slice(0,3).map(function(p){return '"'+p+'"';}).join(", ")
    : as.score === 2
    ? "Absolute dominates: " + as.matched.absolute.slice(0,2).map(function(p){return '"'+p+'"';}).join(", ")
    : as.score === 1 && as.matched.absolute.length
    ? "Mixed: \"" + as.matched.absolute[0] + "\" vs \"" + as.matched.hedged[0] + "\""
    : as.score === 1 ? "Neutral -- neither clearly hedged nor absolute"
    : "Hedged: " + as.matched.hedged.slice(0,3).map(function(p){return '"'+p+'"';}).join(", ");
  const scDetail = sc.score === 0
    ? "Scoped: " + [...sc.matched.scope,...sc.matched.limit].slice(0,2).map(function(p){return '"'+p+'"';}).join(", ")
    : sc.score === 1
    ? "Partial: \"" + [...sc.matched.scope,...sc.matched.limit][0] + "\""
    : sc.score === 2
    ? "No scope conditions -- implies advice applies to everyone in all situations"
    : "Actively universal: " + sc.matched.universal.slice(0,2).map(function(p){return '"'+p+'"';}).join(", ");
  const breakdown = [
    { dimension: "Assertion Strength", score: as.score, max: 3, label: LABELS_AS[as.score], detail: asDetail },
    { dimension: "Evidence Signal",    score: es.score, max: 3, label: LABELS_ES[es.score], detail: esDetail },
    { dimension: "Scope Coverage",     score: sc.score, max: 3, label: LABELS_SC[sc.score], detail: scDetail },
  ];
  return { score, breakdown };
}

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
function dimColor(s, max) {
  const ratio = s / max;
  return ratio >= 0.67 ? "#e53935" : ratio >= 0.34 ? "#fb8c00" : "#43a047";
}

function createBadge(veraResult) {
  const { score, breakdown } = veraResult;
  const wrapper = document.createElement("div");
  wrapper.className = "cl-wrapper";
  const badge = document.createElement("button");
  badge.className = "cl-badge";
  badge.setAttribute("aria-expanded", "false");
  badge.style.setProperty("--cl-color", badgeColor(score));
  badge.innerHTML =
    '<span class="cl-icon">⚠️</span>' +
    '<span class="cl-score">Risk ' + score + '/10</span>' +
    '<span class="cl-level">' + scoreLabel(score) + '</span>' +
    '<span class="cl-chevron">▾</span>';
  const panel = document.createElement("div");
  panel.className = "cl-panel";
  panel.hidden = true;
  const title = document.createElement("p");
  title.className = "cl-panel-title";
  title.textContent = "Epistemic Risk Score: " + score + "/10";
  const list = document.createElement("ul");
  list.className = "cl-list";
  for (const dim of breakdown) {
    const li = document.createElement("li");
    li.className = "cl-item";
    li.innerHTML =
      '<span class="cl-delta" style="color:' + dimColor(dim.score, dim.max) + '">' + dim.score + '/' + dim.max + '</span>' +
      '<span class="cl-body"><strong>' + dim.dimension + ' — ' + dim.label + '</strong><em>' + dim.detail + '</em></span>';
    list.appendChild(li);
  }
  const footer = document.createElement("p");
  footer.className = "cl-footer";
  footer.textContent = "Chat Lens — AI can sound certain and still be wrong";
  panel.appendChild(title);
  panel.appendChild(list);
  panel.appendChild(footer);
  badge.addEventListener("click", function() {
    const open = badge.getAttribute("aria-expanded") === "true";
    badge.setAttribute("aria-expanded", String(!open));
    badge.querySelector(".cl-chevron").textContent = open ? "▾" : "▴";
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
  document.querySelectorAll(".cl-wrapper").forEach(function(el) { el.remove(); });
  document.querySelectorAll("[" + BADGE_ATTR + "]").forEach(function(el) { el.removeAttribute(BADGE_ATTR); });
}

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
  observer = new MutationObserver(function(mutations) {
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
        turn._clTimer = setTimeout(function() {
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

chrome.storage.sync.get({ chatLens_enabled: true, chatLens_sensitivity: "medium" }, function(items) {
  enabled     = items.chatLens_enabled;
  sensitivity = items.chatLens_sensitivity;
  scanAll();
  startObserver();
});
chrome.storage.onChanged.addListener(function(changes) {
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
