// public/js/quiz-runner.js — Premium quiz engine
(function () {
  'use strict';

  const state = {
    quizzes: [],
    attempts: new Map(),
    current: null,
    answers: [],
    currentIndex: 0,
    clientId: null,
    startedAt: null,
    timerHandle: null,
    secondsRemaining: 0,
    startTimeSeconds: 0,
    submitted: false
  };

  const dom = {
    viewList: document.getElementById('view-list'),
    viewRunner: document.getElementById('view-runner'),
    viewResults: document.getElementById('view-results'),
    loading: document.getElementById('list-loading'),
    empty: document.getElementById('list-empty'),
    listGrid: document.getElementById('list-grid'),
    pendingPanel: document.getElementById('pending-panel'),
    pendingCount: document.getElementById('pending-count'),
    pendingLabel: document.getElementById('pending-label'),
    syncNowBtn: document.getElementById('sync-now-btn'),
    exitRunner: document.getElementById('exit-runner'),
    runnerTitle: document.getElementById('runner-title'),
    runnerSub: document.getElementById('runner-sub'),
    runnerTimer: document.getElementById('runner-timer'),
    timerValue: document.getElementById('timer-value'),
    runnerQuestionWrap: document.getElementById('runner-question-wrap'),
    runnerDots: document.getElementById('runner-dots'),
    runnerProgressFill: document.getElementById('runner-progress-fill'),
    runnerBody: document.getElementById('runner-body'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    submitBtn: document.getElementById('submit-btn'),
    resultsContent: document.getElementById('results-content')
  };

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  async function init() {
    try {
      if (!window.KH_DB) throw new Error('Offline storage unavailable');
      const packs = await KH_DB.listPacks();
      const quizLists = await Promise.all(packs.map((p) => KH_DB.quizzesForPack(p.id)));
      state.quizzes = quizLists.flat();

      const allAttempts = await KH_DB.getAll('attempts');
      for (const a of allAttempts) {
        if (!a.quizId) continue;
        const existing = state.attempts.get(a.quizId);
        const percent = (a.serverResponse && a.serverResponse.percent != null)
          ? a.serverResponse.percent
          : (a.localPercent || 0);
        if (!existing || percent > existing.percent) {
          state.attempts.set(a.quizId, { percent });
        }
      }

      dom.loading.hidden = true;
      renderList();
      await updatePendingPanel();
      handleDeepLink();
    } catch (err) {
      console.error('Quiz init failed:', err);
      dom.loading.hidden = true;
      dom.empty.hidden = false;
    }
  }

  function handleDeepLink() {
    const quizId = new URLSearchParams(location.search).get('quiz');
    if (!quizId) return;
    const quiz = state.quizzes.find((q) => q.id === quizId);
    if (quiz) startQuiz(quiz.id);
  }

  // ------------------------------------------------------------------
  // List view
  // ------------------------------------------------------------------
  function renderList() {
    if (state.quizzes.length === 0) {
      dom.empty.hidden = false;
      dom.listGrid.hidden = true;
      return;
    }
    dom.empty.hidden = true;
    dom.listGrid.hidden = false;
    dom.listGrid.innerHTML = '';

    for (const quiz of state.quizzes) {
      const card = document.createElement('article');
      card.className = 'qz-card';

      const best = state.attempts.get(quiz.id);
      let bestBadge = '';
      if (best) {
        const cls = best.percent >= 70 ? 'great' : (best.percent >= 40 ? 'ok' : 'low');
        bestBadge = `<span class="qz-best-badge ${cls}">🏆 Best: ${best.percent}%</span>`;
      }

      card.innerHTML = `
        <div class="qz-card-head">
          <div class="qz-card-icon" aria-hidden="true">✏️</div>
          <div class="qz-card-titles">
            <h3 class="qz-card-title">${escapeHtml(quiz.title)}</h3>
            <p class="qz-card-meta">
              <span>📝 ${quiz.questions.length} question${quiz.questions.length !== 1 ? 's' : ''}</span>
              <span>🎯 ${quiz.passingScore || 70}% to pass</span>
              ${quiz.timeLimitMinutes ? `<span>⏱ ${quiz.timeLimitMinutes} min</span>` : ''}
            </p>
          </div>
        </div>
        ${bestBadge}
        <div class="qz-card-actions">
          <button class="qz-start-btn">${best ? 'Retake Quiz →' : 'Start Quiz →'}</button>
        </div>
      `;

      card.querySelector('.qz-start-btn').addEventListener('click', () => startQuiz(quiz.id));
      dom.listGrid.appendChild(card);
    }

    observeCards();
  }

  async function updatePendingPanel() {
    try {
      const pending = await KH_DB.getPendingAttempts();
      if (pending.length === 0) { dom.pendingPanel.hidden = true; return; }
      dom.pendingPanel.hidden = false;
      dom.pendingCount.textContent = String(pending.length);
      dom.pendingLabel.textContent = pending.length === 1 ? 'quiz waiting to sync' : 'quizzes waiting to sync';
    } catch {
      dom.pendingPanel.hidden = true;
    }
  }

  // ------------------------------------------------------------------
  // Start quiz
  // ------------------------------------------------------------------
  async function startQuiz(quizId) {
    const quiz = await KH_DB.getQuiz(quizId);
    if (!quiz) { alert('Quiz not found in offline storage.'); return; }

    state.current = quiz;
    state.answers = new Array(quiz.questions.length).fill(-1);
    state.currentIndex = 0;
    state.clientId = generateClientId();
    state.startedAt = new Date().toISOString();
    state.submitted = false;

    // Timer
    if (state.timerHandle) clearInterval(state.timerHandle);
    if (quiz.timeLimitMinutes > 0) {
      state.secondsRemaining = quiz.timeLimitMinutes * 60;
      state.startTimeSeconds = state.secondsRemaining;
      dom.runnerTimer.hidden = false;
      updateTimerDisplay();
      state.timerHandle = setInterval(() => {
        state.secondsRemaining -= 1;
        if (state.secondsRemaining <= 0) {
          clearInterval(state.timerHandle);
          submitQuiz(true);
          return;
        }
        updateTimerDisplay();
      }, 1000);
    } else {
      dom.runnerTimer.hidden = true;
    }

    // Switch views
    dom.viewList.hidden = true;
    dom.viewResults.hidden = true;
    dom.viewRunner.hidden = false;
    document.body.style.overflow = 'hidden';

    dom.runnerTitle.textContent = quiz.title;
    renderDots();
    renderQuestion();
    updateRunnerProgress();
  }

  function updateTimerDisplay() {
    const m = Math.floor(state.secondsRemaining / 60);
    const s = state.secondsRemaining % 60;
    dom.timerValue.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    dom.runnerTimer.classList.remove('is-warning', 'is-critical');
    const pct = state.startTimeSeconds > 0 ? state.secondsRemaining / state.startTimeSeconds : 1;
    if (state.secondsRemaining <= 10) dom.runnerTimer.classList.add('is-critical');
    else if (pct < 0.25) dom.runnerTimer.classList.add('is-warning');
  }

  // ------------------------------------------------------------------
  // Question render
  // ------------------------------------------------------------------
  function renderQuestion() {
    const quiz = state.current;
    const idx = state.currentIndex;
    const q = quiz.questions[idx];
    const selected = state.answers[idx];

    dom.runnerSub.textContent = `Question ${idx + 1} of ${quiz.questions.length}`;

    dom.runnerQuestionWrap.innerHTML = `
      <p class="qz-question-num">Question ${idx + 1}</p>
      <p class="qz-question-text">${escapeHtml(q.questionText)}</p>
      <ul class="qz-options" role="radiogroup">
        ${q.options.map((opt, i) => `
          <li>
            <button type="button" class="qz-option ${i === selected ? 'is-selected' : ''}"
                    role="radio" aria-checked="${i === selected ? 'true' : 'false'}"
                    data-opt="${i}">
              <span class="qz-letter">${String.fromCharCode(65 + i)}</span>
              <span class="qz-option-text">${escapeHtml(opt)}</span>
            </button>
          </li>
        `).join('')}
      </ul>
    `;

    dom.runnerQuestionWrap.querySelectorAll('.qz-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.answers[idx] = Number(btn.dataset.opt);
        renderQuestion();
        renderDots();
        updateNavState();
      });
    });

    dom.runnerBody.scrollTop = 0;
    updateNavState();
  }

  function updateNavState() {
    const quiz = state.current;
    const allAnswered = state.answers.every((a) => a >= 0);
    const isLast = state.currentIndex === quiz.questions.length - 1;

    dom.prevBtn.disabled = state.currentIndex === 0;
    dom.nextBtn.hidden = isLast;
    dom.submitBtn.hidden = !isLast;
    dom.submitBtn.disabled = !allAnswered;
    dom.submitBtn.textContent = allAnswered ? 'Submit Quiz' : `${state.answers.filter(a => a >= 0).length} of ${quiz.questions.length} answered`;
  }

  function updateRunnerProgress() {
    const quiz = state.current;
    const pct = ((state.currentIndex + 1) / quiz.questions.length) * 100;
    dom.runnerProgressFill.style.width = pct + '%';
  }

  function renderDots() {
    const quiz = state.current;
    dom.runnerDots.innerHTML = quiz.questions.map((_, i) => {
      const cls = ['qz-dot'];
      if (state.answers[i] >= 0) cls.push('is-answered');
      if (i === state.currentIndex) cls.push('is-current');
      return `<button class="${cls.join(' ')}" data-goto="${i}" aria-label="Go to question ${i + 1}"></button>`;
    }).join('');

    dom.runnerDots.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.currentIndex = Number(btn.dataset.goto);
        renderQuestion();
        renderDots();
        updateRunnerProgress();
      });
    });
  }

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------
  async function submitQuiz(autoSubmitted = false) {
    if (state.submitted) return;
    state.submitted = true;
    if (state.timerHandle) clearInterval(state.timerHandle);
    const quiz = state.current;

    const answers = quiz.questions.map((q, i) => {
      const selectedIndex = state.answers[i] >= 0 ? state.answers[i] : -1;
      return { questionIndex: i, selectedIndex, isCorrect: selectedIndex === q.correctIndex };
    });

    const correctCount = answers.filter((a) => a.isCorrect).length;
    const percent = Math.round((correctCount / quiz.questions.length) * 100);

    const attemptRecord = {
      id: state.clientId,
      quizId: quiz.id,
      lessonId: quiz.lessonId || null,
      answers: answers.map((a) => ({ questionIndex: a.questionIndex, selectedIndex: a.selectedIndex })),
      clientTimestamp: state.startedAt,
      localScore: correctCount,
      localTotal: quiz.questions.length,
      localPercent: percent
    };

    try { await KH_DB.saveAttempt(attemptRecord); }
    catch (err) { console.error('Save attempt failed:', err); }

    state.attempts.set(quiz.id, { percent });

    showResults(quiz, answers, correctCount, percent, autoSubmitted);

    window.dispatchEvent(new CustomEvent('kh:attempt-saved', {
      detail: { clientId: state.clientId, quizId: quiz.id, percent }
    }));

    setTimeout(updatePendingPanel, 1500);
  }

  // ------------------------------------------------------------------
  // Results
  // ------------------------------------------------------------------
  function showResults(quiz, answers, correctCount, percent, autoSubmitted) {
    const total = quiz.questions.length;
    const passed = percent >= (quiz.passingScore || 70);
    const scoreCls = percent >= 70 ? 'great' : (percent >= 40 ? 'ok' : 'low');
    const circumference = 2 * Math.PI * 70; // r=70

    const message = percent === 100 ? 'Perfect score! 🎉'
      : percent >= 70 ? 'Great job — you passed!'
      : percent >= 40 ? 'Good attempt. Review and retry.'
      : 'Keep practicing. Read the lesson and try again.';

    const onlineNow = (window.KH_IS_ONLINE && window.KH_IS_ONLINE()) || navigator.onLine;
    const syncMsg = onlineNow ? '⏳ Syncing to server…' : '💾 Saved offline. Will sync when you reconnect.';

    dom.resultsContent.innerHTML = `
      <div class="qz-score-block">
        <div class="qz-score-circle">
          <svg class="qz-score-svg" viewBox="0 0 160 160">
            <circle class="qz-score-track" cx="80" cy="80" r="70"/>
            <circle class="qz-score-fill ${scoreCls}" cx="80" cy="80" r="70" id="result-circle"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"/>
          </svg>
          <div class="qz-score-text">
            <div class="qz-score-value ${scoreCls}" id="result-score">0%</div>
            <div class="qz-score-of">${correctCount} of ${total}</div>
          </div>
        </div>
        <p class="qz-result-message">${autoSubmitted ? "⏰ Time's up!" : message}</p>
        <p class="qz-result-sub">${passed ? '✓ Passed' : 'Below passing score (need ' + (quiz.passingScore || 70) + '%)'}</p>
        <span class="qz-sync-badge pending" id="sync-status-badge">${syncMsg}</span>
      </div>

      <div class="qz-result-list">
        ${quiz.questions.map((q, i) => {
          const a = answers[i];
          const selectedText = a.selectedIndex >= 0 ? q.options[a.selectedIndex] : '(no answer)';
          const correctText = q.options[q.correctIndex];
          return `
            <div class="qz-result-item ${a.isCorrect ? 'correct' : 'wrong'}">
              <div class="qz-result-head">
                <div class="qz-result-icon">${a.isCorrect ? '✓' : '✗'}</div>
                <p class="qz-result-question">${escapeHtml(q.questionText)}</p>
              </div>
              <p class="qz-result-answer">
                Your answer: <strong>${escapeHtml(selectedText)}</strong>
                ${a.isCorrect ? '' : ` · Correct: <strong>${escapeHtml(correctText)}</strong>`}
              </p>
              ${q.explanation ? `<p class="qz-result-explanation">💡 ${escapeHtml(q.explanation)}</p>` : ''}
            </div>
          `;
        }).join('')}
      </div>

      <div class="qz-results-actions">
        <button class="btn btn-primary" id="retake-btn">Retake Quiz</button>
        <button class="btn btn-secondary" id="back-btn">Back to Quizzes</button>
      </div>
    `;

    dom.viewRunner.hidden = true;
    dom.viewResults.hidden = false;
    dom.viewList.hidden = true;
    document.body.style.overflow = '';

    // Animate score
    setTimeout(() => {
      const circle = document.getElementById('result-circle');
      if (circle) {
        const offset = circumference - (percent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
      }
      const scoreEl = document.getElementById('result-score');
      if (scoreEl) {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isDataSaver = document.documentElement.classList.contains('data-saver');
        if (prefersReducedMotion || isDataSaver) {
          scoreEl.textContent = percent + '%';
        } else {
          animateNumber(scoreEl, 0, percent, 1200);
        }
      }
    }, 100);

    document.getElementById('retake-btn').addEventListener('click', () => startQuiz(quiz.id));
    document.getElementById('back-btn').addEventListener('click', backToList);

    const onSyncComplete = () => {
      const badge = document.getElementById('sync-status-badge');
      if (badge) {
        badge.textContent = '✓ Synced to server';
        badge.classList.remove('pending');
        badge.classList.add('synced');
      }
      window.removeEventListener('kh:sync-complete', onSyncComplete);
    };
    window.addEventListener('kh:sync-complete', onSyncComplete);
  }

  function animateNumber(el, from, to, duration) {
    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(from + (to - from) * eased) + '%';
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------
  function backToList() {
    if (state.timerHandle) clearInterval(state.timerHandle);
    state.current = null;
    state.answers = [];
    state.currentIndex = 0;
    state.clientId = null;
    state.submitted = false;
    dom.viewRunner.hidden = true;
    dom.viewResults.hidden = true;
    dom.viewList.hidden = false;
    document.body.style.overflow = '';
    renderList();
    updatePendingPanel();
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------
  // Utils
  // ------------------------------------------------------------------
  function generateClientId() {
    if (window.crypto && crypto.randomUUID) {
      return 'q_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    }
    return 'q_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function observeCards() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isDataSaver = document.documentElement.classList.contains('data-saver');
    const cards = dom.listGrid.querySelectorAll('.qz-card');
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
  // Events
  // ------------------------------------------------------------------
  dom.prevBtn.addEventListener('click', () => {
    if (state.currentIndex > 0) {
      state.currentIndex--;
      renderQuestion();
      renderDots();
      updateRunnerProgress();
    }
  });

  dom.nextBtn.addEventListener('click', () => {
    if (state.currentIndex < state.current.questions.length - 1) {
      state.currentIndex++;
      renderQuestion();
      renderDots();
      updateRunnerProgress();
    }
  });

  dom.submitBtn.addEventListener('click', () => {
    const unanswered = state.answers.filter((a) => a < 0).length;
    if (unanswered > 0) {
      if (!confirm(`You have ${unanswered} unanswered question${unanswered !== 1 ? 's' : ''}. Submit anyway?`)) return;
    }
    submitQuiz(false);
  });

  dom.exitRunner.addEventListener('click', () => {
    if (state.answers.some((a) => a >= 0) && !state.submitted) {
      if (!confirm('Exit quiz? Your answers will not be saved.')) return;
    }
    backToList();
  });

  dom.syncNowBtn.addEventListener('click', async () => {
    dom.syncNowBtn.disabled = true;
    dom.syncNowBtn.textContent = 'Syncing…';
    try {
      await KH_SYNC.syncNow();
      await updatePendingPanel();
    } catch (err) {
      alert('Sync failed: ' + err.message);
    } finally {
      dom.syncNowBtn.disabled = false;
      dom.syncNowBtn.textContent = 'Sync now';
    }
  });

  window.addEventListener('kh:sync-complete', updatePendingPanel);

  // Keyboard shortcuts during quiz
  document.addEventListener('keydown', (e) => {
    if (dom.viewRunner.hidden) return;
    if (e.key === 'ArrowLeft' && state.currentIndex > 0) {
      dom.prevBtn.click();
    } else if (e.key === 'ArrowRight' && state.currentIndex < state.current.questions.length - 1) {
      dom.nextBtn.click();
    } else if (e.key >= '1' && e.key <= '6') {
      const idx = Number(e.key) - 1;
      const q = state.current.questions[state.currentIndex];
      if (idx < q.options.length) {
        state.answers[state.currentIndex] = idx;
        renderQuestion();
        renderDots();
      }
    } else if (e.key.toLowerCase() >= 'a' && e.key.toLowerCase() <= 'f') {
      const idx = e.key.toLowerCase().charCodeAt(0) - 97;
      const q = state.current.questions[state.currentIndex];
      if (idx < q.options.length) {
        state.answers[state.currentIndex] = idx;
        renderQuestion();
        renderDots();
      }
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();