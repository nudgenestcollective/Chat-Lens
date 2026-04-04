const CONFIDENCE_PHRASES = [
  "this is a strong idea", "this makes sense", "you're onto something",
  "you are onto something", "great idea", "excellent point", "absolutely",
  "brilliant", "fantastic", "spot on", "exactly right", "totally agree",
  "perfect approach", "great point", "well said", "you're right",
  "that's a great", "love this idea", "this is genius",
  "great question", "that's a great question", "you're absolutely right",
  "you've nailed it", "that's so insightful", "you're very perceptive",
  "i love that", "i completely agree", "you've clearly thought about this",
  "this is exciting", "that's innovative",
];

const COMMITMENT_PHRASES = [
  "you should", "this could be a product", "this is a good path forward",
  "you need to", "i recommend", "the best approach", "this will work",
  "this is the way", "go ahead and", "definitely do", "without a doubt",
  "i strongly suggest", "this is definitely", "you must", "the right move",
  "this is a no-brainer", "you can't go wrong", "there's no reason not to",
  "just go for it", "move forward with", "this will definitely work",
  "you've got what it takes", "don't hesitate to",
  "now is the time", "don't wait", "you don't want to miss this",
  "this is a rare opportunity",
];

const CRITIQUE_MARKERS = [
  "however", "on the other hand", "limitation", "uncertain", "but",
  "although", "caveat", "concern", "drawback", "risk", "challenge",
  "consideration", "not necessarily", "it depends", "alternatively",
  "downside", "trade-off", "tradeoff", "worth noting", "keep in mind",
  "one issue", "potential problem", "may not", "might not",
  "be aware", "worth considering", "consult a professional", "verify this",
  "there's no guarantee", "results may vary", "this isn't guaranteed",
  "you may want to check", "i could be wrong", "seek advice",
  "do your own research", "speak to a", "talk to a",
];

const SENSITIVITY_WEIGHTS = {
  low:    { confidence: 1,   commitment: 1.5, noCritique: 1,   repetition: 1.5 },
  medium: { confidence: 2,   commitment: 3,   noCritique: 2,   repetition: 3   },
  high:   { confidence: 3,   commitment: 4,   noCritique: 3,   repetition: 4   },
};

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "by","from","is","it","this","that","you","your","i","we","can","will",
  "be","are","was","were","have","has","had","do","does","did","not","as",
  "if","so","up","out","about","which","when","what","how","also","just",
  "more","very","would","could","should","may","might","then","than","into",
  "its","there","their","they","them","these","those","my","our","here",
]);

function matchPhrases(text, phrases) {
  const lower = text.toLowerCase();
  const matched = [];
  for (const phrase of phrases) {
    if (lower.includes(phrase)) matched.push(phrase);
  }
  return matched;
}

function findRepeatedKeywords(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq).filter(([, c]) => c >= 3).map(([w]) => w);
}

function computeCAS(text, sensitivity) {
  const weights = SENSITIVITY_WEIGHTS[sensitivity] || SENSITIVITY_WEIGHTS.medium;
  const breakdown = [];
  let raw = 0;

  const confMatched = matchPhrases(text, CONFIDENCE_PHRASES);
  if (confMatched.length) {
    raw += weights.confidence;
    breakdown.push({ label: "Uses overly confident language", delta: +weights.confidence,
      detail: confMatched.slice(0,3).map(p=>`"${p}"`).join(", ") });
  }

  const commMatched = matchPhrases(text, COMMITMENT_PHRASES);
  if (commMatched.length) {
    raw += weights.commitment;
    breakdown.push({ label: "Tells you what you should do", delta: +weights.commitment,
      detail: commMatched.slice(0,3).map(p=>`"${p}"`).join(", ") });
  }

  if (!matchPhrases(text, CRITIQUE_MARKERS).length) {
    raw -= weights.noCritique;
    breakdown.push({ label: "Offers no warnings or limitations", delta: -weights.noCritique,
      detail: 'Missing: "however", "limitation", "on the other hand"...' });
  }

  const repeated = findRepeatedKeywords(text);
  if (repeated.length) {
    raw += weights.repetition;
    breakdown.push({ label: "Repeats ideas to seem more convincing", delta: +weights.repetition,
      detail: repeated.slice(0,5).map(w=>`"${w}"`).join(", ") });
  }

  return { score: Math.min(10, Math.max(0, Math.round(raw))), breakdown };
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

function createBadge(casResult) {
  const { score, breakdown } = casResult;
  const wrapper = document.createElement("div");
  wrapper.className = "cl-wrapper";

  const badge = document.createElement("button");
  badge.className = "cl-badge";
  badge.setAttribute("aria-expanded", "false");
  badge.style.setProperty("--cl-color", badgeColor(score));
  badge.innerHTML = `<span class="cl-icon">⚠️</span><span class="cl-score">AI Check: ${score}/10</span><span class="cl-level">${scoreLabel(score)}</span><span class="cl-chevron">▾</span>`;

  const panel = document.createElement("div");
  panel.className = "cl-panel";
  panel.hidden = true;

  const title = document.createElement("p");
  title.className = "cl-panel-title";
  title.textContent = `This response may need a human second opinion`;

  const list = document.createElement("ul");
  list.className = "cl-list";

  if (!breakdown.length) {
    const li = document.createElement("li");
    li.textContent = "No significant sycophancy signals detected.";
    list.appendChild(li);
  } else {
    for (const item of breakdown) {
      const li = document.createElement("li");
      li.className = `cl-item ${item.delta < 0 ? "cl-neg" : "cl-pos"}`;
      li.innerHTML = `<span class="cl-delta">${item.delta > 0 ? "+" : ""}${item.delta}</span><span class="cl-body"><strong>${item.label}</strong><em>${item.detail}</em></span>`;
      list.appendChild(li);
    }
  }

  const footer = document.createElement("p");
  footer.className = "cl-footer";
  footer.textContent = "Chat Lens — AI responses can be confidently wrong";

  panel.appendChild(title);
  panel.appendChild(list);
  panel.appendChild(footer);

  badge.addEventListener("click", () => {
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
  turnEl.after(createBadge(computeCAS(text, sensitivity)));
}

function removeAllBadges() {
  document.querySelectorAll(".cl-wrapper").forEach(el => el.remove());
  document.querySelectorAll(`[${BADGE_ATTR}]`).forEach(el => el.removeAttribute(BADGE_ATTR));
}

const TURN_SEL = '[data-message-author-role="assistant"]';
const PROSE_SEL = ".markdown, .prose, [class*='markdown'], [class*='prose']";

let enabled = true;
let sensitivity = "medium";
let observer = null;

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
  enabled = items.chatLens_enabled;
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
