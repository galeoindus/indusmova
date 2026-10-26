/* indusmova — the embedded skill pack.
 *
 * The Amigo pack (28 modules + companion guide) is folded into this one
 * module as data. Nothing here is rendered: there is no skills list, no
 * drawer, no badge. The pack exists only so the chat can pick the right
 * shape for a reply — the module that matches a message decides the tone
 * and the structure the answer comes back in.
 *
 * Routing is deterministic keyword scoring, so it costs nothing per turn
 * and works offline. If nothing scores, the message is treated as a plain
 * question and answered from the encyclopedia.
 */

/* mode = how the reply should be shaped when this module wins. */
export const SKILLS = [
  { id: 'companion', title: 'Companion', mode: 'support',
    keywords: ['lonely', 'sad', 'friend', 'relationship', 'sorry', 'apolog', 'feel', 'anxious', 'stress', 'akela', 'udaas', 'dost'] },
  { id: 'photostudy', title: 'Photo study help', mode: 'study',
    keywords: ['solve', 'homework', 'worksheet', 'question paper', 'photo', 'sum', 'equation', 'diagram', 'exam', 'padhai'] },
  { id: 'research', title: 'Research and source checking', mode: 'research',
    keywords: ['research', 'source', 'verify', 'evidence', 'cite', 'reference', 'khoj', 'sach'] },
  { id: 'analytical-planning', title: 'Analytical planning', mode: 'plan',
    keywords: ['plan', 'approach', 'framework', 'structure', 'steps', 'how should i'] },
  { id: 'analysis-validation', title: 'Analysis validation', mode: 'check',
    keywords: ['validate', 'check', 'sanity', 'correct', 'verify the number'] },
  { id: 'data-dictionary', title: 'Metric definitions', mode: 'data',
    keywords: ['metric', 'definition', 'define', 'kpi', 'conversion', 'active user'] },
  { id: 'metric-reasoning', title: 'Metric reasoning', mode: 'data',
    keywords: ['numerator', 'denominator', 'rate', 'ratio', 'percentage'] },
  { id: 'root-cause-analysis', title: 'Root cause analysis', mode: 'data',
    keywords: ['why did', 'dropped', 'decline', 'fell', 'spike', 'root cause', 'kyun gira'] },
  { id: 'segmentation-drilldown', title: 'Segmentation drilldown', mode: 'data',
    keywords: ['segment', 'cohort', 'breakdown', 'which group', 'geo', 'platform'] },
  { id: 'statistical-inference', title: 'Statistical inference', mode: 'data',
    keywords: ['a/b', 'ab test', 'significant', 'p-value', 'confidence', 'experiment'] },
  { id: 'product-analytics', title: 'Product analytics', mode: 'data',
    keywords: ['funnel', 'retention', 'activation', 'adoption', 'churn'] },
  { id: 'time-series-analysis', title: 'Time series analysis', mode: 'data',
    keywords: ['trend', 'seasonality', 'baseline', 'anomaly', 'when did it start', 'forecast'] },
  { id: 'descriptive-statistics', title: 'Descriptive statistics', mode: 'data',
    keywords: ['average', 'mean', 'median', 'distribution', 'outlier', 'spread'] },
  { id: 'visualization', title: 'Charting', mode: 'visual',
    keywords: ['chart', 'graph', 'plot', 'visualise', 'visualize', 'dashboard chart'] },
  { id: 'dashboard-design', title: 'Dashboard design', mode: 'visual',
    keywords: ['dashboard', 'digest', 'weekly report', 'scorecard'] },
  { id: 'data-exploration', title: 'Data exploration', mode: 'data',
    keywords: ['dataset', 'table', 'columns', 'explore the data', 'schema'] },
  { id: 'data-schema-crawler', title: 'Schema crawl', mode: 'data',
    keywords: ['crawl', 'schema', 'warehouse', 'metabase', 'bigquery'] },
  { id: 'metabase-mcp', title: 'Metabase', mode: 'data',
    keywords: ['metabase', 'mcp', 'query the database'] },
  { id: 'brand-for-pptx', title: 'Presentation brand', mode: 'visual',
    keywords: ['pptx', 'powerpoint', 'slide', 'deck', 'presentation', 'brand'] },
  { id: 'deck-build-standards', title: 'Deck standards', mode: 'visual',
    keywords: ['deck structure', 'storyline', 'slide order'] },
  { id: 'presentation-agent-builder', title: 'Presentation agent', mode: 'build',
    keywords: ['presentation agent', 'deck agent', 'slides agent'] },
  { id: 'design-critique-creator', title: 'Design critique', mode: 'critique',
    keywords: ['critique', 'review the design', 'ux review', 'usability'] },
  { id: 'ui-design-critique', title: 'UI critique', mode: 'critique',
    keywords: ['ui', 'interface', 'layout', 'spacing', 'typography', 'colour', 'color'] },
  { id: 'changelog-report', title: 'Changelog report', mode: 'report',
    keywords: ['changelog', 'release notes', 'merged pr', 'what shipped'] },
  { id: 'changelog-reporter-builder', title: 'Changelog agent', mode: 'build',
    keywords: ['changelog agent', 'release bot', 'reporting agent'] },
  { id: 'file-organizer', title: 'File organiser', mode: 'organise',
    keywords: ['organise', 'organize', 'files', 'folder', 'duplicate', 'triage'] },
  { id: 'skill-creator', title: 'Skill authoring', mode: 'build',
    keywords: ['skill', 'prompt', 'instruction', 'agent instruction'] },
  { id: 'ai-coding', title: 'AI coding', mode: 'code',
    keywords: ['code', 'bug', 'function', 'refactor', 'test', 'error', 'debug', 'api'] },
  { id: 'universal-full-stack-coding-agent', title: 'Full-stack build', mode: 'code',
    keywords: ['build an app', 'full stack', 'redesign', 'deploy', 'ship'] },
];

/** Score every module against a message; return the best, or null. */
export function routeSkill(text) {
  const q = String(text || '').toLowerCase();
  if (!q.trim()) return null;
  let best = null;
  let bestScore = 0;
  for (const skill of SKILLS) {
    let score = 0;
    for (const kw of skill.keywords) {
      if (q.includes(kw)) score += kw.includes(' ') ? 3 : 2;
    }
    if (score > bestScore) { bestScore = score; best = skill; }
  }
  return bestScore >= 2 ? { ...best, score: bestScore } : null;
}

/**
 * The shape a reply takes for a mode. This is the only place the pack
 * influences the interface, and it never names itself.
 */
export function replyShape(mode) {
  switch (mode) {
    case 'support': return { lead: 'Let me start with what you said.', closing: 'If it would help, I can look up something specific — or we can just keep talking.' };
    case 'study': return { lead: 'Here is the idea, then the steps.', closing: 'Tell me which step you want worked through in full.' };
    case 'research': return { lead: 'Here is what the sources say.', closing: 'I have kept the source attached so you can check it yourself.' };
    case 'data': return { lead: 'Define the measure first, then read the movement.', closing: 'If you share the numbers I can work the same structure on them.' };
    case 'visual': return { lead: 'One idea per chart or tile.', closing: 'Ask me and I will sketch the structure.' };
    case 'critique': return { lead: 'A short critique, strongest point first.', closing: 'Point me at the screen and I will go deeper.' };
    case 'code': return { lead: 'The smallest change that fixes it.', closing: 'Paste the file and I will work on the real thing.' };
    case 'build': return { lead: 'Here is the shape of it.', closing: 'Tell me the constraint that matters most and I will narrow it.' };
    case 'report': return { lead: 'Plain-language entries, newest first.', closing: 'Give me the range and I will keep it to what actually shipped.' };
    case 'organise': return { lead: 'Group by one rule, then name the buckets.', closing: 'Nothing moves until you say so.' };
    default: return { lead: '', closing: '' };
  }
}
