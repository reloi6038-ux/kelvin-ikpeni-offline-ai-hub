// public/js/dashboard.js — Premium student dashboard
(function () {
  'use strict';

  const state = {
    packs: [],
    lessons: [],
    quizzes: [],
    attempts: []
  };

  const dom = {
    greetingEmoji: document.getElementById('db-greeting-emoji'),
    greetingText: document.getElementById('db-greeting-text'),
    loading: document.getElementById('db-loading'),
    content: document.getElementById('db-content'),
    empty: document.getElementById('db-empty'),
    syncIndicator: document.getElementById('db-sync-indicator'),
    streakBadge: document.getElementById('db-streak-badge'),
    streakValue: document.getElementById('db-streak-value'),
    streakDays: document.getElementById('db-streak-days'),
    statAttempts: document.getElementById('stat-attempts'),
    statAvg: document.getElementById('stat-avg'),
    statPacks: document.getElementById('stat-packs'),
    statLessons: document.getElementById('stat-lessons'),
    circleFill: document.getElementById('db-circle-fill'),
    continueList: document.getElementById('db-continue-list'),
    weakTopics: document.getElementById('db-weak-topics'),
    timeline: document.getElementById('db-timeline'),
    pendingSection: document.getElementById('db-pending-section'),
    pendingText: document.getElementById('db-pending-text'),
    syncBtn: document.getElementById('db-sync-btn'),
    storageFill: document.getElementById('db-storage-fill'),
    storageUsed: document.getElementById('db-storage-used'),
    storageCount: document.getElementById('db-storage-count'),
    packList: document.getElementById('db-pack-list')
  };

  // ------------------------------------------------------------------
  // Time-aware greeting
  // ------------------------------------------------------------------
  function setGreeting() {
    const hour = new Date().getHours();
    let emoji = '👋';
    let text = 'Welcome back';
    if (hour < 12) { emoji = '☀️'; text = 'Good morning'; }
    else if (hour < 18) { emoji = '👋'; text = 'Good afternoon'; }
    else { emoji = '🌙'; text = 'Good evening'; }
    if (dom.greetingEmoji) dom.greetingEmoji.textContent = emoji;
    if (dom.greetingText) dom.greetingText.textContent = text;
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  async function init() {
    setGreeting();
    try {
      if (!window.KH_DB) throw new Error('Offline storage unavailable');
      state.packs = await KH_DB.listPacks();
      state.attempts = await KH_DB.getAll('attempts');
      state.quizzes = await KH_DB.getAll('quizzes');

      const lessonLists = await Promise.all(state.packs.map((p) => KH_DB.lessonsForPack(p.id)));
      state.lessons = lessonLists.flat();

      dom.loading.hidden = true;

      if (state.packs.length === 0) {
        dom.empty.hidden = false;
        return;
      }

      dom.content.hidden = false;
      renderAll();
      observeReveal();
    } catch (err) {
      console.error('Dashboard init failed:', err);
      dom.loading.hidden = true;
      dom.empty.hidden = false;
    }
  }

  function renderAll() {
    renderStats();
    renderStreak();
    renderContinue();
    renderWeakTopics();
    renderTimeline();
    renderPending();
    renderStorage();
  }

  // ------------------------------------------------------------------
  // Stats
  // ------------------------------------------------------------------
  function renderStats() {
    dom.statPacks.textContent = String(state.packs.length);
    dom.statLessons.textContent = String(state.lessons.length);
    dom.statAttempts.textContent = String(state.attempts.length);

    const percents = state.attempts.map((a) =>
      a.serverResponse && a.serverResponse.percent != null
        ? a.serverResponse.percent
        : (a.localPercent || 0)
    ).filter((p) => Number.isFinite(p));

    if (percents.length === 0) {
      dom.statAvg.textContent = '—';
    } else {
      const avg = Math.round(percents.reduce((s, p) => s + p, 0) / percents.length);
      dom.statAvg.textContent = avg + '%';

      // Animate circular progress
      // circumference = 2πr = 2π×26 ≈ 163.36
      const circumference = 163.36;
      const dashoffset = circumference - (avg / 100) * circumference;
      setTimeout(() => {
        dom.circleFill.style.strokeDashoffset = dashoffset;
      }, 200);
    }
  }

  // ------------------------------------------------------------------
  // Streak with day pills
  // ------------------------------------------------------------------
  function renderStreak() {
    const streak = computeStreak(state.attempts);
    if (streak === 0) {
      dom.streakBadge.hidden = true;
      return;
    }
    dom.streakBadge.hidden = false;
    dom.streakValue.textContent = String(streak);

    // Build day pills: last 7 days
    const days = new Set();
    for (const a of state.attempts) {
      const ts = a.clientTimestamp || a.savedAt;
      if (!ts) continue;
      try { days.add(new Date(ts).toISOString().slice(0, 10)); } catch {}
    }

    const pills = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const isActive = days.has(key);
      const isToday = i === 0;
      const dayLabel = d.toLocaleDateString('en', { weekday: 'narrow' });
      pills.push(`<div class="db-streak-pill ${isActive ? 'is-active' : ''} ${isToday ? 'is-today' : ''}" title="${key}${isActive ? ' ✓' : ''}">${dayLabel}</div>`);
    }
    dom.streakDays.innerHTML = pills.join('');
  }

  function computeStreak(attempts) {
    if (attempts.length === 0) return 0;
    const days = new Set();
    for (const a of attempts) {
      const ts = a.clientTimestamp || a.savedAt;
      if (!ts) continue;
      try { days.add(new Date(ts).toISOString().slice(0, 10)); } catch {}
    }
    if (days.size === 0) return 0;
    const sorted = [...days].sort().reverse();
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (sorted[0] !== today && sorted[0] !== yesterday) return 0;
    let streak = 1;
    let cursor = new Date(sorted[0]);
    for (let i = 1; i < sorted.length; i++) {
      cursor.setDate(cursor.getDate() - 1);
      if (sorted[i] === cursor.toISOString().slice(0, 10)) streak++;
      else break;
    }
    return streak;
  }

  // ------------------------------------------------------------------
  // Continue learning
  // ------------------------------------------------------------------
  function renderContinue() {
    dom.continueList.innerHTML = '';
    const candidates = state.lessons.slice(0, 4);
    if (candidates.length === 0) {
      dom.continueList.innerHTML = '<p class="db-card-hint">No lessons yet. Download a pack to start.</p>';
      return;
    }
    for (const lesson of candidates) {
      const pack = state.packs.find((p) => p.id === lesson.packId);
      const a = document.createElement('a');
      a.className = 'db-continue-item';
      a.href = `/pages/offline-library.html?lesson=${encodeURIComponent(lesson.id)}`;
      a.innerHTML = `
        <div class="db-continue-icon" aria-hidden="true">${escapeHtml((pack && pack.subject && pack.subject.icon) || '📘')}</div>
        <div class="db-continue-body">
          <h3 class="db-continue-title">${escapeHtml(lesson.title)}</h3>
          <p class="db-continue-meta">${escapeHtml(pack ? pack.name : '')} · ${lesson.estimatedMinutes || 10} min</p>
        </div>
        <div class="db-continue-arrow" aria-hidden="true">→</div>
      `;
      dom.continueList.appendChild(a);
    }
  }

  // ------------------------------------------------------------------
  // Weak topics
  // ------------------------------------------------------------------
  function renderWeakTopics() {
    const missed = new Map();
    for (const attempt of state.attempts) {
      const quiz = state.quizzes.find((q) => q.id === attempt.quizId);
      if (!quiz) continue;
      for (const a of attempt.answers || []) {
        if (a.selectedIndex === undefined || a.selectedIndex < 0) continue;
        const q = quiz.questions[a.questionIndex];
        if (!q) continue;
        if (a.selectedIndex !== q.correctIndex) {
          const topic = deriveTopic(q, quiz);
          if (topic) missed.set(topic, (missed.get(topic) || 0) + 1);
        }
      }
    }

    if (missed.size === 0) {
      dom.weakTopics.innerHTML = `<p class="db-card-hint">${state.attempts.length === 0 ? 'Take a quiz to see your focus areas.' : '🎉 No weak topics detected — great work!'}</p>`;
      return;
    }

    const topics = [...missed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    dom.weakTopics.innerHTML = topics.map(([topic, count]) => `
      <span class="db-weak-chip">
        <span class="db-weak-chip-icon" aria-hidden="true">🎯</span>
        ${escapeHtml(topic)}
        <span class="db-weak-chip-count">${count}</span>
      </span>
    `).join('');
  }

  function deriveTopic(question, quiz) {
    const base = quiz.title || 'Quiz';
    const words = String(question.questionText || '').toLowerCase().match(/[a-z]{4,}/g) || [];
    const STOP = new Set(['what','which','when','where','would','could','should','true','false','answer','option']);
    const significant = words.filter((w) => !STOP.has(w)).slice(0, 2);
    return significant.length > 0 ? `${base}: ${significant.join(' ')}` : base;
  }

  // ------------------------------------------------------------------
  // Timeline
  // ------------------------------------------------------------------
  function renderTimeline() {
    if (state.attempts.length === 0) {
      dom.timeline.innerHTML = '<p class="db-card-hint"><a href="/pages/quizzes.html">Take your first quiz →</a></p>';
      return;
    }
    const sorted = state.attempts.slice().sort((a, b) => {
      const ta = new Date(a.clientTimestamp || a.savedAt || 0).getTime();
      const tb = new Date(b.clientTimestamp || b.savedAt || 0).getTime();
      return tb - ta;
    }).slice(0, 6);

    dom.timeline.innerHTML = sorted.map((a) => {
      const quiz = state.quizzes.find((q) => q.id === a.quizId);
      const title = quiz ? quiz.title : 'Quiz';
      const percent = (a.serverResponse && a.serverResponse.percent != null)
        ? a.serverResponse.percent
        : (a.localPercent || 0);
      const cls = percent >= 70 ? 'great' : (percent >= 40 ? 'ok' : 'low');
      const when = formatRelativeTime(a.clientTimestamp || a.savedAt);
      return `
        <div class="db-timeline-item">
          <div class="db-timeline-dot ${cls}" aria-hidden="true"></div>
          <div class="db-timeline-body">
            <p class="db-timeline-title">
              ${escapeHtml(title)}
              <span class="db-timeline-badge ${cls}">${percent}%</span>
            </p>
            <p class="db-timeline-meta">${escapeHtml(when)}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  function formatRelativeTime(ts) {
    if (!ts) return '';
    const t = new Date(ts).getTime();
    if (!Number.isFinite(t)) return '';
    const diff = Date.now() - t;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  // ------------------------------------------------------------------
  // Pending
  // ------------------------------------------------------------------
  async function renderPending() {
    try {
      const pending = await KH_DB.getPendingAttempts();
      if (pending.length === 0) { dom.pendingSection.hidden = true; return; }
      dom.pendingSection.hidden = false;
      dom.pendingText.textContent = `${pending.length} quiz attempt${pending.length === 1 ? '' : 's'} will sync automatically when online.`;
    } catch (err) {
      console.warn('Pending check failed:', err.message);
      dom.pendingSection.hidden = true;
    }
  }

  if (dom.syncBtn) {
    dom.syncBtn.addEventListener('click', async () => {
      dom.syncBtn.disabled = true;
      dom.syncBtn.textContent = 'Syncing…';
      try {
        if (window.KH_SYNC) await KH_SYNC.syncNow();
        await renderPending();
        renderStats();
        renderTimeline();
      } catch (err) {
        alert('Sync failed: ' + err.message);
      } finally {
        dom.syncBtn.disabled = false;
        dom.syncBtn.textContent = 'Sync now';
      }
    });
  }

  // ------------------------------------------------------------------
  // Storage + pack list
  // ------------------------------------------------------------------
  async function renderStorage() {
    dom.packList.innerHTML = '';
    for (const pack of state.packs.slice(0, 5)) {
      const div = document.createElement('div');
      div.className = 'db-pack-item';
      div.innerHTML = `
        <span class="db-pack-icon" aria-hidden="true">${escapeHtml((pack.subject && pack.subject.icon) || '📘')}</span>
        <span class="db-pack-title">${escapeHtml(pack.name)}</span>
        <span class="db-pack-size">${Math.round((pack.sizeBytes || 0) / 1024)} KB</span>
      `;
      dom.packList.appendChild(div);
    }
    if (state.packs.length > 5) {
      const more = document.createElement('div');
      more.className = 'db-pack-item';
      more.style.background = 'transparent';
      more.style.fontSize = '0.72rem';
      more.style.color = 'var(--text-muted)';
      more.textContent = `+ ${state.packs.length - 5} more pack(s)`;
      dom.packList.appendChild(more);
    }
    try {
      const est = await KH_DB.getStorageEstimate();
      const used = est.usage || 0;
      const quota = est.quota || 1;
      const pct = Math.min(100, (used / quota) * 100);
      if (dom.storageFill) dom.storageFill.style.width = Math.max(1, pct) + '%';
      if (dom.storageUsed) dom.storageUsed.textContent = formatBytes(used) + ' used';
      if (dom.storageCount) dom.storageCount.textContent = `${state.packs.length} pack${state.packs.length !== 1 ? 's' : ''}`;
    } catch (err) {
      console.warn('Storage estimate failed:', err.message);
    }
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ------------------------------------------------------------------
  // Scroll reveal
  // ------------------------------------------------------------------
  function observeReveal() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isDataSaver = document.documentElement.classList.contains('data-saver');
    const items = document.querySelectorAll('[data-reveal]');
    if (prefersReducedMotion || isDataSaver || !('IntersectionObserver' in window)) {
      items.forEach((i) => i.classList.add('is-visible'));
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
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    items.forEach((i) => observer.observe(i));
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  window.addEventListener('kh:sync-complete', () => {
    if (dom.syncIndicator) dom.syncIndicator.hidden = true;
    renderPending();
    renderStats();
    renderTimeline();
  });
  window.addEventListener('kh:sync-failed', () => {
    if (dom.syncIndicator) dom.syncIndicator.hidden = true;
  });
  window.addEventListener('kh:attempt-saved', () => {
    if (dom.syncIndicator) dom.syncIndicator.hidden = false;
    setTimeout(() => { if (dom.syncIndicator) dom.syncIndicator.hidden = true; }, 4000);
  });

  // ------------------------------------------------------------------
  // Utils
  // ------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();