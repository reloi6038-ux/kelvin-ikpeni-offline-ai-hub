// public/js/tutor.js — Premium AI Tutor with conversation history
(function () {
  'use strict';

  const state = {
    lessons: [],
    filteredLessons: [],
    activeLesson: null,
    conversation: [],
    busy: false
  };

  const dom = {
    loading: document.getElementById('tutor-loading'),
    empty: document.getElementById('tutor-empty'),
    shell: document.getElementById('tutor-shell'),
    lessonCount: document.getElementById('lesson-count'),
    lessonSearch: document.getElementById('lesson-search'),
    lessonList: document.getElementById('lesson-list'),
    mainHeadEmpty: document.getElementById('main-head-empty'),
    mainHeadActive: document.getElementById('main-head-active'),
    activeTitle: document.getElementById('active-lesson-title'),
    activeMeta: document.getElementById('active-lesson-meta'),
    mainEmptyHero: document.getElementById('main-empty-hero'),
    conversation: document.getElementById('conversation'),
    inputBar: document.getElementById('input-bar'),
    question: document.getElementById('tutor-question'),
    mic: document.getElementById('tutor-mic'),
    voiceStatus: document.getElementById('tutor-voice-status'),
    askBtn: document.getElementById('tutor-ask-btn')
  };

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  async function init() {
    try {
      if (!window.KH_DB) throw new Error('Offline storage unavailable');
      const packs = await KH_DB.listPacks();
      const allLessons = [];
      for (const p of packs) {
        const lessons = await KH_DB.lessonsForPack(p.id);
        for (const l of lessons) {
          allLessons.push({
            ...l,
            packName: p.name,
            subjectName: p.subject ? p.subject.name : '',
            subjectIcon: p.subject ? p.subject.icon : '📘'
          });
        }
      }
      state.lessons = allLessons;
      state.filteredLessons = allLessons.slice();

      dom.loading.hidden = true;

      if (state.lessons.length === 0) {
        dom.empty.hidden = false;
        return;
      }

      dom.shell.hidden = false;
      dom.lessonCount.textContent = String(state.lessons.length);
      renderLessonList();
    } catch (err) {
      console.error('Tutor init failed:', err);
      dom.loading.hidden = true;
      dom.empty.hidden = false;
    }
  }

  // ------------------------------------------------------------------
  // Sidebar
  // ------------------------------------------------------------------
  function renderLessonList() {
    dom.lessonList.innerHTML = '';
    for (const lesson of state.filteredLessons) {
      const btn = document.createElement('button');
      btn.className = 'at-lesson-item' + (state.activeLesson && state.activeLesson.id === lesson.id ? ' is-active' : '');
      btn.dataset.id = lesson.id;
      btn.innerHTML = `
        <div class="at-lesson-item-icon" aria-hidden="true">${escapeHtml(lesson.subjectIcon || '📘')}</div>
        <div class="at-lesson-item-body">
          <p class="at-lesson-item-title">${escapeHtml(lesson.title)}</p>
          <p class="at-lesson-item-meta">${escapeHtml(lesson.subjectName || lesson.packName || '')} · ${lesson.level || ''}</p>
        </div>
      `;
      btn.addEventListener('click', () => selectLesson(lesson.id));
      dom.lessonList.appendChild(btn);
    }
  }

  let filterDebounce = null;
  dom.lessonSearch.addEventListener('input', (e) => {
    clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        state.filteredLessons = state.lessons.slice();
      } else {
        state.filteredLessons = state.lessons.filter((l) =>
          l.title.toLowerCase().includes(q) ||
          (l.subjectName || '').toLowerCase().includes(q) ||
          (l.keywords || []).some((k) => k.toLowerCase().includes(q))
        );
      }
      renderLessonList();
    }, 150);
  });

  // ------------------------------------------------------------------
  // Select lesson — defensive display overrides
  // ------------------------------------------------------------------
  function selectLesson(lessonId) {
    const lesson = state.lessons.find((l) => l.id === lessonId);
    if (!lesson) return;

    state.activeLesson = lesson;
    state.conversation = [];

    // Sidebar highlight
    document.querySelectorAll('.at-lesson-item').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.id === lessonId);
    });

    // Header swap
    dom.mainHeadEmpty.hidden = true;
    dom.mainHeadActive.hidden = false;
    dom.activeTitle.textContent = lesson.title;
    dom.activeMeta.textContent =
      `${lesson.subjectName || lesson.packName || ''} · ${lesson.level || ''} · ${lesson.estimatedMinutes || 10} min`;

    // HIDE empty state FIRST — with explicit display:none so it wins
    // even if some future CSS rule tries to force flex on it
    if (dom.mainEmptyHero) {
      dom.mainEmptyHero.hidden = true;
      dom.mainEmptyHero.style.display = 'none';
    }

    // SHOW conversation and input bar with explicit display values
    if (dom.conversation) {
      dom.conversation.hidden = false;
      dom.conversation.style.display = 'flex';
    }
    if (dom.inputBar) {
      dom.inputBar.hidden = false;
      dom.inputBar.style.display = 'block';
    }

    // Enable input
    dom.question.disabled = false;
    dom.askBtn.disabled = false;
    if (dom.mic) dom.mic.disabled = false;

    // Render welcome + action cards
    renderWelcome();

    // Reset conversation scroll
    dom.conversation.scrollTop = 0;
  }

  function renderWelcome() {
    dom.conversation.innerHTML = `
      <div class="at-welcome">
        <div class="at-welcome-icon" aria-hidden="true">✨</div>
        <h3 class="at-welcome-title">Ready when you are</h3>
        <p class="at-welcome-sub">Try one of these, or ask your own question below.</p>
      </div>
      <div class="at-actions" id="action-cards">
        <button class="at-action-card" data-action="explain_simply">
          <div class="at-action-icon" aria-hidden="true">📖</div>
          <div class="at-action-title">Explain Simply</div>
          <div class="at-action-sub">Break it down</div>
        </button>
        <button class="at-action-card" data-action="give_examples">
          <div class="at-action-icon" aria-hidden="true">💡</div>
          <div class="at-action-title">Give Examples</div>
          <div class="at-action-sub">Show me concretely</div>
        </button>
        <button class="at-action-card" data-action="practice_questions">
          <div class="at-action-icon" aria-hidden="true">✏️</div>
          <div class="at-action-title">Practice</div>
          <div class="at-action-sub">Quiz me on this</div>
        </button>
        <button class="at-action-card" data-action="summarize">
          <div class="at-action-icon" aria-hidden="true">📝</div>
          <div class="at-action-title">Summarize</div>
          <div class="at-action-sub">Key takeaways</div>
        </button>
      </div>
    `;

    dom.conversation.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => runAction(btn.dataset.action));
    });
  }

  // ------------------------------------------------------------------
  // Run action
  // ------------------------------------------------------------------
  async function runAction(action) {
    if (!state.activeLesson || state.busy) return;
    state.busy = true;

    const welcome = dom.conversation.querySelector('.at-welcome');
    const actions = dom.conversation.querySelector('#action-cards');
    if (welcome) welcome.remove();
    if (actions) actions.remove();

    const actionLabels = {
      explain_simply: '📖 Explain this simply',
      give_examples: '💡 Give me examples',
      practice_questions: '✏️ Give me practice questions',
      summarize: '📝 Summarize this lesson'
    };
    addUserMessage(actionLabels[action] || action);

    const typing = addTypingIndicator();

    try {
      const lesson = state.activeLesson;
      let entry = null;

      if (lesson.ai && lesson.ai[action]) {
        entry = { ...lesson.ai[action], provider: lesson.ai[action].provider || 'cache' };
      }

      if (!entry && window.KH_IS_ONLINE && window.KH_IS_ONLINE()) {
        try {
          const res = await fetch(`/api/ai/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lessonId: lesson.id, learningDifficulty: 'beginner', language: lesson.language || 'en' })
          });
          if (res.ok) {
            const data = await res.json();
            entry = {
              content: data.data.content,
              provider: data.data.provider,
              confidence: data.data.confidence,
              groundedIn: data.data.groundedIn
            };
          }
        } catch (err) { console.warn('Server AI failed:', err.message); }
      }

      if (!entry) entry = buildTemplate(action, lesson);

      typing.remove();
      addAIMessage(entry);
    } catch (err) {
      typing.remove();
      addAIMessage({ content: `⚠️ ${escapeHtml(err.message)}`, provider: 'template', confidence: 'low' });
    } finally {
      state.busy = false;
      setInputDisabled(false);
    }
  }

  // ------------------------------------------------------------------
  // Ask freeform
  // ------------------------------------------------------------------
  async function askQuestion() {
    const q = dom.question.value.trim();
    if (!q || !state.activeLesson || state.busy) return;

    state.busy = true;
    dom.question.value = '';
    autoResizeTextarea();

    const welcome = dom.conversation.querySelector('.at-welcome');
    const actions = dom.conversation.querySelector('#action-cards');
    if (welcome) welcome.remove();
    if (actions) actions.remove();

    addUserMessage(q);
    setInputDisabled(true);
    const typing = addTypingIndicator();

    try {
      const lesson = state.activeLesson;
      let entry = null;

      if (window.KH_IS_ONLINE && window.KH_IS_ONLINE()) {
        try {
          const res = await fetch('/api/ai/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lessonId: lesson.id, question: q, learningDifficulty: 'beginner' })
          });
          if (res.ok) {
            const data = await res.json();
            entry = {
              content: data.data.content,
              provider: data.data.provider,
              confidence: data.data.confidence,
              groundedIn: data.data.groundedIn
            };
          }
        } catch (err) { console.warn('Online ask failed:', err.message); }
      }

      if (!entry) entry = matchOffline(q, lesson);

      typing.remove();
      addAIMessage(entry);
    } catch (err) {
      typing.remove();
      addAIMessage({ content: `⚠️ ${escapeHtml(err.message)}`, provider: 'template', confidence: 'low' });
    } finally {
      state.busy = false;
      setInputDisabled(false);
    }
  }

  // ------------------------------------------------------------------
  // Message rendering
  // ------------------------------------------------------------------
  function addUserMessage(text) {
    const ts = new Date();
    const el = document.createElement('div');
    el.className = 'at-message at-message-user';
    el.innerHTML = `
      <div class="at-message-avatar" aria-hidden="true">You</div>
      <div class="at-message-bubble">${escapeHtml(text)}</div>
    `;
    dom.conversation.appendChild(el);
    scrollToBottom();
    state.conversation.push({ role: 'user', content: text, ts });
  }

  function addAIMessage(entry) {
    const ts = new Date();
    const sourceMap = {
      provider: { label: '🤖 AI-generated', cls: 'provider' },
      template: { label: '📘 From curriculum notes', cls: 'template' },
      cache:    { label: '✓ Verified answer', cls: 'cache' }
    };
    const badge = sourceMap[entry.provider] || sourceMap.template;
    const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const el = document.createElement('div');
    el.className = 'at-message at-message-ai';
    el.innerHTML = `
      <div class="at-message-avatar" aria-hidden="true">✨</div>
      <div class="at-message-bubble">
        <div class="at-message-meta">
          <span class="at-source-badge ${badge.cls}">${badge.label}</span>
          <span class="at-message-timestamp">${timeStr}</span>
        </div>
        <div>${renderMarkdown(entry.content || '')}</div>
        <p class="at-message-disclaimer">⚠️ Verify with your teacher or textbook.</p>
      </div>
    `;
    dom.conversation.appendChild(el);
    scrollToBottom();
    state.conversation.push({ role: 'ai', content: entry.content, provider: entry.provider, ts });
  }

  function addTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'at-message at-message-ai at-message-typing';
    el.innerHTML = `
      <div class="at-message-avatar" aria-hidden="true">✨</div>
      <div class="at-message-bubble">
        <span class="at-typing-dot"></span>
        <span class="at-typing-dot"></span>
        <span class="at-typing-dot"></span>
      </div>
    `;
    dom.conversation.appendChild(el);
    scrollToBottom();
    return el;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      dom.conversation.scrollTop = dom.conversation.scrollHeight;
    });
  }

  function setInputDisabled(v) {
    dom.question.disabled = v;
    dom.askBtn.disabled = v;
    if (dom.mic) dom.mic.disabled = v;
    if (!v) dom.question.focus();
  }

  // ------------------------------------------------------------------
  // Templates + offline match
  // ------------------------------------------------------------------
  function buildTemplate(action, lesson) {
    const kp = lesson.keyPoints || [];
    const title = lesson.title || 'Lesson';
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
  // Textarea auto-resize
  // ------------------------------------------------------------------
  function autoResizeTextarea() {
    dom.question.style.height = 'auto';
    dom.question.style.height = Math.min(dom.question.scrollHeight, 120) + 'px';
  }

  dom.question.addEventListener('input', autoResizeTextarea);
  dom.question.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askQuestion();
    }
  });

  dom.askBtn.addEventListener('click', askQuestion);

  // ------------------------------------------------------------------
  // Voice input
  // ------------------------------------------------------------------
  if (dom.mic && window.KH_VOICE && window.KH_VOICE.isSupported()) {
    let isListening = false;
    dom.mic.addEventListener('click', async () => {
      if (!state.activeLesson) {
        alert('Select a lesson first');
        return;
      }
      if (isListening) {
        window.KH_VOICE.stopListening();
        isListening = false;
        dom.mic.classList.remove('is-listening', 'is-loading', 'is-transcribing');
        return;
      }
      isListening = true;
      dom.question.value = '';
      dom.voiceStatus.textContent = 'Listening…';
      dom.voiceStatus.className = 'voice-status is-active';

      await window.KH_VOICE.startListening(
        (text) => {
          isListening = false;
          dom.question.value = text;
          dom.mic.classList.remove('is-listening', 'is-loading', 'is-transcribing');
          dom.voiceStatus.textContent = `Heard: "${text}"`;
          dom.voiceStatus.className = 'voice-status';
          autoResizeTextarea();
          setTimeout(() => askQuestion(), 150);
        },
        (err) => {
          isListening = false;
          dom.mic.classList.remove('is-listening', 'is-loading', 'is-transcribing');
          dom.voiceStatus.textContent = err;
          dom.voiceStatus.className = 'voice-status is-error';
          setTimeout(() => { dom.voiceStatus.textContent = ''; }, 5000);
        },
        (mode, message) => {
          dom.mic.classList.remove('is-listening', 'is-loading', 'is-transcribing');
          if (mode === 'listening') {
            dom.mic.classList.add('is-listening');
            dom.voiceStatus.textContent = message || 'Listening…';
            dom.voiceStatus.className = 'voice-status is-active';
          } else if (mode === 'loading') {
            dom.mic.classList.add('is-loading');
            dom.voiceStatus.textContent = message || 'Loading model…';
            dom.voiceStatus.className = 'voice-status is-active';
          } else if (mode === 'transcribing') {
            dom.mic.classList.add('is-transcribing');
            dom.voiceStatus.textContent = message || 'Transcribing…';
            dom.voiceStatus.className = 'voice-status is-active';
          } else if (mode === 'error') {
            dom.voiceStatus.className = 'voice-status is-error';
          }
        }
      );
    });
  } else if (dom.mic) {
    dom.mic.disabled = true;
    dom.mic.title = 'Voice input not supported';
  }

  // ------------------------------------------------------------------
  // Start
  // ------------------------------------------------------------------
    // Render voice pack button (if needed)
  if (window.KH_VOICE_PACK) {
    window.KH_VOICE_PACK.renderVoicePack('voice-pack-container');
  }


  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();