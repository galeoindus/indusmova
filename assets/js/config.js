/* indusmova — site-wide configuration.
 *
 * One place for every constant the rest of the app reads: identity, canonical
 * origin, the content languages we serve, the Wikimedia sources we cite, and
 * the curated lists the home page shows before anything is typed.
 */

export const SITE = {
  name: 'indusmova',
  title: 'indusmova — From question to understanding',
  tagline: 'From question to understanding',
  version: '5.7.0',
  // The canonical origin. Everything that has to be an absolute URL — canonical
  // links, Open Graph, the sitemap — is built from this and nothing else, so a
  // single edit moves the whole site.
  origin: 'https://indusmova.pages.dev',
  repo: 'https://github.com/galeoindus/indusmova',
  description:
    'indusmova is a Wikimedia knowledge research and discovery platform. Ask a question or open a topic and get a direct answer, the key points, the facts from the infobox and the sources behind them.',
  ogDescription:
    'Understand the question. Research the sources. Filter the evidence. Explain the answer. Show the sources.',
  locale: 'en_IN',
  localeAlt: 'hi_IN',
};

/* Content languages offered in the header. The first is the default. */
export const CONTENT_LANGS = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'ur', label: 'Urdu', native: 'اردو' },
  { code: 'sa', label: 'Sanskrit', native: 'संस्कृतम्' },
];

/* Interface languages (UI chrome only). */
export const UI_LANGS = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिन्दी', short: 'हिं' },
];

export const CATEGORIES = [
  { id: 'science', label: 'Science & Technology', query: 'science and technology', icon: 'flask' },
  { id: 'history', label: 'History', query: 'history', icon: 'book' },
  { id: 'geography', label: 'Geography', query: 'geography', icon: 'globe' },
  { id: 'nature', label: 'Nature & Environment', query: 'natural environment', icon: 'leaf' },
  { id: 'space', label: 'Space & Astronomy', query: 'outer space', icon: 'planet' },
  { id: 'culture', label: 'Culture & Society', query: 'culture', icon: 'culture' },
  { id: 'math', label: 'Mathematics', query: 'mathematics', icon: 'math' },
  { id: 'cs', label: 'Computer Science', query: 'computer science', icon: 'chip' },
];

export const QUICK_CHIPS = [
  'Chandrayaan-3',
  'Unified Payments Interface',
  'Indian independence movement',
  'Artificial intelligence',
  'Vedas',
  'Black hole',
  'Ayurveda',
  'Chess',
];

export const EXAMPLE_PROMPTS = [
  'What is a black hole?',
  'Who was Ashoka?',
  'What is photosynthesis?',
];

export const ASK_CHIPS = [
  'When did Chandrayaan-3 land on the Moon?',
  'Who invented the World Wide Web?',
  'What is quantum computing?',
  'Why is the sky blue?',
  'How many states are in India?',
];

/* Answer depth presets. `sentences` caps how much of the article we show,
 * `sections` how many topic blocks we keep. */
export const DEPTHS = {
  quick: { id: 'quick', label: 'Quick answer', sentences: 3, sections: 2 },
  detailed: { id: 'detailed', label: 'Detailed', sentences: 8, sections: 5 },
  deep: { id: 'deep', label: 'Deep dive', sentences: 16, sections: 12 },
};

export const STORAGE_KEYS = {
  bookmarks: 'indusmova:bookmarks',
  history: 'indusmova:history',
  theme: 'indusmova:theme',
  comfort: 'indusmova:comfort',
  uiLang: 'indusmova:uiLang',
  contentLang: 'indusmova:contentLang',
  depth: 'indusmova:depth',
  deepRank: 'indusmova:deepRank',
  mode: 'indusmova:mode',
};
