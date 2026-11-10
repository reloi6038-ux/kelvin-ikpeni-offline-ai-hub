// public/js/search.js — Offline full-text search across downloaded packs
// Exposes window.KH_SEARCH
// Usage:
//   await KH_SEARCH.buildIndex();
//   const results = KH_SEARCH.query('fraction');
//   results.forEach(r => console.log(r.lesson.title, r.score));

(function () {
  'use strict';

  const state = {
    index: null,        // Map<lessonId, { lesson, tokens, searchText }>
    built: false,
    building: false,
    lastBuildCount: 0
  };

  // ------------------------------------------------------------------
  // Tokenize: lowercase, split on non-word chars, filter stopwords + short tokens
  // ------------------------------------------------------------------
  const STOPWORDS = new Set([
    'the','and','for','are','but','not','you','can','how','why','what','when',
    'where','who','does','this','that','with','from','have','has','had','was',
    'were','been','being','will','would','could','should','may','might','must',
    'shall','a','an','of','in','on','to','at','by','or','is','it','as','be',
    'if','into','its','has','we','our','your','their','them','they','i','me',
    'my','he','she','his','her','us','do','did','doing','so','such','than'
  ]);

  function tokenize(text) {
    if (!text) return [];
    const tokens = String(text)
      .toLowerCase()
      .replace(/<[^>]+>/g, ' ')          // strip HTML tags
      .replace(/[^a-z0-9\u0100-\uFFFF]+/g, ' ')  // keep words + unicode letters
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
    return tokens;
  }

  // ------------------------------------------------------------------
  // Build index from IndexedDB
  // ------------------------------------------------------------------
  async function buildIndex() {
    if (state.building) return;
    state.building = true;
    try {
      if (!window.KH_DB) throw new Error('KH_DB not available');
      const lessons = await KH_DB.getAll('lessons');
      const index = new Map();

      for (const lesson of lessons) {
        const titleTokens = tokenize(lesson.title);
        const summaryTokens = tokenize(lesson.summary);
        const contentTokens = tokenize(lesson.content);
        const keywordTokens = (lesson.keywords || []).flatMap((k) => tokenize(k));
        const keyPointTokens = (lesson.keyPoints || []).flatMap((kp) => tokenize(kp));

        // Weighted token counts: title/keywords × 5, summary/keyPoints × 3, content × 1
        const weights = new Map();
        const bump = (tokens, weight) => {
          for (const t of tokens) {
            weights.set(t, (weights.get(t) || 0) + weight);
          }
        };
        bump(titleTokens, 5);
        bump(keywordTokens, 5);
        bump(summaryTokens, 3);
        bump(keyPointTokens, 3);
        bump(contentTokens, 1);

        // Search-ready plain text for highlighting
        const searchText = [lesson.title, lesson.summary || '',
                            String(lesson.content || '').replace(/<[^>]+>/g, ' ')]
                            .join(' ').toLowerCase();

        index.set(lesson.id, {
          lesson,
          weights,
          searchText,
          tokens: Array.from(weights.keys())
        });
      }

      state.index = index;
      state.built = true;
      state.lastBuildCount = index.size;
      return { built: true, count: index.size };
    } finally {
      state.building = false;
    }
  }

  // ------------------------------------------------------------------
  // Query with scoring (BM25-lite: token weight × IDF approximation)
  // ------------------------------------------------------------------
  function query(q, options = {}) {
    if (!state.built) {
      // Auto-build lazily
      buildIndex().catch((e) => console.warn('Search index build failed:', e));
      return [];
    }

    const qTokens = tokenize(q);
    if (qTokens.length === 0) return [];

    const limit = options.limit || 20;
    const results = [];
    const totalDocs = state.index.size;

    // IDF: log(1 + N / (1 + df))
    const df = new Map();
    for (const [, entry] of state.index) {
      for (const t of qTokens) {
        if (entry.weights.has(t)) df.set(t, (df.get(t) || 0) + 1);
      }
    }
    const idf = new Map();
    for (const t of qTokens) {
      idf.set(t, Math.log(1 + totalDocs / (1 + (df.get(t) || 0))));
    }

    for (const [, entry] of state.index) {
      let score = 0;
      let matchedTokens = 0;
      for (const t of qTokens) {
        const w = entry.weights.get(t);
        if (w) {
          score += w * idf.get(t);
          matchedTokens++;
        }
      }

      // Bonus for matching more of the query tokens (relevance)
      if (matchedTokens > 0) {
        score *= (1 + matchedTokens / qTokens.length);
      }

      if (score > 0) {
        results.push({
          lessonId: entry.lesson.id,
          lesson: entry.lesson,
          score,
          matchedTokens,
          excerpt: extractExcerpt(entry.lesson.content, qTokens[0])
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  function extractExcerpt(content, firstToken) {
    const text = String(content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!firstToken) return text.slice(0, 140) + '…';
    const idx = text.toLowerCase().indexOf(firstToken);
    if (idx === -1) return text.slice(0, 140) + '…';
    const start = Math.max(0, idx - 50);
    return (start > 0 ? '…' : '') + text.slice(start, start + 160) + '…';
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  window.KH_SEARCH = {
    buildIndex,
    query,
    isBuilt: () => state.built,
    getDocCount: () => state.lastBuildCount,
    tokenize  // exposed for testing
  };
})();