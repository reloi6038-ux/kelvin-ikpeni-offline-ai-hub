// public/js/library.js — Premium offline library
(function () {
  'use strict';

  const state = {
    packs: [],
    lessons: [],
    lessonsByPack: new Map(),
    quizzes: [],
    activeLessonId: null,
    activeLessonList: []
  };

  const dom = {
    // Views
    homeView: document.getElementById('lib-home-view'),
    readerView: document.getElementById('lib-reader-view'),
    readingProgress: document.getElementById('lib-reading-progress'),
    readingFill: document.getElementById('lib-reading-fill'),
    fabBar: document.getElementById('lib-fab-bar'),

    // Stats
    stats: document.getElementById('lib-stats'),
    statPacks: document.getElementById('lib-stat-packs'),
    statLessons: document.getElementById('lib-stat-lessons'),
    statQuizzes: document.getElementById('lib-stat-quizzes'),
    statStorage: document.getElementById('lib-stat-storage'),

    // Search
    searchInput: document.getElementById('lib-search'),
    packFilter: document.getElementById('lib-pack-filter'),
    packsEl: document.getElementById('lib-packs'),
    searchEl: document.getElementById('lib-search-results'),
    loading: document.getElementById('lib-loading'),
    empty: document.getElementById('lib-empty'),

    // Reader
    readerSidebar: document.getElementById('lib-reader-sidebar'),
    backBtn: document.getElementById('lib-back-btn'),
    lessonList: document.getElementById('lib-lesson-list'),
    level: document.getElementById('lib-level'),
    time: document.getElementById('lib-time'),
    verified: document.getElementById('lib-verified'),
    articleTitle: document.getElementById('lib-article-title'),
    articleMeta: document.getElementById('lib-article-meta'),
    articleBody: document.getElementById('lib-article-body'),
    quizBox: document.getElementById('lib-quiz-box'),
    quizBtn: document.getElementById('lib-quiz-btn'),

    // Tutor
    tutorPanel: document.getElementById('lib-reader-tutor'),
    tutorTabs: document.querySelectorAll('.lib-tutor-tab'),
    tutorPanels: document.querySelectorAll('.lib-tutor-panel'),
    tutorCollapse: document.getElementById('lib-tutor-collapse'),
    tutorActions: document.querySelectorAll('.lib-tutor-action'),
    tutorQuestion: document.getElementById('lib-tutor-question'),
    tutorAskBtn: document.getElementById('lib-tutor-ask-btn'),
    tutorMic: document.getElementById('lib-tutor-mic'),
    voiceStatus: document.getElementById('lib-voice-status'),
    tutorResponse: document.getElementById('lib-tutor-response'),
    sourceBadge: document.getElementById('lib-source-badge'),
    responseBody: document.getElementById('lib-response-body'),
    responseClose: document.getElementById('lib-response-close'),
    tutorError: document.getElementById('lib-tutor-error'),

    // FAB
    fabAi: document.getElementById('lib-fab-ai'),
    fabQuiz: document.getElementById('lib-fab-quiz'),
    fabTop: document.getElementById('lib-fab-top')
  };

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  async function init() {
    try {
      if (!window.KH_DB) throw new Error('Offline storage not available');

      state.packs = await KH_DB.listPacks();
      const lessonsByPack = new Map();
      const allLessons = [];
      const allQuizzes = [];

      await Promise.all(state.packs.map(async (p) => {
        const lessons = await KH_DB.lessonsForPack(p.id);
        const quizzes = await KH_DB.quizzesForPack(p.id);
        lessonsByPack.set(p.id, lessons);
        allLessons.push(...lessons);
        allQuizzes.push(...quizzes);
      }));

      state.lessons = allLessons;
      state.lessonsByPack = lessonsByPack;
      state.quizzes = allQuizzes;

      dom.loading.hidden = true;
      renderLibrary();
      updateStats();
      handleDeepLink();
    } catch (err) {
      console.error('Library init failed:', err);
      dom.loading.hidden = true;
      dom.empty.hidden = false;
    }
  }

  async function updateStats() {
    if (state.packs.length === 0) return;
    dom.stats.hidden = false;
    dom.statPacks.textContent = String(state.packs.length);
    dom.statLessons.textContent = String(state.lessons.length);
    dom.statQuizzes.textContent = String(state.quizzes.length);
    try {
      const est = await KH_DB.getStorageEstimate();
      const kb = Math.round((est.usage || 0) / 1024);
      dom.statStorage.textContent = kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`;
    } catch {
      dom.statStorage.textContent = '—';
    }
  }

  function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const packId = params.get('pack');
    const lessonId = params.get('lesson');

    if (lessonId) {
      const lesson = state.lessons.find((l) => l.id === lessonId);
      if (lesson) {
        const packLessons = state.lessonsByPack.get(lesson.packId) || [];
        openLesson(lesson.id, packLessons);
        return;
      }
    }
    if (packId) {
      const packLessons = state.lessonsByPack.get(packId) || [];
      if (packLessons.length > 0) openLesson(packLessons[0].id, packLessons);
    }
  }

  // ------------------------------------------------------------------
  // Landing view
  // ------------------------------------------------------------------
  function renderLibrary() {
    if (state.packs.length === 0) {
      dom.empty.hidden = false;
      dom.packsEl.hidden = true;
      return;
    }
    dom.empty.hidden = true;
    dom.packsEl.hidden = false;
    dom.packsEl.innerHTML = '';

    for (const pack of state.packs) {
      const lessons = state.lessonsByPack.get(pack.id) || [];
      if (lessons.length === 0) continue;

      const card = document.createElement('div');
      card.className = 'lib-pack-card';
      card.innerHTML = `
        <div class="lib-pack-head">
          <div class="lib-pack-icon" aria-hidden="true">${escapeHtml((pack.subject && pack.subject.icon) || '📘')}</div>
          <div class="lib-pack-titles">
            <h3 class="lib-pack-title">${escapeHtml(pack.name)}</h3>
            <p class="lib-pack-meta">${lessons.length} lesson${lessons.length !== 1 ? 's' : ''} · ${pack.quizCount || 0} quiz${(pack.quizCount || 0) !== 1 ? 'zes' : ''}</p>
          </div>
        </div>
        <div class="lib-pack-lessons"></div>
      `;

      const list = card.querySelector('.lib-pack-lessons');
      lessons.forEach((lesson, idx) => {
        const btn = document.createElement('button');
        btn.className = 'lib-pack-lesson';
        btn.innerHTML = `
          <span class="lib-lesson-num">${idx + 1}</span>
          <span class="lib-lesson-title">${escapeHtml(lesson.title)}</span>
          <span class="lib-lesson-time">${lesson.estimatedMinutes || 10}m</span>
        `;
        btn.addEventListener('click', () => openLesson(lesson.id, lessons));
        list.appendChild(btn);
      });

      dom.packsEl.appendChild(card);
    }

    populatePackFilter();
    observeCards();
  }

  function populatePackFilter() {
    if (!dom.packFilter) return;
    for (const pack of state.packs) {
      const opt = document.createElement('option');
      opt.value = pack.id;
      opt.textContent = pack.name;
      dom.packFilter.appendChild(opt);
    }
  }

  // ------------------------------------------------------------------
  // Search
  // ------------------------------------------------------------------
  function search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) {
      dom.searchEl.hidden = true;
      dom.packsEl.hidden = false;
      return;
    }

    const results = [];
    for (const lesson of state.lessons) {
      const haystack = [lesson.title, lesson.summary, lesson.content,
                       ...(lesson.keywords || []), ...(lesson.keyPoints || [])]
                       .join(' ').toLowerCase();
      if (haystack.includes(q)) {
        results.push({ lesson, excerpt: extractExcerpt(lesson.content, q) });
      }
    }

    dom.packsEl.hidden = true;
    dom.searchEl.hidden = false;
    dom.searchEl.innerHTML = '';

    const header = document.createElement('h3');
    header.className = 'lib-search-results-header';
    header.textContent = `${results.length} lesson${results.length !== 1 ? 's' : ''} matched "${query}"`;
    dom.searchEl.appendChild(header);

    if (results.length === 0) {
      const p = document.createElement('p');
      p.style.color = 'var(--text-muted)';
      p.textContent = 'No matches. Try a different keyword.';
      dom.searchEl.appendChild(p);
      return;
    }

    for (const { lesson, excerpt } of results) {
      const pack = state.packs.find((p) => p.id === lesson.packId);
      const div = document.createElement('div');
      div.className = 'lib-search-result';
      div.innerHTML = `
        <div class="lib-search-subject">${escapeHtml((pack && pack.subject && pack.subject.name) || '')}</div>
        <h4 class="lib-search-title">${highlight(lesson.title, q)}</h4>
        <p class="lib-search-excerpt">${highlight(excerpt, q)}</p>
      `;
      div.addEventListener('click', () => {
        const packLessons = state.lessonsByPack.get(lesson.packId) || [];
        openLesson(lesson.id, packLessons);
      });
      dom.searchEl.appendChild(div);
    }
  }

  function extractExcerpt(content, query) {
    const text = String(content || '').replace(/<[^>]+>/g, ' ');
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return text.slice(0, 140) + '…';
    const start = Math.max(0, idx - 40);
    return '…' + text.slice(start, start + 160) + '…';
  }

  function highlight(text, query) {
    const esc = escapeHtml(text);
    if (!query) return esc;
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return esc.replace(re, '<mark>$1</mark>');
  }

  // ------------------------------------------------------------------
  // Open lesson
  // ------------------------------------------------------------------
  async function openLesson(lessonId, lessonList) {
    const lesson = await KH_DB.getLesson(lessonId);
    if (!lesson) { alert('Lesson not found in offline storage.'); return; }

    state.activeLessonId = lessonId;
    state.activeLessonList = lessonList || [];

    dom.level.textContent = lesson.level || '—';
    dom.time.textContent = `${lesson.estimatedMinutes || 10} min`;
    dom.verified.textContent = lesson.contentType === 'verified_curriculum' ? '✓ Verified curriculum' : '👍 Teacher approved';
    dom.articleTitle.textContent = lesson.title;

    const pack = state.packs.find((p) => p.id === lesson.packId);
    dom.articleMeta.textContent = pack ? `${pack.name} · ${lesson.sourceRef || ''}` : (lesson.sourceRef || '');

    dom.articleBody.innerHTML = sanitizeHTML(lesson.content || '');

    // Quiz box
    const lessonQuizzes = state.quizzes.filter((q) => q.lessonId === lessonId);
    if (lessonQuizzes.length > 0) {
      dom.quizBox.hidden = false;
      dom.quizBox.innerHTML = `
        <div class="lib-quiz-card">
          <h3 class="lib-quiz-title">📝 Test yourself</h3>
          <p class="lib-quiz-text">This lesson has ${lessonQuizzes.length} quiz${lessonQuizzes.length !== 1 ? 'zes' : ''} ready to take.</p>
          <div class="lib-quiz-buttons" id="lib-quiz-buttons"></div>
        </div>
      `;
      const btnWrap = dom.quizBox.querySelector('#lib-quiz-buttons');
      lessonQuizzes.forEach((q) => {
        const a = document.createElement('a');
        a.className = 'btn btn-sm btn-primary';
        a.textContent = `✏️ ${q.title}`;
        a.href = `/pages/quizzes.html?quiz=${encodeURIComponent(q.id)}`;
        btnWrap.appendChild(a);
      });
    } else {
      dom.quizBox.hidden = true;
    }

    // Sidebar
    renderSidebar();

    // Reset tutor
    dom.tutorResponse.hidden = true;
    dom.responseBody.innerHTML = '';
    dom.tutorError.hidden = true;
    dom.tutorQuestion.value = '';
    if (dom.voiceStatus) dom.voiceStatus.textContent = '';

    // Switch views
    dom.homeView.hidden = true;
    dom.readerView.hidden = false;
    dom.readingProgress.hidden = false;
    dom.fabBar.hidden = false;
    document.body.style.overflow = 'hidden';

    const contentWrapper = dom.readerView.querySelector('.lib-reader-content');
    if (contentWrapper) contentWrapper.scrollTop = 0;

    updateReadingProgress();
  }

  function renderSidebar() {
    dom.lessonList.innerHTML = '';
    for (const lesson of state.activeLessonList) {
      const btn = document.createElement('button');
      btn.className = 'lib-lesson-item' + (lesson.id === state.activeLessonId ? ' is-active' : '');
      btn.innerHTML = `
        <span class="lib-item-check">${lesson.id === state.activeLessonId ? '▶' : '·'}</span>
        <span class="lib-item-text">${escapeHtml(lesson.title)}</span>
      `;
      btn.addEventListener('click', () => openLesson(lesson.id, state.activeLessonList));
      dom.lessonList.appendChild(btn);
    }
  }

  function closeReader() {
    dom.readerView.hidden = true;
    dom.homeView.hidden = false;
    dom.readingProgress.hidden = true;
    dom.fabBar.hidden = true;
    document.body.style.overflow = '';
    state.activeLessonId = null;
    stopTTS();
  }

  // ------------------------------------------------------------------
  // Reading progress
  // ------------------------------------------------------------------
  function updateReadingProgress() {
    const wrapper = dom.readerView.querySelector('.lib-reader-content');
    if (!wrapper || dom.readingProgress.hidden) return;
    const max = wrapper.scrollHeight - wrapper.clientHeight;
    const pct = max > 0 ? (wrapper.scrollTop / max) * 100 : 0;
    dom.readingFill.style.width = Math.min(100, pct) + '%';
  }

  // ------------------------------------------------------------------
  // AI tutor
  // ------------------------------------------------------------------
  async function runTutorAction(action) {
    if (!state.activeLessonId) return;
    clearTutorError();
    setTutorDisabled(true);
    try {
      const lesson = await KH_DB.getLesson(state.activeLessonId);
      if (!lesson) throw new Error('Lesson not in offline store.');

      let aiEntry = lesson.ai && lesson.ai[action];

      if (!aiEntry && window.KH_IS_ONLINE && window.KH_IS_ONLINE()) {
        try {
          const res = await fetch(`/api/ai/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lessonId: lesson.id, learningDifficulty: 'beginner', language: lesson.language || 'en' })
          });
          if (res.ok) {
            const data = await res.json();
            aiEntry = {
              content: data.data.content,
              provider: data.data.provider,
              confidence: data.data.confidence,
              groundedIn: data.data.groundedIn
            };
          }
        } catch (err) { console.warn('Server AI failed:', err.message); }
      }

      if (!aiEntry) aiEntry = buildTemplate(action, lesson);
      renderTutorResponse(aiEntry);
    } catch (err) {
      showTutorError(`Could not load AI response: ${err.message}`);
    } finally {
      setTutorDisabled(false);
    }
  }

  async function askFreeform() {
    const question = dom.tutorQuestion.value.trim();
    if (!question || !state.activeLessonId) return;
    clearTutorError();
    setTutorDisabled(true);
    try {
      const lesson = await KH_DB.getLesson(state.activeLessonId);
      if (!lesson) throw new Error('Lesson not in offline store.');

      let aiEntry = null;
      if (window.KH_IS_ONLINE && window.KH_IS_ONLINE()) {
        try {
          const res = await fetch('/api/ai/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lessonId: lesson.id, question, learningDifficulty: 'beginner' })
          });
          if (res.ok) {
            const data = await res.json();
            aiEntry = {
              content: data.data.content,
              provider: data.data.provider,
              confidence: data.data.confidence,
              groundedIn: data.data.groundedIn
            };
          }
        } catch (err) { console.warn('Online ask failed:', err.message); }
      }
      if (!aiEntry) aiEntry = matchOffline(question, lesson);
      renderTutorResponse(aiEntry);
    } catch (err) {
      showTutorError(`Could not answer: ${err.message}`);
    } finally {
      setTutorDisabled(false);
    }
  }

  function buildTemplate(action, lesson) {
    const kp = lesson.keyPoints || [];
    const title = lesson.title || 'this lesson';
    const src = lesson.sourceRef ? `\n\n_Source: ${lesson.sourceRef}_` : '';
    const templates = {
      explain_simply: `**${title} — Simply Explained**\n\n` + kp.map((p, i) => `${i + 1}. ${p}`).join('\n') + src,
      give_examples: `**Examples from the lesson**\n\n` + kp.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join('\n') + src,
      practice_questions: `**Practice — ${title}**\n\n` + kp.slice(0, 4).map((p, i) => `${i + 1}. Explain: ${p}`).join('\n') + src,
      summarize: `**Key takeaways — ${title}**\n\n` + kp.map((p, i) => `${i + 1}. ${p}`).join('\n') + src
    };
    return { content: templates[action] || templates.explain_simply, provider: 'template', confidence: 'high', groundedIn: lesson.sourceRef || '' };
  }

  function matchOffline(question, lesson) {
    const STOP = new Set(['the','and','for','are','but','not','you','can','how','why','what','when','where','who','does','this','that','with','from']);
    const tokens = question.toLowerCase().match(/[a-z]{3,}/g) || [];
    const sig = tokens.filter((t) => !STOP.has(t));
    const matched = (lesson.keyPoints || []).filter((kp) => sig.some((t) => kp.toLowerCase().includes(t)));
    if (matched.length > 0) {
      return {
        content: `**From this lesson**\n\n${matched.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n_This answer comes from the downloaded lesson notes._`,
        provider: 'template', confidence: 'high', groundedIn: lesson.sourceRef || ''
      };
    }
    return {
      content: `**I don't have this in the downloaded lesson**\n\nTry re-reading the lesson, or connect to ask the online AI. Offline, your teacher or textbook is the best source.`,
      provider: 'template', confidence: 'low', groundedIn: lesson.sourceRef || ''
    };
  }

  function renderTutorResponse(entry) {
    dom.tutorResponse.hidden = false;
    dom.tutorError.hidden = true;
    const srcMap = {
      provider: { label: '🤖 AI-generated', cls: 'provider' },
      template: { label: '📘 From curriculum notes', cls: '' },
      cache: { label: '✓ Verified answer', cls: 'cache' }
    };
    const badge = srcMap[entry.provider] || srcMap.template;
    dom.sourceBadge.textContent = badge.label;
    dom.sourceBadge.className = 'lib-source-badge ' + badge.cls;
    dom.responseBody.innerHTML = renderMarkdown(entry.content || '');
    dom.tutorResponse.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showTutorError(msg) {
    dom.tutorError.hidden = false;
    dom.tutorError.textContent = msg;
  }
  function clearTutorError() { dom.tutorError.hidden = true; }
  function setTutorDisabled(v) {
    dom.tutorActions.forEach((b) => { b.disabled = v; });
    dom.tutorQuestion.disabled = v;
    dom.tutorAskBtn.disabled = v;
    if (dom.tutorMic) dom.tutorMic.disabled = v;
  }

  // ------------------------------------------------------------------
  // TTS
  // ------------------------------------------------------------------
  function stopTTS() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  // ------------------------------------------------------------------
  // Sanitizers + markdown
  // ------------------------------------------------------------------
  function sanitizeHTML(html) {
    const allowed = /<(\/?)(p|br|strong|em|ul|ol|li|h3|h4|blockquote|pre|code|a)[^>]*>/gi;
    let out = String(html || '');
    out = out.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
    out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, '').replace(/\son\w+\s*=\s*'[^']*'/gi, '');
    out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (m, tag) => {
      const test = new RegExp(`^<\\/?${tag}\\b`, 'i');
      return test.test(m) && allowed.source.includes(tag.toLowerCase()) ? m : '';
    });
    return out;
  }

  function renderMarkdown(text) {
    let s = escapeHtml(text);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/_(.+?)_/g, '<em>$1</em>');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ------------------------------------------------------------------
  // Scroll reveal for cards
  // ------------------------------------------------------------------
  function observeCards() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isDataSaver = document.documentElement.classList.contains('data-saver');
    const cards = dom.packsEl.querySelectorAll('.lib-pack-card');
    if (prefersReducedMotion || isDataSaver || !('IntersectionObserver' in window)) {
      cards.forEach((c) => c.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = Array.from(entry.target.parentElement.children).indexOf(entry.target);
          setTimeout(() => entry.target.classList.add('is-visible'), Math.min(idx * 60, 300));
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    cards.forEach((c) => observer.observe(c));
  }

  // ------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------
  dom.searchInput.addEventListener('input', (e) => search(e.target.value));
  dom.packFilter.addEventListener('change', (e) => {
    const packId = e.target.value;
    if (!packId) { dom.packsEl.hidden = false; dom.searchEl.hidden = true; return; }
    const lessons = state.lessonsByPack.get(packId) || [];
    if (lessons.length > 0) openLesson(lessons[0].id, lessons);
  });

  dom.backBtn.addEventListener('click', closeReader);
  dom.quizBtn.addEventListener('click', () => { window.location.href = '/pages/quizzes.html'; });

  // Tabs
  dom.tutorTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      dom.tutorTabs.forEach((t) => t.classList.toggle('is-active', t === tab));
      dom.tutorPanels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === tab.dataset.tab));
    });
  });

  dom.tutorCollapse.addEventListener('click', () => {
    dom.tutorPanel.classList.toggle('is-open');
  });

  dom.tutorActions.forEach((btn) => {
    btn.addEventListener('click', () => runTutorAction(btn.dataset.action));
  });
  dom.tutorAskBtn.addEventListener('click', askFreeform);
  dom.tutorQuestion.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); askFreeform(); }
  });
  dom.responseClose.addEventListener('click', () => {
    dom.tutorResponse.hidden = true;
    stopTTS();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!dom.tutorResponse.hidden) dom.tutorResponse.hidden = true;
      else if (!dom.readerView.hidden) closeReader();
    }
    if (e.key === '/' && dom.readerView.hidden && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      dom.searchInput.focus();
    }
  });

  // Reading progress
  const contentWrapper = dom.readerView.querySelector('.lib-reader-content');
  if (contentWrapper) contentWrapper.addEventListener('scroll', updateReadingProgress);

  // FAB
  dom.fabAi.addEventListener('click', () => {
    // Switch to Ask tab
    dom.tutorTabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === 'ask'));
    dom.tutorPanels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === 'ask'));
    dom.tutorQuestion.focus();
  });
  dom.fabQuiz.addEventListener('click', () => {
    const quizzes = state.quizzes.filter((q) => q.lessonId === state.activeLessonId);
    if (quizzes.length > 0) {
      window.location.href = `/pages/quizzes.html?quiz=${encodeURIComponent(quizzes[0].id)}`;
    } else {
      window.location.href = '/pages/quizzes.html';
    }
  });
  dom.fabTop.addEventListener('click', () => {
    const wrapper = dom.readerView.querySelector('.lib-reader-content');
    if (wrapper) wrapper.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Voice input
  if (dom.tutorMic && window.KH_VOICE && window.KH_VOICE.isSupported()) {
    let isListening = false;
    dom.tutorMic.addEventListener('click', async () => {
      if (isListening) {
        window.KH_VOICE.stopListening();
        isListening = false;
        dom.tutorMic.classList.remove('is-listening', 'is-loading', 'is-transcribing');
        return;
      }
      isListening = true;
      dom.tutorQuestion.value = '';
      dom.voiceStatus.textContent = 'Listening…';
      dom.voiceStatus.className = 'voice-status is-active';

      await window.KH_VOICE.startListening(
        (text) => {
          isListening = false;
          dom.tutorQuestion.value = text;
          dom.tutorMic.classList.remove('is-listening', 'is-loading', 'is-transcribing');
          dom.voiceStatus.textContent = `Heard: "${text}"`;
          dom.voiceStatus.className = 'voice-status';
          setTimeout(() => askFreeform(), 150);
        },
        (err) => {
          isListening = false;
          dom.tutorMic.classList.remove('is-listening', 'is-loading', 'is-transcribing');
          dom.voiceStatus.textContent = err;
          dom.voiceStatus.className = 'voice-status is-error';
          setTimeout(() => { dom.voiceStatus.textContent = ''; }, 5000);
        },
        (mode, message) => {
          dom.tutorMic.classList.remove('is-listening', 'is-loading', 'is-transcribing');
          if (mode === 'listening') {
            dom.tutorMic.classList.add('is-listening');
            dom.voiceStatus.textContent = message || 'Listening…';
            dom.voiceStatus.className = 'voice-status is-active';
          } else if (mode === 'loading') {
            dom.tutorMic.classList.add('is-loading');
            dom.voiceStatus.textContent = message || 'Loading model…';
            dom.voiceStatus.className = 'voice-status is-active';
          } else if (mode === 'transcribing') {
            dom.tutorMic.classList.add('is-transcribing');
            dom.voiceStatus.textContent = message || 'Transcribing…';
            dom.voiceStatus.className = 'voice-status is-active';
          } else if (mode === 'error') {
            dom.voiceStatus.className = 'voice-status is-error';
          }
        }
      );
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();