// public/js/courses.js — Courses page
(function () {
  'use strict';

  const state = {
    subjects: [],
    lessonsBySubject: new Map(),
    loading: true,
    filters: { curriculum: '', level: '', search: '' }
  };

  const dom = {
    loading: document.getElementById('courses-loading'),
    error: document.getElementById('courses-error'),
    errorMessage: document.getElementById('courses-error-message'),
    empty: document.getElementById('courses-empty'),
    grid: document.getElementById('subject-grid'),
    filterCurriculum: document.getElementById('filter-curriculum'),
    filterLevel: document.getElementById('filter-level'),
    filterSearch: document.getElementById('filter-search'),
    retryBtn: document.getElementById('courses-retry-btn'),
    clearBtn: document.getElementById('courses-clear-btn')
  };

  async function init() {
    try {
      dom.loading.hidden = false;
      dom.error.hidden = true;
      dom.empty.hidden = true;
      dom.grid.hidden = true;

      const res = await fetch('/api/subjects?limit=50');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      state.subjects = json.data || [];

      // Prefetch lessons for each subject (in parallel, small requests)
      const lessonResults = await Promise.allSettled(
        state.subjects.map(async (s) => {
          const r = await fetch(`/api/subjects/${s.slug}/lessons?limit=5`);
          if (!r.ok) return [];
          const j = await r.json();
          return j.data || [];
        })
      );
      state.subjects.forEach((s, i) => {
        const result = lessonResults[i];
        state.lessonsBySubject.set(s._id, result.status === 'fulfilled' ? result.value : []);
      });

      dom.loading.hidden = true;
      render();
    } catch (err) {
      console.error('Courses load failed:', err);
      dom.loading.hidden = true;
      dom.error.hidden = false;
      dom.errorMessage.textContent = err.message || 'Network error';
    }
  }

  function applyFilters() {
    return state.subjects.filter((s) => {
      if (state.filters.curriculum && s.curriculum !== state.filters.curriculum) return false;
      if (state.filters.level && !(s.levels || []).includes(state.filters.level)) return false;
      if (state.filters.search) {
        const q = state.filters.search.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !(s.description || '').toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }

  function render() {
    const filtered = applyFilters();
    if (filtered.length === 0) {
      dom.grid.hidden = true;
      dom.empty.hidden = false;
      return;
    }
    dom.empty.hidden = true;
    dom.error.hidden = true;
    dom.grid.hidden = false;
    dom.grid.innerHTML = '';

    for (const subject of filtered) {
      dom.grid.appendChild(renderSubjectCard(subject));
    }
  }

  function renderSubjectCard(subject) {
    const lessons = state.lessonsBySubject.get(subject._id) || [];
    const card = document.createElement('div');
    card.className = 'subject-card';

    const lessonsHTML = lessons.length === 0
      ? '<p class="subject-description">No lessons yet — check back soon.</p>'
      : `
        <div class="subject-lessons">
          ${lessons.map((l) => `
            <a class="subject-lesson-link" href="/pages/offline-library.html?lesson=${encodeURIComponent(l._id)}">
              <span>${escapeHtml(l.title)}</span>
              <span class="duration">${l.estimatedMinutes || 10} min</span>
            </a>
          `).join('')}
        </div>
      `;

    card.innerHTML = `
      <div class="subject-icon" aria-hidden="true">${escapeHtml(subject.icon || '📘')}</div>
      <h3>${escapeHtml(subject.name)}</h3>
      <p class="subject-meta">
        <span>📚 ${subject.lessonCount || lessons.length} ${(subject.lessonCount || lessons.length) === 1 ? 'lesson' : 'lessons'}</span>
        <span>🎓 ${(subject.levels || []).join(', ') || '—'}</span>
        <span>📖 ${escapeHtml(subject.curriculum || 'Nigerian')}</span>
      </p>
      <p class="subject-description">${escapeHtml(subject.description || '')}</p>
      ${lessonsHTML}
    `;
    return card;
  }

  // Filters
  dom.filterCurriculum.addEventListener('change', (e) => {
    state.filters.curriculum = e.target.value;
    render();
  });
  dom.filterLevel.addEventListener('change', (e) => {
    state.filters.level = e.target.value;
    render();
  });
  let searchDebounce = null;
  dom.filterSearch.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.filters.search = e.target.value.trim();
      render();
    }, 200);
  });
  dom.retryBtn.addEventListener('click', init);
  dom.clearBtn.addEventListener('click', () => {
    state.filters = { curriculum: '', level: '', search: '' };
    dom.filterCurriculum.value = '';
    dom.filterLevel.value = '';
    dom.filterSearch.value = '';
    render();
  });

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();