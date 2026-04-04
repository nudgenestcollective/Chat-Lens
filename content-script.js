/**
 * Chat Lens — Epistemic Risk Framework (ERF)
 * 5-dimension scoring engine. Runs on chatgpt.com / chat.openai.com.
 */

const ABSOLUTE_PHRASES = [
  "the best way", "the only way", "will always", "always works", "definitely will",
  "guaranteed to", "without question", "without a doubt", "the most effective",
  "most effective way", "the right way", "the correct way", "naturally builds",
  "naturally leads", "naturally creates", "cannot fail", "the best approach",
  "the best strategy", "the best method", "clearly the", "obviously the",
  "certainly will", "the proven way", "always the case", "100%",
];

const HEDGED_PHRASES = [
  "may", "might", "could", "sometimes", "it depends", "varies", "in some cases",
  "can be", "tends to", "not always", "for some people", "in certain situations",
  "one possibility", "worth exploring", "potentially", "perhaps", "arguably",
];

const ANCHORING_PHRASES = [
  "if you", "for people who", "in your situation", "depending on",
  "in industries where", "for those who", "given that", "assuming",
  "in your case", "for your specific", "varies by", "in some workplaces",
  "not all", "in certain situations", "context-dependent", "your specific",
  "your particular", "based on your",
];

const VAGUE_ANCHORING_PHRASES = [
  "for most people", "in many cases", "generally speaking", "for most",
  "in most situations", "for many", "in typical cases", "usually works",
];

const STRONG_EVIDENCE_PHRASES = [
  "according to", "research shows", "studies suggest", "study shows",
  "data indicates", "evidence suggests", "for example", "for instance",
  "published", "peer-reviewed", "statistics show", "survey found",
  "reported by", "findings show", "researchers found", "meta-analysis",
  "experts say", "scientists found", "based on data", "clinical trial",
  "a study", "the research", "documented", "proven in", "cited",
];

const WEAK_EVIDENCE_PHRASES = [
  "many people find", "some people", "often reported", "commonly seen",
  "anecdotally", "in practice", "in my experience", "some experts",
  "many experts", "widely believed", "often said",
];

const LIMITING_PHRASES = [
  "this varies", "it depends", "not always", "may not apply",
  "consult a professional", "seek advice", "talk to a", "speak to a",
  "in your specific context", "results may vary", "this isn't guaranteed",
  "there's no guarantee", "individual results", "not a substitute",
  "consider your situation", "won't work for everyone", "not universal",
  "exceptions exist", "this may not", "your mileage may vary",
];

const UNIVERSAL_PHRASES = [
  "everyone should", "anyone can", "always works", "in any situation",
  "regardless of", "universally", "no matter what", "works for everyone",
  "applies to all", "in every case", "without exception",
];

const SCRIPT_PHRASES = [
  "say something like", "you might say", "tell them", "you could say",
  "say to your", "here's what to say", "the exact words", "phrase it as",
  "words like", "something like", "try saying",
];

const DIRECTIVE_PHRASES = [
  "you should", "you must", "you need to", "make sure to",
  "the first step is", "start by", "begin by", "always do",
  "never do", "the key is to", "the trick is to", "do this",
  "follow these steps", "step 1", "step one",
];

const SENSITIVITY_MULTIPLIERS = { low: 0.7, medium: 1.0, high: 1.3 };

function matchAny(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.filter(p => lower.includes(p.toLowerCase()));
}

function computeERF(text, sensitivity) {
  const breakdown = [];
  let total = 0;

  const absolute = matchAny(text, ABSOLUTE_PHRASES);
  const hedged   = matchAny(text, HEDGED_PHRASES);
  const cl = (absolute.length > 0 && hedged.length === 0) ? 2
           : (hedged.length > 0 && absolute.length === 0) ? 0 : 1;
  total += cl;
  breakdown.push({
    dimension: "Certainty Language", score: cl, max: 2,
    label: ["Well hedged","Moderately certain","Absolute claims"][cl],
    detail: cl === 2 ? `Absolute phrases: ${absolute.slice(0,3).map(p=>`"${p}"`).join(", ")}`
          : cl === 0 ? `Hedged with: ${hedged.slice(0,3).map(p=>`"${p}"`).join(", ")}`
          : "Mix of certain and hedged language",
  });

  const anchored      = matchAny(text, ANCHORING_PHRASES);
  const vagueAnchored = matchAny(text, VAGUE_ANCHORING_PHRASES);
  const ca = anchored.length > 0 ? 0 : vagueAnchored.length > 0 ? 1 : 2;
  total += ca;
  breakdown.push({
    dimension: "Context Anchoring", score: ca, max: 2,
    label: ["Well scoped","Vaguely scoped","No context given"][ca],
    detail: ca === 0 ? `Scoped with: ${anchored.slice(0,2).map(p=>`"${p}"`).join(", ")}`
          : ca === 1 ? `Vague scope only: ${vagueAnchored.slice(0,2).map(p=>`"${p}"`).join(", ")}`
          : "No mention of who this applies to, when, or under what conditions",
  });

  const strongEvid = matchAny(text, STRONG_EVIDENCE_PHRASES);
  const weakEvid   = matchAny(text, WEAK_EVIDENCE_PHRASES);
  const eg = strongEvid.length > 0 ? 0 : weakEvid.length > 0 ? 1 : 2;
  total += eg;
  breakdown.push({
    dimension: "Evidence Grounding", score: eg, max: 2,
    label: ["Evidence cited","Weak evidence only","No evidence cited"][eg],
    detail: eg === 0 ? `Supported by: ${strongEvid.slice(0,2).map(p=>`"${p}"`).join(", ")}`
          : eg === 1 ? `Weak signals: ${weakEvid.slice(0,2).map(p=>`"${p}"`).join(", ")}`
          : "No data, sources, or examples — claims asserted as fact",
  });

  const limiting  = matchAny(text, LIMITING_PHRASES);
  const universal = matchAny(text, UNIVERSAL_PHRASES);
  const ur = limiting.length > 0 ? 0 : universal.length > 0 ? 2 : 1;
  total += ur;
  breakdown.push({
    dimension: "Universality Risk", score: ur, max: 2,
    label: ["Scope limited","Implied universal","Explicitly universal"][ur],
    detail: ur === 0 ? `Limits scope with: ${limiting.slice(0,2).map(p=>`"${p}"`).join(", ")}`
          : ur === 2 ? `Universal framing: ${universal.slice(0,2).map(p=>`"${p}"`).join(", ")}`
          : "No limiting conditions — implies advice applies to everyone in all situations",
  });

  const scripts    = matchAny(text, SCRIPT_PHRASES);
  const directives = matchAny(text, DIRECTIVE_PHRASES);
  const as_ = scripts.length > 0 ? 2 : directives.length > 0 ? 1 : 0;
  total += as_;
  breakdown.push({
    dimension: "Action Specificity Risk", score: as_, max: 2,
    label: ["Abstract principles","Specific directives","Word-for-word scripts"][as_],
    detail: as_ === 2 ? `Scripts: ${scripts.slice(0,2).map(p=>`"${p}"`).join(", ")}`
          : as_ === 1 ? `Directives: ${directives.slice(0,2).map(p=>`"${p}"`).join(", ")}`
          : "Stays at the level of principles — requires reader judgment",
  });

  const multiplier = SENSITIVITY_MULTIPLIERS[sensitivity] || 1.0;
  const score = Math.min(10, Math.max(0, Math.round(total * multiplier)));
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

function dimColor(s) { return s === 0 ? "#43a047" : s === 1 ? "#fb8c00" : "#e53935"; }

function createBadge(erfResult) {
  const { score, breakdown } = erfResult;
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
  turnEl.after(createBadge(computeERF(text, sensitivity)));
}

function removeAllBadges() {
  document.querySelectorAll(".cl-wrapper").forEach(el => el.remove());
  document.querySelectorAll(`[${BADGE_ATTR}]`).forEach(el => el.removeAttribute(BADGE_ATTR));
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
