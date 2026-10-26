/* Galeoindus — the Amigo pack, folded into the page.
 *
 * Every module of galeoindus/Amigo (28 of them) is described here as data
 * and nothing else: a name, the words that point at it, and the shape a
 * reply takes when it wins. There is no list in the interface, no drawer,
 * no badge — the pack works in the background, choosing how an answer is
 * put together.
 *
 * Routing is plain keyword scoring with weights, so it costs nothing per
 * turn and runs entirely on the device.
 */

export const MODULES = [
  { id: 'companion', group: 'care', mode: 'support', weight: 1.1,
    title: 'Companion',
    about: 'Listen first, separate feelings from interpretations, protect the person’s agency.',
    keywords: ['lonely', 'alone', 'sad', 'upset', 'anxious', 'stress', 'stressful', 'friend', 'friendship', 'relationship', 'breakup', 'apolog', 'sorry', 'feel', 'feeling', 'akela', 'udaas', 'dost', 'gussa', 'pareshan'] },

  { id: 'photostudy', group: 'study', mode: 'study', weight: 1.2,
    title: 'Photo study',
    about: 'Transcribe faithfully, solve, then verify independently before explaining.',
    keywords: ['solve', 'homework', 'worksheet', 'question paper', 'assignment', 'sum', 'equation', 'diagram', 'exam', 'revise', 'padhai', 'sawal', 'ganit'] },

  { id: 'research', group: 'research', mode: 'research', weight: 1.0,
    title: 'Research and source checking',
    about: 'Separate observed fact from claim and inference; keep the source attached.',
    keywords: ['research', 'source', 'sources', 'verify', 'evidence', 'cite', 'citation', 'reference', 'is it true', 'fact check', 'khoj', 'sach'] },

  { id: 'analytical-planning', group: 'data', mode: 'plan', weight: 0.9,
    title: 'Analytical planning',
    about: 'Plan before querying: question, metric, hypothesis, test.',
    keywords: ['plan', 'approach', 'framework', 'structure', 'steps', 'how should i', 'where do i start', 'yojana'] },

  { id: 'analysis-validation', group: 'data', mode: 'check', weight: 0.9,
    title: 'Analysis validation',
    about: 'Check counts, nulls, denominators and time windows before believing a number.',
    keywords: ['validate', 'sanity check', 'double check', 'is this correct', 'verify the number', 'cross-check'] },

  { id: 'data-dictionary', group: 'data', mode: 'data', weight: 1.0,
    title: 'Data dictionary',
    about: 'A metric is a definition before it is a number.',
    keywords: ['metric', 'definition', 'define', 'kpi', 'conversion', 'active user', 'dau', 'mau', 'revenue definition'] },

  { id: 'metric-reasoning', group: 'data', mode: 'data', weight: 1.0,
    title: 'Metric reasoning',
    about: 'Report numerator, denominator and rate together; never a rate alone.',
    keywords: ['numerator', 'denominator', 'rate', 'ratio', 'percentage', 'per cent', 'percent', 'share of'] },

  { id: 'root-cause-analysis', group: 'data', mode: 'data', weight: 1.1,
    title: 'Root cause analysis',
    about: 'Quantify the change first, decompose it, then test the hypothesis that would kill the others.',
    keywords: ['why did', 'why has', 'dropped', 'drop', 'decline', 'declined', 'fell', 'spike', 'increase', 'decrease', 'root cause', 'kyun gira', 'kya hua'] },

  { id: 'segmentation-drilldown', group: 'data', mode: 'data', weight: 1.0,
    title: 'Segmentation drilldown',
    about: 'One dimension at a time; rank by share of the delta; check mix shift.',
    keywords: ['segment', 'segmentation', 'cohort', 'breakdown', 'which group', 'which region', 'geo', 'platform', 'version'] },

  { id: 'statistical-inference', group: 'data', mode: 'data', weight: 1.1,
    title: 'Statistical inference',
    about: 'Right test, effect size, interval and n — statistical is not practical significance.',
    keywords: ['a/b', 'ab test', 'experiment', 'significant', 'significance', 'p-value', 'p value', 'confidence interval', 'sample size', 'hypothesis test'] },

  { id: 'product-analytics', group: 'data', mode: 'data', weight: 1.0,
    title: 'Product analytics',
    about: 'Name the retention type and window; enforce funnel order; never compare an incomplete cohort.',
    keywords: ['funnel', 'retention', 'activation', 'adoption', 'churn', 'cohort analysis', 'stickiness'] },

  { id: 'time-series-analysis', group: 'data', mode: 'data', weight: 1.0,
    title: 'Time series',
    about: 'The comparison window is the analysis; separate a spike from a level shift.',
    keywords: ['trend', 'seasonality', 'seasonal', 'baseline', 'anomaly', 'when did it start', 'forecast', 'year on year', 'month on month'] },

  { id: 'descriptive-statistics', group: 'data', mode: 'data', weight: 0.9,
    title: 'Descriptive statistics',
    about: 'Pair centre with spread, n and missingness; keep valid extremes.',
    keywords: ['average', 'mean', 'median', 'mode', 'distribution', 'outlier', 'percentile', 'standard deviation', 'spread', 'variance'] },

  { id: 'visualization', group: 'visual', mode: 'visual', weight: 1.0,
    title: 'Charting',
    about: 'One chart per finding, honest axes, a finding-led title, a source line.',
    keywords: ['chart', 'graph', 'plot', 'visualise', 'visualize', 'bar chart', 'line chart', 'scatter'] },

  { id: 'dashboard-design', group: 'visual', mode: 'visual', weight: 1.0,
    title: 'Dashboard design',
    about: 'Design the decision story before the tiles; every tile answers a question someone acts on.',
    keywords: ['dashboard', 'digest', 'weekly report', 'scorecard', 'health report'] },

  { id: 'data-exploration', group: 'data', mode: 'data', weight: 0.9,
    title: 'Data exploration',
    about: 'Schema is structure; profiling is the observed data. Look before you claim.',
    keywords: ['dataset', 'table', 'columns', 'explore the data', 'profile the data', 'rows'] },

  { id: 'data-schema-crawler', group: 'data', mode: 'data', weight: 0.8,
    title: 'Schema crawl',
    about: 'Verify live schemas and permissions; obey fan-out caps.',
    keywords: ['crawl', 'schema', 'warehouse', 'bigquery', 'snowflake', 'lineage'] },

  { id: 'metabase-mcp', group: 'data', mode: 'data', weight: 0.8,
    title: 'Metabase',
    about: 'Query through the live Metabase schema; never assume a field.',
    keywords: ['metabase', 'mcp', 'query the database', 'sql'] },

  { id: 'brand-for-pptx', group: 'visual', mode: 'visual', weight: 1.0,
    title: 'Presentation design',
    about: 'Audience and narrative first; preserve the existing layout unless a redesign is asked for.',
    keywords: ['pptx', 'powerpoint', 'slide', 'slides', 'deck', 'presentation', 'pitch'] },

  { id: 'deck-build-standards', group: 'visual', mode: 'visual', weight: 0.9,
    title: 'Deck standards',
    about: 'Agree the storyline, keep factual traceability, render and inspect.',
    keywords: ['deck structure', 'storyline', 'slide order', 'narrative'] },

  { id: 'presentation-agent-builder', group: 'build', mode: 'build', weight: 0.8,
    title: 'Presentation agent',
    about: 'One instance choice; do not tune the fixed storyline or QA method.',
    keywords: ['presentation agent', 'deck agent', 'slides agent'] },

  { id: 'design-critique-creator', group: 'design', mode: 'critique', weight: 0.9,
    title: 'Design critique',
    about: 'Principle-named critique, short by default; depth on request.',
    keywords: ['critique', 'review the design', 'ux review', 'usability', 'heuristic'] },

  { id: 'ui-design-critique', group: 'design', mode: 'critique', weight: 1.0,
    title: 'UI critique',
    about: 'Quote the weak string and rewrite it; name the principle.',
    keywords: ['ui', 'interface', 'layout', 'spacing', 'typography', 'colour', 'color', 'contrast', 'hierarchy', 'design'] },

  { id: 'changelog-report', group: 'report', mode: 'report', weight: 0.9,
    title: 'Changelog report',
    about: 'Plain-language entries, traceable to the PR, newest first.',
    keywords: ['changelog', 'release notes', 'merged pr', 'what shipped', 'release'] },

  { id: 'changelog-reporter-builder', group: 'build', mode: 'build', weight: 0.7,
    title: 'Changelog agent',
    about: 'Configure once, then reuse; ask only what tools cannot discover.',
    keywords: ['changelog agent', 'release bot', 'reporting agent'] },

  { id: 'file-organizer', group: 'build', mode: 'organise', weight: 0.9,
    title: 'File organiser',
    about: 'One classification rule, named buckets, nothing moved without permission.',
    keywords: ['organise', 'organize', 'files', 'folder', 'duplicate', 'triage', 'cleanup'] },

  { id: 'skill-creator', group: 'build', mode: 'build', weight: 0.8,
    title: 'Skill authoring',
    about: 'Draft, run test cases, grade, iterate; keep the manifest lean.',
    keywords: ['skill', 'prompt', 'instruction', 'agent instruction', 'system prompt'] },

  { id: 'ai-coding', group: 'code', mode: 'code', weight: 1.0,
    title: 'AI coding',
    about: 'Give the agent a runnable check; verify, do not assume; gate destructive actions.',
    keywords: ['code', 'coding', 'bug', 'function', 'refactor', 'test', 'error', 'debug', 'api', 'javascript', 'python', 'css'] },

  { id: 'universal-full-stack-coding-agent', group: 'code', mode: 'code', weight: 1.0,
    title: 'Full-stack build',
    about: 'Recon before changing; smallest complete vertical slice; never deploy without approval.',
    keywords: ['build an app', 'full stack', 'fullstack', 'redesign', 'deploy', 'ship', 'architecture', 'database'] },
];

/* How a reply is put together for each mode. This is the only place the
   pack touches the interface, and it never names itself. */
export const SHAPES = {
  support: {
    lead: 'Let me take what you said seriously.',
    close: 'If there is a fact behind it — a person, a place, a thing that happened — I can look it up and show you where it comes from.',
  },
  study: { lead: 'Here is the idea, then the steps.', close: 'Tell me which step you want worked through in full.' },
  research: { lead: 'Here is what the published sources say.', close: 'The article is attached so you can check it yourself.' },
  plan: { lead: 'Plan first, then do.', close: 'Give me the constraint that matters most and I will narrow it.' },
  check: { lead: 'Before believing the number, check these.', close: 'Send me the figures and I will run the same checks on them.' },
  data: { lead: 'Define the measure before reading it.', close: 'Report numerator, denominator and rate together — never a rate alone.' },
  visual: { lead: 'One idea per chart.', close: 'Ask and I will sketch the structure for you.' },
  critique: { lead: 'Strongest point first.', close: 'Point me at the screen and I will go deeper.' },
  report: { lead: 'Plain language, newest first.', close: 'Give me the range and I will keep it to what actually shipped.' },
  organise: { lead: 'One rule, named buckets.', close: 'Nothing moves until you say so.' },
  code: { lead: 'The smallest change that fixes it.', close: 'Paste the file and I will work on the real thing.' },
  build: { lead: 'Here is the shape of it.', close: 'Tell me the constraint and I will narrow it.' },
  default: { lead: '', close: '' },
};

/** Score the modules against a message and return the best, or null. */
export function route(text) {
  const q = String(text || '').toLowerCase();
  if (!q.trim()) return null;
  let best = null;
  let bestScore = 0;
  for (const mod of MODULES) {
    let score = 0;
    for (const kw of mod.keywords) {
      if (!kw) continue;
      if (q.includes(kw)) score += (kw.includes(' ') ? 3 : 2) * mod.weight;
    }
    if (score > bestScore) { bestScore = score; best = mod; }
  }
  return bestScore >= 2 ? { ...best, score: Math.round(bestScore * 10) / 10 } : null;
}

export const SHAPE_OF = (mode) => SHAPES[mode] || SHAPES.default;
