/**
 * Chat Lens — Content Script (VERA v3)
 * Validated Epistemic Risk Assessment
 * Runs on ChatGPT (chatgpt.com / chat.openai.com).
 */

// ─── Phrase Lists ───────────────────────────────────────────────────────────

const AS_ABSOLUTE = [
  "always", "never", "definitely", "certainly", "guaranteed", "without doubt",
  "the only way", "you must", "you have to", "the best", "the worst",
  "the right way", "the correct way", "proven", "fact", "clearly",
  "obviously", "undeniably", "without question", "absolutely",
];

const AS_HEDGED = [
  "might", "may", "could", "perhaps", "possibly", "it depends",
  "generally", "typically", "in most cases", "often", "sometimes",
  "consider", "one approach", "one option", "worth exploring",
  "not always", "varies", "context-dependent",
];

const WEAK_AUTHORITY_PHRASES = [
  "research suggests", "studies show", "experts say", "science says",
  "according to experts", "research shows", "studies indicate",
  "experts agree", "data suggests", "evidence suggests",
  "it has been shown", "it is known", "it is widely accepted",
  "many experts", "most experts", "scientists say", "doctors say",
];

const HONEST_HEDGE_PHRASES = [
  "i'm not sure", "i don't know", "i may be wrong", "i could be mistaken",
  "you should verify", "check with a professional", "consult a doctor",
  "consult an expert", "i recommend checking", "this is not advice",
  "not financial advice", "not medical advice", "please verify",
  "i'm not an expert", "my knowledge may be outdated", "as of my training",
];

const SC_UNIVERSAL = [
  "everyone should", "all people", "anyone can", "works for everyone",
  "universally", "across the board", "in all cases", "no matter what",
  "regardless of", "for everyone",
];

const SC_LIMIT = [
  "in your case", "for you specifically", "depending on your situation",
  "your mileage may vary", "this varies", "consult your", "ask your",
  "based on your", "for your specific",
];

const DR_STRONG = [
  "you need to act now", "don't wait", "time is running out",
  "act immediately", "do this today", "don't miss this",
  "you can't afford to", "you'll regret", "stop waiting",
  "this is urgent", "before it's too late",
];

const LOW_PRESSURE_PATTERNS = [
  "when you're ready", "at your own pace", "no rush", "take your time",
  "whenever you can", "if you'd like", "feel free to",
];

const LOW_STAKES_SIGNALS = [
  "recipe", "movie", "book", "game", "fun", "hobby", "music",
  "playlist", "workout routine", "restaurant", "vacation", "travel",
  "decoration", "gift idea", "hairstyle", "fashion",
];

const HIGH_STAKES_SIGNALS = [
  "invest", "investment", "stock", "crypto", "surgery", "medication",
  "diagnosis", "legal", "lawsuit", "attorney", "mortgage", "loan",
  "bankruptcy", "quit your job", "leave your partner", "divorce",
  "hire", "fire",
];

const ANALYTICAL_SIGNALS = [
  "consider", "one approach", "one option", "think about", "the goal",
  "the challenge", "the opportunity", "the idea", "strategy", "analysis",
  "implies", "indicates", "the pattern", "the reason", "this works because",
  "the key", "the point", "what this means", "in this case", "alternatively",
  "on the other hand", "the insight", "the tension", "you might", "could work",
  "worth exploring", "frame this as", "the question is", "the real issue",
  "in other words", "this suggests", "one way to", "another way",
  "positioning", "tradeoff", "depends on", "the distinction",
];

const URGENCY_PHRASES = [
  "right now", "act fast", "don't miss", "act immediately",
  "time is running out", "before it's too late", "do this today",
  "don't delay", "act today", "limited time", "now or never",
];

const SCARCITY_PHRASES = [
  "rare opportunity", "doesn't come often", "once in a lifetime",
  "limited opportunity", "not many people know",
  "while you still can", "window is closing",
];

const UPSIDE_FRAMING = [
  "rapid growth", "maximize returns", "massive upside", "huge potential",
  "explosive growth", "life-changing", "transform your",
  "outperform", "beat the market",
];

const DIRECTIONAL_ADVICE = [
  "invest heavily", "buy now", "sell now", "put your money",
  "move your money", "go all in", "double down", "load up on",
  "get in now", "buy the dip", "take a position",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function matchAny(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.filter((p) => lower.includes(p));
}

function hasCitationsOrData(text) {
  return (
    /\(\d{4}\)/.test(text) ||
    /doi\.org/.test(text) ||
    /et al\./.test(text) ||
    /\d+%/.test(text) ||
    /n\s*=\s*\d+/.test(text) ||
    /p\s*[<>]\s*0\.\d+/.test(text) ||
    /figure \d|table \d|appendix/i.test(text)
  );
}

function countConcreteClaims(text) {
  const patterns = [
    /\d+%/g, /\$[\d,]+/g, /\d+ (studies|trials|people|participants)/gi,
    /according to [A-Z][a-z]+/g,
  ];
  let count = 0;
  for (const p of patterns) {
    const m = text.match(p);
    if (m) count += m.length;
  }
  return count;
}

// ─── Dimension Scorers ───────────────────────────────────────────────────────

function scoreAS(text) {
  const absolute = matchAny(text, AS_ABSOLUTE);
  const hedged   = matchAny(text, AS_HEDGED);
  if (absolute.length >= 2 && hedged.length === 0) return { score: 3, absolute, hedged };
  if (absolute.length >= 1 && hedged.length === 0) return { score: 2, absolute, hedged };
  if (absolute.length >= 1 && hedged.length >= 1)  return { score: 2, absolute, hedged };
  if (hedged.length >= 2)  return { score: 0, absolute, hedged };
  if (hedged.length === 1) return { score: 1, absolute, hedged };
  return { score: 2, absolute, hedged };
}

function isAnalytical(text) {
  return matchAny(text, ANALYTICAL_SIGNALS).length >= 2;
}

function scoreES(text) {
  if (hasCitationsOrData(text)) return { score: 0, matched: [] };
  const weakAuth = matchAny(text, WEAK_AUTHORITY_PHRASES);
  if (weakAuth.length > 0)      return { score: 1, matched: weakAuth };
  const hedging  = matchAny(text, HONEST_HEDGE_PHRASES);
  if (hedging.length > 0)       return { score: 2, matched: hedging };
  // Analytical/interpretive content does not require citations
  if (isAnalytical(text))       return { score: 2, matched: [], analytical: true };
  return { score: 3, matched: [] };
}

function scoreSC(text) {
  const universal = matchAny(text, SC_UNIVERSAL);
  const limited   = matchAny(text, SC_LIMIT);
  if (universal.length > 0 && limited.length === 0) return { score: 3, universal, limited };
  if (universal.length > 0 && limited.length > 0)   return { score: 2, universal, limited };
  if (limited.length > 0)                           return { score: 1, universal, limited };
  return { score: 2, universal, limited };
}

function shouldApplyDR(text) {
  const hasDR = matchAny(text, DR_STRONG).length > 0;
  if (!hasDR) return false;
  const hasLowPressure = matchAny(text, LOW_PRESSURE_PATTERNS).length > 0;
  return !hasLowPressure;
}

function classifyContext(text) {
  const low  = matchAny(text, LOW_STAKES_SIGNALS).length;
  const high = matchAny(text, HIGH_STAKES_SIGNALS).length;
  if (high > 0) return "HIGH_STAKES";
  if (low > 0)  return "LOW_STAKES";
  return "DECISION";
}

function scorePUE(text) {
  const urgency  = matchAny(text, URGENCY_PHRASES);
  const scarcity = matchAny(text, SCARCITY_PHRASES);
  const upside   = matchAny(text, UPSIDE_FRAMING);
  const directed = matchAny(text, DIRECTIONAL_ADVICE);
  const matched  = [...urgency, ...scarcity, ...upside, ...directed];
  return { triggered: matched.length > 0, matched };
}

// ─── VERA Engine ─────────────────────────────────────────────────────────────

const SENSITIVITY_MULTIPLIERS = { low: 0.75, medium: 1.0, high: 1.25 };

function computeVERA(text, sensitivity = "medium") {
  const multiplier = SENSITIVITY_MULTIPLIERS[sensitivity] || 1.0;

  const as = scoreAS(text);
  const es = scoreES(text);
  const sc = scoreSC(text);

  const esWeight = (es.score === 3 && !isAnalytical(text)) ? 1.5 : 0.45;
  const weighted = (as.score * 0.25) + (es.score * esWeight) + (sc.score * 0.30);
  let score = Math.min(10, Math.max(0, Math.round((weighted / 3) * 10 * multiplier)));

  if (shouldApplyDR(text) && es.score >= 2) score = Math.min(10, score + 2);
  if (es.score >= 2 && as.score <= 1 && sc.score <= 1) score = Math.max(score, 3);
  if (countConcreteClaims(text) <= 1 && es.score >= 1 && as.score <= 1) score = Math.max(score, 2);

  const context = classifyContext(text);
  if (context === "LOW_STAKES") score = Math.min(score, 3);

  let riskLevel = score >= 7 ? "HIGH" : score >= 4 ? "MEDIUM" : "LOW";
  const breakdown = [];

  if (as.score >= 2) {
    breakdown.push({
      label: "States things as absolute facts",
      detail: as.absolute.length ? "Phrases like: \u201c" + as.absolute.slice(0,3).join("\u201d, \u201c") + "\u201d" : "No hedging language detected",
      positive: false,
    });
  } else if (as.score === 0) {
    breakdown.push({
      label: "Uses careful, hedged language",
      detail: as.hedged.length ? "Phrases like: \u201c" + as.hedged.slice(0,3).join("\u201d, \u201c") + "\u201d" : "",
      positive: true,
    });
  }

  if (es.score === 3) {
    breakdown.push({ label: "No evidence \u2014 stated as fact", detail: "No data, citations, or acknowledgement of uncertainty", positive: false });
  } else if (es.score === 2) {
    const esLabel = es.analytical ? "Reasoning and interpretation" : "Acknowledges uncertainty";
    const esDetail = es.analytical ? "Response uses analytical language rather than hard factual claims" : (es.matched.length ? "Phrases like: \u201c" + es.matched.slice(0,2).join("\u201d, \u201c") + "\u201d" : "");
    breakdown.push({ label: esLabel, detail: esDetail, positive: true });
  } else if (es.score === 1) {
    breakdown.push({ label: "Weak evidence", detail: es.matched.length ? "Vague authority: \u201c" + es.matched.slice(0,2).join("\u201d, \u201c") + "\u201d" : "", positive: false });
  } else {
    breakdown.push({ label: "Cites real data or sources", detail: "Contains statistics, citations, or verifiable references", positive: true });
  }

  if (sc.score >= 3) {
    breakdown.push({ label: "Treats advice as universal", detail: sc.universal.length ? "Phrases like: \u201c" + sc.universal.slice(0,2).join("\u201d, \u201c") + "\u201d" : "", positive: false });
  } else if (sc.score <= 1) {
    breakdown.push({ label: "Acknowledges individual differences", detail: sc.limited.length ? "Phrases like: \u201c" + sc.limited.slice(0,2).join("\u201d, \u201c") + "\u201d" : "", positive: true });
  }

  if (context === "HIGH_STAKES") {
    breakdown.push({ label: "High-stakes topic", detail: "Involves finances, health, legal, or major life decisions", positive: false });
  }

  if (shouldApplyDR(text)) {
    breakdown.push({ label: "Pressure to act quickly", detail: "Uses urgency language that discourages pausing to verify", positive: false });
  }

  // Persuasion & Urgency Escalation — override to RED in high-stakes domains
  const pue = scorePUE(text);
  const strongEvidence = es.score === 0 && as.score === 0;
  if (pue.triggered && context === "HIGH_STAKES" && !strongEvidence) {
    score = Math.max(score, 7);
    riskLevel = "HIGH";
  }

  if (pue.triggered) {
    breakdown.push({
      label: "Uses persuasion or urgency",
      detail: pue.matched.length ? "Phrases like: \u201c" + pue.matched.slice(0, 2).join("\u201d, \u201c") + "\u201d" : "",
      positive: false,
    });
  }

  console.debug("[ChatLens VERA]", { score, riskLevel, as, es, sc, context, pue, multiplier });
  return { score, riskLevel, breakdown };
}

// ─── UI Component ───────────────────────────────────────────────────────────

const BADGE_ATTR = "data-chat-lens-scored";

const RISK_CONFIG = {
  LOW: {
    emoji:    "\uD83D\uDFE2",
    color:    "#2e7d32",
    bg:       "#e8f5e9",
    border:   "#a5d6a7",
    headline: "Looks reasonable to trust",
    subline:  "This response uses careful language and doesn\u2019t overstate its confidence.",
  },
  MEDIUM: {
    emoji:    "\uD83D\uDFE1",
    color:    "#e65100",
    bg:       "#fff8e1",
    border:   "#ffe082",
    headline: "Worth a second look",
    subline:  "Some claims here could use independent verification before you act on them.",
  },
  HIGH: {
    emoji:    "\uD83D\uDD34",
    color:    "#c62828",
    bg:       "#ffebee",
    border:   "#ef9a9a",
    headline: "Get a second opinion",
    subline:  "This response states things confidently but the evidence behind them is unclear.",
  },
};

function createBadge(veraResult) {
  const { riskLevel, breakdown } = veraResult;
  const cfg = RISK_CONFIG[riskLevel] || RISK_CONFIG.MEDIUM;

  const wrapper = document.createElement("div");
  wrapper.className = "cl-wrapper";

  const badge = document.createElement("button");
  badge.className = "cl-badge";
  badge.setAttribute("aria-expanded", "false");
  badge.style.cssText = "--cl-color: " + cfg.color + "; --cl-bg: " + cfg.bg + "; --cl-border: " + cfg.border + ";";
  badge.innerHTML = "<span class=\"cl-icon\">" + cfg.emoji + "</span><span class=\"cl-label\">" + cfg.headline + "</span><span class=\"cl-chevron\">\u25be</span>";

  const panel = document.createElement("div");
  panel.className = "cl-panel";
  panel.hidden = true;
  panel.style.cssText = "border-color: " + cfg.border + "; background: " + cfg.bg + ";";

  const trustQ = document.createElement("p");
  trustQ.className = "cl-question";
  trustQ.innerHTML = "<strong>Can you trust this?</strong> " + cfg.subline;

  const actQ = document.createElement("p");
  actQ.className = "cl-question";
  if (riskLevel === "LOW") {
    actQ.innerHTML = "<strong>Should you act on this?</strong> Likely fine for everyday decisions. For major choices, still good to double-check.";
  } else if (riskLevel === "MEDIUM") {
    actQ.innerHTML = "<strong>Should you act on this?</strong> For small decisions, okay to proceed with caution. For anything important, verify with another source or a real expert.";
  } else {
    actQ.innerHTML = "<strong>Should you act on this?</strong> For anything significant \u2014 money, health, legal, or relationships \u2014 consult a qualified human expert before acting.";
  }

  const hallucNote = riskLevel === "HIGH" ? (() => {
    const n = document.createElement("p");
    n.className = "cl-note";
    n.textContent = "Note: AI responses sometimes present invented details \u2014 names, statistics, or sources \u2014 as if they\u2019re real. Before repeating or acting on specific facts here, check them independently.";
    return n;
  })() : null;

  if (breakdown.length > 0) {
    const signalsTitle = document.createElement("p");
    signalsTitle.className = "cl-signals-title";
    signalsTitle.textContent = "Why this rating:";

    const list = document.createElement("ul");
    list.className = "cl-list";

    for (const item of breakdown) {
      const li = document.createElement("li");
      li.className = "cl-item " + (item.positive ? "cl-pos" : "cl-neg");
      const icon = item.positive ? "\u2714\ufe0f" : "\u26a0\ufe0f";
      li.innerHTML = "<span class=\"cl-item-icon\">" + icon + "</span><span class=\"cl-body\"><strong>" + item.label + "</strong>" + (item.detail ? "<em>" + item.detail + "</em>" : "") + "</span>";
      list.appendChild(li);
    }

    panel.appendChild(trustQ);
    panel.appendChild(actQ);
    if (hallucNote) panel.appendChild(hallucNote);
    panel.appendChild(signalsTitle);
    panel.appendChild(list);
  } else {
    panel.appendChild(trustQ);
    panel.appendChild(actQ);
    if (hallucNote) panel.appendChild(hallucNote);
  }

  const footer = document.createElement("p");
  footer.className = "cl-footer";
  footer.textContent = "Chat Lens \u2014 epistemic risk detector";
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
  const result = computeVERA(text, sensitivity);
  turnEl.after(createBadge(result));
}

function removeAllBadges() {
  document.querySelectorAll(".cl-wrapper").forEach((el) => el.remove());
  document.querySelectorAll("[" + BADGE_ATTR + "]").forEach((el) => el.removeAttribute(BADGE_ATTR));
}

// ─── Observer & Init ────────────────────────────────────────────────────────

const TURN_SEL  = '[data-message-author-role="assistant"]';
const PROSE_SEL = ".markdown, .prose, [class*='markdown'], [class*='prose']";

let enabled     = true;
let sensitivity = "medium";
let observer    = null;

function extractText(el) {
  return (el.querySelector(PROSE_SEL) || el).innerText || "";
}

function processTurn(el) {
  if (!enabled) return;
  const text = extractText(el);
  if (text.trim().length < 30) return;
  injectBadge(el, text, sensitivity);
}

function scanAll() {
  document.querySelectorAll(TURN_SEL).forEach(processTurn);
}

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

chrome.storage.sync.get(
  { chatLens_enabled: true, chatLens_sensitivity: "medium" },
  (items) => {
    enabled     = items.chatLens_enabled;
    sensitivity = items.chatLens_sensitivity;
    scanAll();
    startObserver();
  }
);

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
