/**
 * Chat Lens — bundled content script
 * Inlines scoring-engine + ui-component + content-script into one file
 * so it can be registered directly in manifest.json (no ES module loader needed).
 *
 * Runs on chatgpt.com / chat.openai.com.
 */

// ─── scoring-engine.js ────────────────────────────────────────────────────────

const CONFIDENCE_PHRASES = [
  "this is a strong idea",
  "this makes sense",
  "you're onto something",
  "you are onto something",
  "great idea",
  "excellent point",
  "absolutely",
  "brilliant",
  "fantastic",
  "spot on",
  "exactly right",
  "totally agree",
  "perfect approach",
];

const COMMITMENT_PHRASES = [
  "you should",
  "this could be a product",
  "this is a good path forward",
  "you need to",
  "i recommend",
  "the best approach",
  "this will work",
  "this is the way",
  "go ahead and",
  "definitely do",
  "without a doubt",
];

const CRITIQUE_MARKERS = [
  "however",
  "on the other hand",
  "limitation",
  "uncertain",
  "but",
  "although",
  "caveat",
  "concern",
  "drawback",
  "risk",
  "challenge",
  "consideration",
  "not necessarily",
  "it depends",
  "alternatively",
  "downside",
  "trade-off",
  "tradeoff",
];

const SENSITIVITY_WEIGHTS = {
  low:    { confidence: 1, commitment: 1.5, noCritique: 1, repetition: 1.5 },
  medium: { confidence: 2, commitment: 3,   noCritique: 2, repetition: 3   },
  high:   { confidence: 3, commitment: 4,   noCritique: 3, repetition: 4   },
};

function matchPhrases(text, phrases) {
  const lower = text.toLowerCase();
  const matched = [];
  for (const phrase of phrases) {
    if (lower.includes(phrase.toLowerCase())) matched.push(phrase);
  }
  return { count: matched.length, matched };
}

function isCreativeContent(text) {
  const hasNumbers = /\d/.test(text);
  const hasBullets = /^[\s]*[-*\u2022\u2192]|^[\s]*\d+\./m.test(text);
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordsPerLine = lines.length > 0 ? words.length / lines.length : 99;
  if (!hasNumbers && !hasBullets && lines.length >= 4 && wordsPerLine < 10) return true;
  return /\b(poem|poetry|verse|stanza|haiku|sonnet|ballad|ode)\b/i.test(text);
}

function findRepeatedKeywords(text) {
  const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "it", "this", "that", "you", "your",
    "i", "we", "can", "will", "be", "are", "was", "were", "have", "has",
    "had", "do", "does", "did", "not", "as", "if", "so", "up", "out",
    "about", "which", "when", "what", "how", "also", "just", "more", "very",
    "would", "could", "should", "may", "might", "then", "than", "into",
    "its", "there", "their", "they", "them", "these", "those", "my", "our",
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  const freq = {};
  for (const word of words) freq[word] = (freq[word] || 0) + 1;
  return Object.entries(freq)
    .filter(([, count]) => count >= 3)
    .map(([word]) => word);
}

function computeCAS(text, sensitivity = "medium") {
  const weights = SENSITIVITY_WEIGHTS[sensitivity] ?? SENSITIVITY_WEIGHTS.medium;
  const breakdown = [];
  let raw = 0;

  const { count: confCount, matched: confMatched } = matchPhrases(text, CONFIDENCE_PHRASES);
  if (confCount > 0) {
    const delta = weights.confidence;
    raw += delta;
    breakdown.push({ label: "Confidence phrases detected", delta: +delta, detail: confMatched.slice(0, 3).map((p) => `"${p}"`).join(", ") });
  }

  const { count: commCount, matched: commMatched } = matchPhrases(text, COMMITMENT_PHRASES);
  if (commCount > 0) {
    const delta = weights.commitment;
    raw += delta;
    breakdown.push({ label: "Commitment / directive phrases detected", delta: +delta, detail: commMatched.slice(0, 3).map((p) => `"${p}"`).join(", ") });
  }

  const { count: critiqueCount } = matchPhrases(text, CRITIQUE_MARKERS);
  if (critiqueCount === 0) {
    const delta = -weights.noCritique;
    raw += delta;
    breakdown.push({ label: "No critique or nuance markers found", delta, detail: 'Missing: "however", "limitation", "on the other hand", etc.' });
  }

  const repeated = findRepeatedKeywords(text);
  if (repeated.length > 0) {
    const delta = weights.repetition;
    raw += delta;
    breakdown.push({ label: "Repeated keyword reinforcement", delta: +delta, detail: repeated.slice(0, 5).map((w) => `"${w}"`).join(", ") });
  }

  let score = Math.min(10, Math.max(0, Math.round(raw)));
  if (isCreativeContent(text)) score = Math.min(score, 1);
  return { score, breakdown };
}

// Domain keyword sets
const MEDICAL_KEYWORDS = [
  "symptom", "diagnosis", "medication", "dose", "dosage", "treatment",
  "prescription", "disorder", "disease", "therapy", "psychiatric",
  "psychosis", "psychotic", "mental health", "rotator cuff", "tendon",
  "ligament", "clinical", "clinician", "physician", "psychiatrist",
  "pediatrician", "vyvanse", "adderall", "ritalin", "antidepressant",
  "stimulant", "adhd", "asd", "autism", "ocd", "anxiety disorder",
  "hallucination", "delusion", "differential diagnosis", "rebound",
  "side effect", "cavitation", "joint fluid",
  "kyphosis", "lordosis", "scoliosis", "spinal", "spine", "vertebra",
  "cervical", "lumbar", "thoracic", "disc herniation", "disc bulge",
  "herniated disc", "nerve compression", "nerve impingement", "radiculopathy",
  "traction", "decompression", "physiotherapist", "physiotherapy",
  "chiropractor", "chiropractic", "orthopaedic", "orthopedic",
  "numbness", "tingling", "referred pain", "sciatica", "mri scan",
  // Acute / emergency symptoms
  "chest tightness", "chest pain", "shortness of breath", "trouble breathing",
  "can't breathe", "difficulty breathing", "asthma", "respiratory",
  "dizziness", "dizzy", "faint", "fainting", "palpitation", "cardiac",
  "heart attack", "stroke", "seizure", "unconscious", "anaphylaxis",
  "allergic reaction", "blood pressure", "pulse rate", "oxygen",
];

const FINANCIAL_LEGAL_KEYWORDS = [
  "tax return", "income tax", "tax reporting", "tax deduction",
  "irs ", "canada revenue", "cra tax", "gst number", "hst number",
  "value added tax", "vat number", "vat invoice",
  "gross revenue", "net payout", "1099", "store fees",
  "legal advice", "legal action", "legal matter", "seek legal",
  "lawsuit", "court order", "restraining order",
  "peace bond", "no-contact order", "criminal charge", "attorney",
  "accountant", "corporation", "dividend",
];

// Financial / investment domain — checked before medical to prevent biotech
// stock analysis from triggering "medical content" via words like "clinical"
const FINANCIAL_INVESTMENT_KEYWORDS = [
  "stock", "shares", "ticker", "nasdaq", "nyse", "tsx",
  "institutional investor", "institutional ownership", "portfolio",
  "market cap", "trading volume", "after-hours", "pre-market",
  "closing auction", "block trade", "short interest", "float",
  "vwap", "bid-ask", "options", "puts", "calls", "earnings",
  "quarterly report", "sec filing", "8-k", "s-3",
  "biotech stock", "clinical readout", "fda approval",
  "analyst rating", "price target", "buy rating", "sell rating",
];

// Domestic violence / intimate partner abuse domain
const DOMESTIC_VIOLENCE_KEYWORDS = [
  "domestic violence", "intimate partner", "abusive relationship",
  "coercive control", "abuser", "abusive partner", "abusive husband",
  "abusive wife", "cycle of abuse", "leaving an abusive", "escape abuse",
  "abuse escalates", "physical abuse", "emotional abuse", "verbal abuse",
  "power and control", "safety plan",
];

// Child psychology / parenting domain
const CHILD_PARENTING_KEYWORDS = [
  "parental alienation", "custody", "co-parenting", "child development",
  "child psychology", "child therapist", "developmental stage",
  "adolescent brain", "child's emotional", "loyalty conflict",
  "reunification therapist", "child's well-being", "child's sense",
  "children benefit", "children need", "child psychiatrist",
];

// Unsupported appeals to research (claims research without citing it)
const UNSUPPORTED_RESEARCH_PATTERNS = [
  /\bresearch shows\b/i,
  /\bstudies show\b/i,
  /\bstudies have shown\b/i,
  /\bevidence suggests\b/i,
  /\bdata shows\b/i,
  /\bscience shows\b/i,
  /\bresearch indicates\b/i,
  /\bstudies indicate\b/i,
  // Vague source references — "according to recent reporting" without naming who
  /\baccording to (recent|reports?|reporting|sources?|experts?|analysts?|many)\b/i,
  /\bmany (experts?|analysts?|scientists?|researchers?) (say|believe|argue|suggest|warn)\b/i,
];

// Genuine citations — require a named source, not just a vague claim.
// "according to" alone is too vague ("according to recent reporting" = no real source).
const GENUINE_CITATION_PHRASES = [
  "according to the", "source:", "citation", "published in", "peer-reviewed",
];

const HEDGING_PHRASES = [
  "might", "may ", "could", "perhaps", "possibly", "likely",
  "seems", "appears", "suggests", "it depends", "generally",
  "typically", "in some cases", "depending on", "often",
];

const ABSOLUTE_CLAIM_PATTERNS = [
  /\bis a fact\b/i,
  /\bthe fact is\b/i,
  /\bthat'?s a fact\b/i,
  /\bproven\b/i,
  /\bguaranteed\b/i,
  /\bwithout (any )?doubt\b/i,
  /\bundeniably\b/i,
  /\bobviously\b/i,
  /\byou (are|were) (completely|absolutely|totally) (correct|right)\b/i,
];

const DISCLAIMER_PHRASES = [
  "consult a", "speak with a", "talk to a", "see a doctor",
  "see a physician", "see a psychiatrist", "seek professional",
  "professional advice", "not medical advice", "not a substitute",
  "qualified professional", "licensed professional", "medical professional",
];

// Keep for backwards compat — real evidence check now uses GENUINE_CITATION_PHRASES
const EVIDENCE_PHRASES = GENUINE_CITATION_PHRASES;

const EMOTIONAL_VALIDATION_PHRASES = [
  "you're right",
  "you are right",
  "completely correct",
  "you're not overreacting",
  "you are not overreacting",
  "your suspicions are correct",
  "absolutely right",
  "you're absolutely right",
  "you're correct",
  "you are correct",
  "i completely agree",
  "totally valid",
  "you're not wrong",
];

// Phrases used to track sycophancy across a whole conversation.
// When more than 2 responses in the same conversation contain these,
// a pattern warning is added to subsequent ratings.
const SYCOPHANCY_TRACKER_PHRASES = [
  "that's a great question", "that's an excellent question",
  "great question!", "excellent question!",
  "you're exactly right", "you are exactly right",
  "you've identified a key point", "you have identified a key point",
  "i completely agree with your", "i totally agree with your",
  "you make a strong point", "you make a great point",
  "your opinion showcases", "showcases great insight",
  "you raise a valid point", "great insight",
  "i feel your anguish", "i am sad with you",
  "it's really upsetting to", "it is really upsetting to",
  "while unconventional", "while unorthodox",
  "stem from a genuine desire", "comes from a genuine place",
  "many people share your", "a lot of people feel the same",
  "you've clearly thought", "you have clearly thought",
  "that's a really important", "that's such a good point",
];

// Conversation-level counter — resets on page load.
let conversationSycophancyCount = 0;

/**
 * Detect instructional / procedural content (step-by-step guides, how-tos).
 * For this type, direct confident language is expected — don't penalise lack of hedging.
 */
function isInstructional(text) {
  const lower = text.toLowerCase();
  const numberedSteps = (text.match(/^\s*\d+\.\s+\w/gm) || []).length;
  const hasStepLabels = /\bstep\s+\d+\b/i.test(text);
  const hasToolsList = /\b(tools?\s*(you'?ll\s*need|needed|required)|what\s*you'?ll\s*need|materials?|supplies|equipment)\b/i.test(lower);
  const actionBullets = (text.match(/^\s*[-*]\s+(remove|install|disconnect|connect|pull|push|press|insert|attach|detach|tighten|loosen|replace|check|inspect|clean|apply|spray|pry|lift|slide|snap)\b/gim) || []).length;
  return (numberedSteps >= 3 || hasStepLabels) && (hasToolsList || actionBullets >= 2 || hasStepLabels);
}

/**
 * Detect philosophical / existential content where citations are not applicable.
 * Questions about meaning, God, ethics, and metaphysics require no evidence to be valid.
 */
function isPhilosophical(text) {
  const lower = text.toLowerCase();
  const philosophers = [
    "aristotle", "plato", "socrates", "kant", "descartes", "hume", "sartre",
    "nietzsche", "epictetus", "marcus aurelius", "aquinas", "spinoza", "locke",
    "rousseau", "voltaire", "camus", "wittgenstein", "kierkegaard",
  ];
  const philTerms = [
    "stoicism", "existentialism", "eudaimonia", "theism", "atheism", "agnosticism",
    "nihilism", "utilitarianism", "consequentialism", "metaphysics", "epistemology",
    "free will", "moral philosophy", "philosophy of", "philosophical",
  ];
  const metaFraming = [
    "no one can prove", "no agreed answer", "people disagree", "depends on your worldview",
    "no definitive proof", "beyond human understanding", "oldest question",
    "smart, thoughtful people", "cannot be settled", "purely philosophical",
    "different people, cultures", "meaning of life", "does god exist",
  ];
  const philHits = philosophers.filter((n) => lower.includes(n)).length
                 + philTerms.filter((t) => lower.includes(t)).length;
  const metaHits = metaFraming.filter((p) => lower.includes(p)).length;
  return philHits >= 2 || metaHits >= 1;
}

/**
 * Detect specific part numbers / model codes / dollar amounts that AI may hallucinate.
 */
function hasSpecificTechnicalClaims(text) {
  return /\b[A-Z]{2,}\d{3,}[-][A-Z0-9]{3,}\b/.test(text) ||   // part numbers e.g. 80501-ZH00A
         /\$\s*\d{2,}/.test(text);                              // specific dollar amounts
}

// Relationship conflict domain — personal disputes where the AI only hears one side.
// Single combined list with threshold >= 2 hits. Gemini often never says "your boyfriend"
// — it uses "him", "his friends", "his behavior" — so the old two-list approach always missed.
const RELATIONSHIP_KEYWORDS = [
  // Strong conflict markers (rarely appear outside relationship context)
  "gaslighting", "ultimatum", "red flag", "red flags", "toxic",
  "deserve better", "cheating", "affair", "controlling", "jealous", "jealousy",
  "breakup", "break up", "breaking up", "leave him", "leave her",
  // Relationship subject indicators
  "your boyfriend", "your girlfriend", "your husband", "your wife", "your partner",
  "your spouse", "your ex", "your fiance", "your fiancee",
  "your relationship", "the relationship",
  // Pronoun patterns — AI echoing the described person
  "he keeps", "she keeps", "he always", "she always",
  "he never", "she never", "he won't", "she won't",
  "his friends", "her friends",
  "his social life", "her social life",
  "his behavior", "her behavior", "his behaviour", "her behaviour",
  "his priorities", "her priorities",
  "going out with his", "going out with her",
  "staying out late", "coming home late",
  // Conflict/tension language
  "selfish", "disrespect", "disrespectful",
  "argument", "arguing", "disagreement",
  "ignoring you", "ignores you", "feeling neglected", "feeling unheard",
  "hurting you", "hurt you",
  // AI validation phrases
  "your feelings are valid", "i'm here for you", "i hear you",
  "that must be hard", "that sounds frustrating", "that must be frustrating",
  "that sounds difficult", "that sounds challenging",
  // AI relationship-advice phrases
  "set boundaries", "set a boundary", "setting boundaries", "your boundaries",
  "open communication", "communicate openly", "communicate with your",
  "healthy relationship", "healthy relationships",
  "emotional security", "emotional needs",
  "quality time", "time together",
];

function detectDomain(text) {
  const lower = text.toLowerCase();
  // DV first — specific terms, often overlaps with medical language
  const dvHits = DOMESTIC_VIOLENCE_KEYWORDS.filter((k) => lower.includes(k));
  if (dvHits.length >= 1) return { domain: "domestic-violence", riskLevel: 3 };
  // Investment/financial before medical — biotech stock analysis contains
  // words like "clinical" that would otherwise trigger the medical domain
  const investHits = FINANCIAL_INVESTMENT_KEYWORDS.filter((k) => lower.includes(k));
  if (investHits.length >= 2) return { domain: "financial-investment", riskLevel: 2 };
  const medHits = MEDICAL_KEYWORDS.filter((k) => lower.includes(k));
  if (medHits.length >= 2) return { domain: "medical", riskLevel: 3 };
  const parentingHits = CHILD_PARENTING_KEYWORDS.filter((k) => lower.includes(k));
  if (parentingHits.length >= 2) return { domain: "parenting", riskLevel: 2 };
  const legalHits = FINANCIAL_LEGAL_KEYWORDS.filter((k) => lower.includes(k));
  if (legalHits.length >= 2) return { domain: "financial-legal", riskLevel: 2 };
  // Relationship conflict — >= 2 hits from combined list avoids false positives
  // while catching Gemini responses that never say "your boyfriend" but do use
  // "his friends", "his behavior", "gaslighting", "ultimatum", etc.
  const relHits = RELATIONSHIP_KEYWORDS.filter((k) => lower.includes(k));
  if (relHits.length >= 2) return { domain: "relationship-conflict", riskLevel: 1 };
  if (isInstructional(text)) return { domain: "instructional", riskLevel: 1 };
  return { domain: "general", riskLevel: 0 };
}

function computeEpistemicSignals(text, domainInfo) {
  const lower = text.toLowerCase();
  const signals = [];
  const instructional = domainInfo && domainInfo.domain === "instructional";
  const philosophical = isPhilosophical(text);

  const hedgeMatches = HEDGING_PHRASES.filter((p) => lower.includes(p));
  if (hedgeMatches.length >= 2) {
    signals.push({
      positive: true,
      label: "Doesn't claim more than it knows",
      detail: `Words like "${hedgeMatches.slice(0, 3).map((p) => p.trim()).join('", "')}" show the AI is saying "this might be true" rather than "this is definitely true." That's a good sign — it means the response isn't pretending to know things it can't be certain about.`,
    });
  }

  const analyticalPhrases = [
    "this could", "this may", "one possibility", "another factor",
    "it depends", "consider whether", "suggests", "indicates",
    "worth exploring", "this might",
  ];
  if (analyticalPhrases.some((p) => lower.includes(p))) {
    signals.push({
      positive: true,
      label: "Reasoning and interpretation",
      detail: "Response uses analytical language rather than hard factual claims",
    });
  }

  const isGeneralDomain = !domainInfo || domainInfo.riskLevel === 0;

  // Absolute claims — skip for instructional and philosophical content.
  // "Written with confidence" is only meaningful in risk domains (medical, legal, financial);
  // on general content, confident factual descriptions are expected and fine.
  if (!instructional && !philosophical) {
    const hasAbsoluteClaim = ABSOLUTE_CLAIM_PATTERNS.some((re) => re.test(text));
    if (hasAbsoluteClaim) {
      signals.push({
        positive: false,
        label: "States things as absolute facts",
        detail: "Contains language that asserts certainty without qualification",
      });
    } else if (hedgeMatches.length === 0 && !isGeneralDomain) {
      signals.push({
        positive: false,
        label: "Written with confidence — no uncertainty markers",
        detail: "The response doesn't use words like \"might\", \"may\", or \"possibly\". That's fine for opinions or instructions, but worth noting if this covers facts you plan to act on.",
      });
    }
  }

  // "No evidence" on general-domain content is only useful when the response
  // contains advice/recommendations the user might act on. For basic factual
  // descriptions ("what are boogers made of", "where does milk come from") it
  // produces false positives — those claims don't need citations.
  const hasAdviceLanguage = [
    "you should", "i recommend", "make sure", "the best way",
    "here are some tips", "steps to", "strategies for",
    "it's important to", "you need to", "you must",
  ].some((p) => lower.includes(p));

  // Unsupported research claim: "Research shows X" with no actual source
  const hasUnsupportedResearchClaim = UNSUPPORTED_RESEARCH_PATTERNS.some((re) => re.test(text));
  const hasGenuineCitation = GENUINE_CITATION_PHRASES.some((p) => lower.includes(p));
  if (hasUnsupportedResearchClaim && !hasGenuineCitation) {
    signals.push({
      positive: false,
      label: "Claims research support without a source",
      detail: "The response refers to research, experts, or reporting without naming a specific source — for example \"research shows\" or \"according to recent reporting\". These phrases can sound authoritative while pointing to nothing verifiable.",
    });
  } else if (!hasGenuineCitation && !philosophical && (!isGeneralDomain || hasAdviceLanguage)) {
    signals.push({
      positive: false,
      label: "No evidence — stated as fact",
      detail: "No data, citations, or acknowledgement of uncertainty",
    });
  }

  // Speculative business prediction — AI estimating probability of success for unproven ideas.
  // Narrow phrase list to avoid firing on normal business advice.
  const SPECULATIVE_PREDICTION_PHRASES = [
    "success odds", "odds of success", "chance of success", "chances of success",
    "likelihood of success", "near-zero chance", "probability of success",
    "likely to succeed", "likely to fail", "succeed or fail",
  ];
  const hasSpeculativePrediction = SPECULATIVE_PREDICTION_PHRASES.some((p) => lower.includes(p));
  if (hasSpeculativePrediction && !instructional) {
    signals.push({
      positive: false,
      label: "Speculative success prediction",
      detail: "The AI is estimating the odds of success for an unproven idea. These projections are guesses, not forecasts based on real data — treat them as one perspective, not a reliable prediction.",
    });
  }

  // Instructional-specific: flag AI-generated part numbers / dollar amounts
  if (instructional && hasSpecificTechnicalClaims(text)) {
    signals.push({
      positive: false,
      label: "Contains specific part numbers or figures",
      detail: "AI-generated part numbers, model codes, and prices are frequently inaccurate. Verify any specific numbers against an official parts catalogue or manufacturer source before purchasing.",
    });
  }

  const hasDisclaimer = DISCLAIMER_PHRASES.some((p) => lower.includes(p));
  const isEmotional = EMOTIONAL_VALIDATION_PHRASES.some((p) => lower.includes(p));
  return { signals, hasDisclaimer, isEmotional };
}

function computeVerdictLevel(text, casScore, domainInfo, epistemicInfo) {
  if (isCreativeContent(text)) return { level: 0, reason: "creative" };

  const { domain, riskLevel } = domainInfo;
  const { signals, hasDisclaimer, isEmotional } = epistemicInfo;
  const negCount = signals.filter((s) => !s.positive).length;
  const posCount = signals.filter((s) => s.positive).length;

  // Relationship conflict — flag immediately: AI only hears one side
  if (domain === "relationship-conflict") return { level: 1, reason: "relationship-conflict" };

  if (isEmotional) return { level: 1, reason: "emotional-validation" };

  // Instructional content — direct language is expected, cap at yellow
  if (domain === "instructional") {
    return { level: 1, reason: "instructional" };
  }

  if (riskLevel >= 3) {
    if (domain === "domestic-violence") return { level: 1, reason: "domestic-violence" };
    if (!hasDisclaimer && negCount >= 2 && posCount === 0) return { level: 2, reason: "medical-no-hedge" };
    if (hasDisclaimer) return { level: 1, reason: "medical-with-disclaimer" };
    return { level: 1, reason: "medical-domain" };
  }

  if (riskLevel >= 2) {
    if (domain === "parenting" && !hasDisclaimer) return { level: 1, reason: "parenting-domain" };
    if (domain === "financial-investment") return { level: 1, reason: "financial-investment" };
    if (domain === "financial-legal" && !hasDisclaimer) {
      return { level: negCount >= 2 ? 2 : 1, reason: "financial-legal-domain" };
    }
  }

  // For general content, 🔴 requires either 3+ negative signals OR a detected
  // absolute claim pattern — "no hedging + no citations" alone is not enough
  // to warrant red (it's normal for strategy/opinion/advice responses).
  const hasDetectedAbsoluteClaim = signals.some(
    (s) => !s.positive && s.label === "States things as absolute facts"
  );
  if (negCount >= 3 || (negCount >= 2 && hasDetectedAbsoluteClaim)) return { level: 2, reason: "signals" };
  if (negCount >= 1 || casScore >= 5) return { level: 1, reason: "signals" };
  return { level: 0, reason: "signals" };
}

const VERDICT_COPY = [
  {
    emoji: "🟢",
    title: "Looks reasonable to trust",
    trust: "This response uses careful language and doesn't overstate its confidence.",
    action: "Likely fine for everyday decisions. For major choices, still good to double-check.",
    note: "Note: Chat Lens scores how confidently a response is written — not whether the facts are correct. Even a well-rated response may contain details that sound plausible but were made up. For anything factual that matters, verify it independently.",
  },
  {
    emoji: "🟡",
    title: "Worth a second look",
    trust: "Some claims here could use independent verification before you act on them.",
    action: "For small decisions, okay to proceed with caution. For anything important, verify with another source or a real expert.",
    note: "Note: AI responses sometimes include specific details — names, statistics, or quotes — that sound authoritative but may be incorrect. If a specific fact matters to you, verify it independently.",
  },
  {
    emoji: "🔴",
    title: "Get a second opinion",
    trust: "This response states things confidently but the evidence behind them is unclear.",
    action: "For anything significant — money, health, legal, or relationships — consult a qualified human expert before acting.",
    note: "Note: AI responses sometimes include specific details — names, statistics, or quotes — that sound authoritative but may be incorrect. If a specific fact matters to you, verify it independently.",
  },
];

const VERDICT_OVERRIDES = {
  "emotional-validation": {
    emoji: "🟡",
    title: "Validating without balanced perspective",
    trust: "This response strongly agrees with your view but offers limited independent analysis.",
    action: "Consider whether a neutral second perspective would be useful before acting on this.",
    note: null,
  },
  "medical-domain": {
    emoji: "🟡",
    title: "Medical content — verify with a professional",
    trust: "This response covers health topics but is not a substitute for professional medical advice.",
    action: "Consult a qualified clinician before making any health decisions based on this.",
    note: "Note: AI responses sometimes include specific details — names, statistics, or quotes — that sound authoritative but may be incorrect. If a specific fact matters to you, verify it independently.",
  },
  "medical-with-disclaimer": {
    emoji: "🟡",
    title: "Medical content — verify with a professional",
    trust: "This response covers health topics but is not a substitute for professional medical advice.",
    action: "Consult a qualified clinician before making any health decisions based on this.",
    note: "Note: AI responses sometimes include specific details — names, statistics, or quotes — that sound authoritative but may be incorrect. If a specific fact matters to you, verify it independently.",
  },
  "medical-no-hedge": {
    emoji: "🔴",
    title: "Medical content — consult a professional",
    trust: "This response makes specific medical or psychiatric claims without verified sources or professional caveats.",
    action: "Do not act on health or psychiatric information without consulting a licensed professional.",
    note: "Medical AI responses can sound authoritative while being incomplete or incorrect for your specific situation.",
  },
  "financial-legal-domain": {
    emoji: "🟡",
    title: "Financial or legal content — verify before acting",
    trust: "This response covers financial or legal topics that may vary by jurisdiction and situation.",
    action: "Verify specific figures and rules with a qualified accountant, lawyer, or official source before acting.",
    note: "Note: AI responses sometimes include specific details — names, statistics, or quotes — that sound authoritative but may be incorrect. If a specific fact matters to you, verify it independently.",
  },
  "domestic-violence": {
    emoji: "🟡",
    title: "Sensitive topic — safety decisions matter here",
    trust: "This response discusses abuse or relationship safety. General advice may not apply to your specific situation.",
    action: "For safety planning or legal steps, contact a domestic violence support service or trained advocate in your area.",
    note: null,
  },
  "parenting-domain": {
    emoji: "🟡",
    title: "Parenting advice — every child and situation is different",
    trust: "This response gives general guidance on child development or parenting, but children vary widely in their needs and responses.",
    action: "For significant concerns about your child's wellbeing, a family therapist or child psychologist can give advice tailored to your situation.",
    note: "Note: AI responses sometimes include specific details — names, statistics, or quotes — that sound authoritative but may be incorrect. If a specific fact matters to you, verify it independently.",
  },
  "financial-investment": {
    emoji: "🟡",
    title: "Financial content — not investment advice",
    trust: "This response discusses stocks, trading, or investing. AI explanations can be useful for general understanding but don't account for your specific situation or current market conditions.",
    action: "Do not make investment decisions based on AI analysis alone. Consult a licensed financial advisor or do your own independent research.",
    note: "Note: AI responses sometimes include specific details — names, statistics, or quotes — that sound authoritative but may be incorrect. If a specific fact matters to you, verify it independently.",
  },
  "relationship-conflict": {
    emoji: "🟡",
    title: "One-sided perspective — consider the full picture",
    trust: "This response is based only on one account of events. The AI has no access to the other person's side of the story.",
    action: "Before making significant relationship decisions, speak with a counsellor or someone who knows the full situation — not just an AI that only hears your side.",
    note: "Note: AI responses in personal conflicts can validate your perspective and reinforce assumptions without questioning them. Repeated sycophantic validation in a conversation can distort your perception of a situation over time.",
  },
  "instructional": {
    emoji: "🟡",
    title: "Instructions — verify before following",
    trust: "AI instructions are generally a useful starting point, but may not match your exact model, year, or configuration.",
    action: "For critical repairs, cross-check with an official manual or a qualified technician before proceeding.",
    note: null,
  },
};

function computeChatLens(text, sensitivity = "medium") {
  const lower = text.toLowerCase();
  const { score: casScore } = computeCAS(text, sensitivity);
  const domainInfo = detectDomain(text);
  const epistemicInfo = computeEpistemicSignals(text, domainInfo);

  // Conversation-level sycophancy tracking.
  // Count this response if it contains sycophantic phrases, then warn
  // on any response once the threshold (> 2 responses) is crossed.
  const hasSycophancy = SYCOPHANCY_TRACKER_PHRASES.some((p) => lower.includes(p));
  if (hasSycophancy) conversationSycophancyCount++;
  if (conversationSycophancyCount > 2) {
    epistemicInfo.signals.push({
      positive: false,
      label: "Repeated flattery detected in this conversation",
      detail: `This AI has used flattering or over-validating language in ${conversationSycophancyCount} responses. Across a conversation, this pattern can subtly reinforce your views rather than offering honest, balanced assessment. Consider whether the responses are telling you what you want to hear.`,
    });
  }

  const { level, reason } = computeVerdictLevel(text, casScore, domainInfo, epistemicInfo);
  const verdict = VERDICT_OVERRIDES[reason] || VERDICT_COPY[level];
  return { verdict, signals: epistemicInfo.signals, casScore };
}

// ─── ui-component.js ─────────────────────────────────────────────────────────

const BADGE_ATTR = "data-aera-lens-badge";
const LENS_STYLE_ID = "aera-lens-styles";

function injectLensStyles() {
  if (document.getElementById(LENS_STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = LENS_STYLE_ID;
  s.textContent = `
    .aera-lens-wrapper {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-size: 13px !important;
      line-height: 1.5 !important;
      border-radius: 10px !important;
      margin: 10px 0 !important;
      overflow: hidden !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.1), 0 2px 12px rgba(0,0,0,0.08) !important;
      background: #ffffff !important;
      max-width: 700px !important;
      border: none !important;
      display: block !important;
    }
    .aera-lens-header {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      width: 100% !important;
      padding: 10px 14px !important;
      border: none !important;
      border-bottom: 2px solid transparent !important;
      cursor: pointer !important;
      text-align: left !important;
      font-family: inherit !important;
      font-size: 13px !important;
      background: #f9fafb !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      outline: none !important;
    }
    .aera-lens-header[data-level="0"] { background: #f0fdf4 !important; border-bottom-color: #22c55e !important; }
    .aera-lens-header[data-level="1"] { background: #fffbeb !important; border-bottom-color: #f59e0b !important; }
    .aera-lens-header[data-level="2"] { background: #fff1f2 !important; border-bottom-color: #ef4444 !important; }
    .aera-lens-emoji { font-size: 16px !important; flex-shrink: 0 !important; line-height: 1 !important; }
    .aera-lens-title {
      font-weight: 600 !important; font-size: 13px !important; flex: 1 !important;
      color: #111827 !important; display: block !important;
    }
    .aera-lens-toggle { font-size: 11px !important; color: #9ca3af !important; flex-shrink: 0 !important; }
    .aera-lens-body { padding: 12px 14px !important; background: #ffffff !important; display: block !important; }
    .aera-lens-body[hidden] { display: none !important; }
    .aera-lens-trust {
      display: block !important; font-size: 13px !important; color: #374151 !important;
      margin: 0 0 8px !important; padding: 0 !important;
    }
    .aera-lens-action {
      display: block !important; font-size: 13px !important; color: #374151 !important;
      margin: 0 0 8px !important; padding: 0 !important;
    }
    .aera-lens-trust strong, .aera-lens-action strong {
      display: inline !important; color: #111827 !important; font-weight: 600 !important;
    }
    .aera-lens-note {
      display: block !important; font-size: 12px !important; color: #6b7280 !important;
      background: #f9fafb !important; border-radius: 6px !important;
      padding: 8px 10px !important; margin: 4px 0 10px !important;
      border-left: 3px solid #e5e7eb !important;
    }
    .aera-lens-why-title {
      display: block !important; font-size: 10px !important; font-weight: 700 !important;
      text-transform: uppercase !important; letter-spacing: 0.06em !important;
      color: #9ca3af !important; margin: 10px 0 6px !important; padding: 0 !important;
    }
    .aera-lens-signals {
      list-style: none !important; list-style-type: none !important;
      padding: 0 !important; margin: 0 0 10px !important;
      display: flex !important; flex-direction: column !important; gap: 5px !important;
    }
    .aera-lens-signal {
      display: flex !important; align-items: flex-start !important; gap: 8px !important;
      padding: 7px 10px !important; border-radius: 6px !important; font-size: 12px !important;
      list-style: none !important; margin: 0 !important;
    }
    .aera-lens-signal--pos { background: #f0fdf4 !important; border: 1px solid #bbf7d0 !important; }
    .aera-lens-signal--neg { background: #fff1f2 !important; border: 1px solid #fecdd3 !important; }
    .aera-lens-signal-icon {
      flex-shrink: 0 !important; font-size: 14px !important;
      margin-top: 1px !important; display: block !important;
    }
    .aera-lens-signal-body {
      display: flex !important; flex-direction: column !important;
      gap: 3px !important; flex: 1 !important;
    }
    .aera-lens-signal-body strong {
      display: block !important; font-weight: 600 !important;
      color: #111827 !important; font-size: 12px !important; font-style: normal !important;
    }
    .aera-lens-signal-body em {
      display: block !important; font-style: normal !important;
      color: #6b7280 !important; font-size: 11px !important; font-weight: normal !important;
    }
    .aera-lens-footer {
      display: block !important; font-size: 11px !important; font-style: italic !important;
      color: #1a73e8 !important; margin: 8px 0 0 !important; padding: 0 !important;
    }
  `;
  document.head.appendChild(s);
}

function createChatLensElement(result) {
  const { verdict, signals } = result;
  // Derive level from emoji for header colour coding
  const level = verdict.emoji === "🟢" ? 0 : verdict.emoji === "🟡" ? 1 : 2;

  const wrapper = document.createElement("div");
  wrapper.className = "aera-lens-wrapper";

  const header = document.createElement("button");
  header.className = "aera-lens-header";
  header.setAttribute("aria-expanded", "false");
  header.setAttribute("data-level", String(level));
  header.innerHTML = `
    <span class="aera-lens-emoji" aria-hidden="true">${verdict.emoji}</span>
    <span class="aera-lens-title">${verdict.title}</span>
    <span class="aera-lens-toggle" aria-hidden="true">▾</span>
  `;

  const body = document.createElement("div");
  body.className = "aera-lens-body";
  body.setAttribute("aria-hidden", "true");
  body.hidden = true;

  const trustEl = document.createElement("p");
  trustEl.className = "aera-lens-trust";
  trustEl.innerHTML = `<strong>Can you trust this?</strong> ${verdict.trust}`;

  const actionEl = document.createElement("p");
  actionEl.className = "aera-lens-action";
  actionEl.innerHTML = `<strong>Should you act on this?</strong> ${verdict.action}`;

  body.appendChild(trustEl);
  body.appendChild(actionEl);

  if (verdict.note) {
    const noteEl = document.createElement("p");
    noteEl.className = "aera-lens-note";
    noteEl.textContent = verdict.note;
    body.appendChild(noteEl);
  }

  if (signals.length > 0) {
    const whyTitle = document.createElement("p");
    whyTitle.className = "aera-lens-why-title";
    whyTitle.textContent = "Why this rating:";
    body.appendChild(whyTitle);

    const list = document.createElement("ul");
    list.className = "aera-lens-signals";

    for (const sig of signals) {
      const li = document.createElement("li");
      li.className = `aera-lens-signal ${sig.positive ? "aera-lens-signal--pos" : "aera-lens-signal--neg"}`;
      li.innerHTML = `
        <span class="aera-lens-signal-icon" aria-hidden="true">${sig.positive ? "✔️" : "⚠️"}</span>
        <span class="aera-lens-signal-body">
          <strong>${sig.label}</strong>
          <em>${sig.detail}</em>
        </span>
      `;
      list.appendChild(li);
    }

    body.appendChild(list);
  }

  const footer = document.createElement("p");
  footer.className = "aera-lens-footer";
  footer.textContent = "Chat Lens — epistemic risk detector";
  body.appendChild(footer);

  header.addEventListener("click", () => {
    const expanded = header.getAttribute("aria-expanded") === "true";
    header.setAttribute("aria-expanded", String(!expanded));
    body.hidden = expanded;
    body.setAttribute("aria-hidden", String(expanded));
    const toggle = header.querySelector(".aera-lens-toggle");
    if (toggle) toggle.textContent = expanded ? "▾" : "▴";
  });

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  return wrapper;
}

function injectBadge(messageEl, text, sensitivity) {
  if (messageEl.hasAttribute(BADGE_ATTR)) return;
  messageEl.setAttribute(BADGE_ATTR, "true");
  const result = computeChatLens(text, sensitivity);
  const panelEl = createChatLensElement(result);
  // On Gemini, append inside the response element so the widget is visually
  // attached to the response above, not floating between messages.
  if (PLATFORM && PLATFORM.platform === "gemini") {
    messageEl.appendChild(panelEl);
  } else {
    messageEl.after(panelEl);
  }
}

function removeAllBadges() {
  document.querySelectorAll(".aera-lens-wrapper").forEach((el) => el.remove());
  document.querySelectorAll(`[${BADGE_ATTR}]`).forEach((el) =>
    el.removeAttribute(BADGE_ATTR)
  );
}

// ─── content-script.js ───────────────────────────────────────────────────────

let enabled = true;
let sensitivity = "medium";
let observer = null;

function loadSettings(cb) {
  chrome.storage.sync.get(
    { aeraLens_enabled: true, aeraLens_sensitivity: "medium" },
    (items) => {
      enabled = items.aeraLens_enabled;
      sensitivity = items.aeraLens_sensitivity;
      if (cb) cb();
    }
  );
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.aeraLens_enabled !== undefined) {
    enabled = changes.aeraLens_enabled.newValue;
    if (!enabled) {
      removeAllBadges();
    } else {
      scanExistingMessages();
    }
  }
  if (changes.aeraLens_sensitivity !== undefined) {
    sensitivity = changes.aeraLens_sensitivity.newValue;
    removeAllBadges();
    scanExistingMessages();
  }
});

// ─── Platform detection ───────────────────────────────────────────────────────

function getPlatformConfig() {
  const host = location.hostname;
  if (host === "chatgpt.com" || host === "chat.openai.com") {
    return {
      platform: "chatgpt",
      turnSelector: '[data-message-author-role="assistant"]',
      proseSelector: ".markdown, .prose, [class*='markdown'], [class*='prose']",
    };
  }
  if (host === "gemini.google.com") {
    return {
      platform: "gemini",
      // model-response is Gemini's custom element wrapping each AI reply
      turnSelector: "model-response",
      // Gemini nests content inside message-content → .markdown
      proseSelector: "message-content, .response-container-content, .markdown, [class*='response-content']",
    };
  }
  return null;
}

const PLATFORM = getPlatformConfig();
const TURN_SELECTOR = PLATFORM ? PLATFORM.turnSelector : '[data-message-author-role="assistant"]';
const PROSE_SELECTOR = PLATFORM ? PLATFORM.proseSelector : ".markdown, .prose, [class*='markdown'], [class*='prose']";

function extractText(turnEl) {
  const prose = turnEl.querySelector(PROSE_SELECTOR);
  return (prose ?? turnEl).innerText ?? "";
}

function processTurn(turnEl) {
  if (!enabled) return;
  const text = extractText(turnEl);
  if (text.trim().length < 20) return;
  injectBadge(turnEl, text, sensitivity);
}

function scanExistingMessages() {
  document.querySelectorAll(TURN_SELECTOR).forEach(processTurn);
}

function startObserver() {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    if (!enabled) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.(TURN_SELECTOR)) {
          processTurn(node);
          continue;
        }
        node.querySelectorAll?.(TURN_SELECTOR).forEach(processTurn);
      }

      if (mutation.type === "characterData" || mutation.type === "childList") {
        const target = mutation.target instanceof HTMLElement
          ? mutation.target
          : mutation.target.parentElement;
        if (!target) continue;

        const turn = target.closest(TURN_SELECTOR);
        if (turn) {
          clearTimeout(turn._aeraLensTimer);
          turn._aeraLensTimer = setTimeout(() => {
            const existing = turn.nextElementSibling;
            if (existing?.classList.contains("aera-lens-wrapper")) {
              existing.remove();
              turn.removeAttribute("data-aera-lens-badge");
            }
            processTurn(turn);
          }, 800);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function init() {
  if (!PLATFORM) return; // unsupported site
  injectLensStyles();
  loadSettings(() => {
    scanExistingMessages();
    startObserver();
  });
}

if (document.body) {
  init();
} else {
  document.addEventListener("DOMContentLoaded", init);
}
