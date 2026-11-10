// public/js/quiz.js — Standalone quiz client (embeddable)
// For pages that want a lightweight quiz widget without quizzes.html.
// Exposes window.KH_QUIZ
// Usage:
//   await KH_QUIZ.load(quizId);
//   KH_QUIZ.render(containerEl, { onSubmit: (result) => {...} });
//   KH_QUIZ.submit();  // or let the built-in submit button handle it

(function () {
  'use strict';

  const state = {
    quiz: null,
    answers: [],
    currentIndex: 0,
    clientId: null,
    startedAt: null,
    submitted: false,
    container: null,
    onSubmit: null,
    showResultInline: true
  };

  // ------------------------------------------------------------------
  // Generate clientId for idempotency
  // ------------------------------------------------------------------
  function generateClientId() {
    if (window.crypto && crypto.randomUUID) {
      return 'q_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    }
    return 'q_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
  }

  // ------------------------------------------------------------------
  // Load a quiz from IndexedDB
  // ------------------------------------------------------------------
  async function load(quizId) {
    if (!window.KH_DB) throw new Error('KH_DB not available');
    const quiz = await KH_DB.getQuiz(quizId);
    if (!quiz) throw new Error('Quiz not found in offline storage');

    state.quiz = quiz;
    state.answers = new Array(quiz.questions.length).fill(-1);
    state.currentIndex = 0;
    state.clientId = generateClientId();
    state.startedAt = new Date().toISOString();
    state.submitted = false;
    return quiz;
  }

  // ------------------------------------------------------------------
  // Render into a container element
  // ------------------------------------------------------------------
  function render(container, options = {}) {
    if (!state.quiz) throw new Error('Call load(quizId) first');
    state.container = container;
    state.onSubmit = options.onSubmit || null;
    state.showResultInline = options.showResultInline !== false;
    drawQuestion();
  }

  // ------------------------------------------------------------------
  // Draw the current question
  // ------------------------------------------------------------------
  function drawQuestion() {
    const quiz = state.quiz;
    const idx = state.currentIndex;
    const q = quiz.questions[idx];
    const selected = state.answers[idx];
    const isLast = idx === quiz.questions.length - 1;
    const totalAnswered = state.answers.filter((a) => a >= 0).length;

    state.container.innerHTML = `
      <div class="kh-quiz-widget">
        <div class="kh-quiz-header">
          <div class="kh-quiz-title">${escapeHtml(quiz.title)}</div>
          <div class="kh-quiz-progress">Question ${idx + 1} of ${quiz.questions.length}</div>
        </div>
        <div class="kh-quiz-question">${escapeHtml(q.questionText)}</div>
        <div class="kh-quiz-options">
          ${q.options.map((opt, i) => `
            <button type="button" class="kh-quiz-option ${i === selected ? 'is-selected' : ''}"
                    data-opt="${i}">
              <span class="kh-quiz-letter">${String.fromCharCode(65 + i)}</span>
              <span class="kh-quiz-opt-text">${escapeHtml(opt)}</span>
            </button>
          `).join('')}
        </div>
        <div class="kh-quiz-footer">
          <button type="button" class="kh-quiz-btn kh-quiz-prev" ${idx === 0 ? 'disabled' : ''}>← Previous</button>
          <span class="kh-quiz-count">${totalAnswered} answered</span>
          ${isLast
            ? `<button type="button" class="kh-quiz-btn kh-quiz-submit" ${totalAnswered < quiz.questions.length ? 'disabled' : ''}>Submit Quiz</button>`
            : `<button type="button" class="kh-quiz-btn kh-quiz-next">Next →</button>`}
        </div>
      </div>
      ${getStyles()}
    `;

    // Wire options
    state.container.querySelectorAll('.kh-quiz-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.answers[idx] = Number(btn.dataset.opt);
        drawQuestion();
      });
    });

    state.container.querySelector('.kh-quiz-prev')?.addEventListener('click', () => {
      if (state.currentIndex > 0) { state.currentIndex--; drawQuestion(); }
    });
    state.container.querySelector('.kh-quiz-next')?.addEventListener('click', () => {
      if (state.currentIndex < state.quiz.questions.length - 1) {
        state.currentIndex++;
        drawQuestion();
      }
    });
    state.container.querySelector('.kh-quiz-submit')?.addEventListener('click', submit);
  }

  // ------------------------------------------------------------------
  // Submit: score locally, save attempt, render results
  // ------------------------------------------------------------------
  async function submit() {
    if (state.submitted) return;
    const quiz = state.quiz;

    const answers = quiz.questions.map((q, i) => ({
      questionIndex: i,
      selectedIndex: state.answers[i] >= 0 ? state.answers[i] : -1,
      isCorrect: state.answers[i] === q.correctIndex
    }));
    const score = answers.filter((a) => a.isCorrect).length;
    const percent = Math.round((score / quiz.questions.length) * 100);

    state.submitted = true;

    // Save locally
    try {
      if (window.KH_DB) {
        await KH_DB.saveAttempt({
          id: state.clientId,
          quizId: quiz.id,
          lessonId: quiz.lessonId || null,
          answers: answers.map((a) => ({
            questionIndex: a.questionIndex,
            selectedIndex: a.selectedIndex
          })),
          clientTimestamp: state.startedAt,
          localScore: score,
          localTotal: quiz.questions.length,
          localPercent: percent
        });
      }
    } catch (err) {
      console.warn('Could not save attempt:', err.message);
    }

    // Dispatch for auto-sync
    window.dispatchEvent(new CustomEvent('kh:attempt-saved', {
      detail: { clientId: state.clientId, quizId: quiz.id, percent }
    }));

    const result = {
      clientId: state.clientId,
      score,
      total: quiz.questions.length,
      percent,
      passed: percent >= (quiz.passingScore || 70),
      answers
    };

    if (state.onSubmit) state.onSubmit(result);

    if (state.showResultInline) drawResults(result);
  }

  // ------------------------------------------------------------------
  // Draw results inline
  // ------------------------------------------------------------------
  function drawResults(result) {
    const quiz = state.quiz;
    const cls = result.percent >= 70 ? 'great' : (result.percent >= 40 ? 'ok' : 'low');

    state.container.innerHTML = `
      <div class="kh-quiz-widget">
        <div class="kh-quiz-results-header">
          <div class="kh-quiz-score ${cls}">${result.percent}%</div>
          <div class="kh-quiz-score-label">
            ${result.score} of ${result.total} correct · ${result.passed ? 'Passed' : 'Not passed'}
          </div>
        </div>
        <div class="kh-quiz-results-list">
          ${quiz.questions.map((q, i) => {
            const a = result.answers[i];
            const selectedText = a.selectedIndex >= 0 ? q.options[a.selectedIndex] : '(no answer)';
            const correctText = q.options[q.correctIndex];
            return `
              <div class="kh-quiz-result-item ${a.isCorrect ? 'correct' : 'wrong'}">
                <div class="kh-quiz-result-head">
                  <strong>${a.isCorrect ? '✓' : '✗'} Question ${i + 1}</strong>
                </div>
                <div class="kh-quiz-result-body">${escapeHtml(q.questionText)}</div>
                <div class="kh-quiz-result-answer">
                  Your answer: <strong>${escapeHtml(selectedText)}</strong>
                  ${a.isCorrect ? '' : ` · Correct: <strong>${escapeHtml(correctText)}</strong>`}
                </div>
                ${q.explanation ? `<div class="kh-quiz-result-explanation">💡 ${escapeHtml(q.explanation)}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <div class="kh-quiz-actions">
          <button type="button" class="kh-quiz-btn kh-quiz-retake">Retake Quiz</button>
        </div>
      </div>
      ${getStyles()}
    `;

    state.container.querySelector('.kh-quiz-retake')?.addEventListener('click', async () => {
      await load(quiz.id);
      render(state.container, { onSubmit: state.onSubmit });
    });
  }

  // ------------------------------------------------------------------
  // Inline styles (self-contained — no external CSS needed)
  // ------------------------------------------------------------------
  function getStyles() {
    return `
      <style>
        .kh-quiz-widget { font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 0 auto; }
        .kh-quiz-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
        .kh-quiz-title { font-size: 1.1rem; font-weight: 700; }
        .kh-quiz-progress { font-size: 0.8rem; color: #64748b; }
        .kh-quiz-question { font-size: 1.05rem; font-weight: 600; margin-bottom: 16px; line-height: 1.5; }
        .kh-quiz-options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
        .kh-quiz-option {
          display: flex; align-items: center; gap: 10px; padding: 12px 14px;
          border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;
          text-align: left; cursor: pointer; font-size: 0.95rem; font-family: inherit;
          transition: border-color 160ms, background 160ms;
        }
        .kh-quiz-option:hover { border-color: #2dd4bf; background: #f8fafc; }
        .kh-quiz-option.is-selected { border-color: #0f2027; background: #f1f5f9; font-weight: 600; }
        .kh-quiz-letter {
          width: 26px; height: 26px; border-radius: 50%; background: #f1f5f9;
          display: inline-grid; place-items: center; font-size: 0.75rem; font-weight: 700;
          flex-shrink: 0;
        }
        .kh-quiz-option.is-selected .kh-quiz-letter { background: #0f2027; color: #fff; }
        .kh-quiz-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
        .kh-quiz-count { font-size: 0.8rem; color: #64748b; }
        .kh-quiz-btn {
          padding: 10px 18px; border-radius: 8px; font-weight: 600; font-size: 0.9rem;
          cursor: pointer; border: 1px solid #e2e8f0; background: #fff; color: #0f172a;
          font-family: inherit; transition: background 160ms, opacity 160ms;
        }
        .kh-quiz-btn:hover:not(:disabled) { background: #f1f5f9; }
        .kh-quiz-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .kh-quiz-submit { background: #0f2027; color: #fff; border-color: #0f2027; }
        .kh-quiz-submit:hover:not(:disabled) { background: #1e3a44; }
        .kh-quiz-results-header { text-align: center; padding: 20px 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 20px; }
        .kh-quiz-score { font-size: 3rem; font-weight: 800; line-height: 1; }
        .kh-quiz-score.great { color: #16a34a; }
        .kh-quiz-score.ok { color: #f59e0b; }
        .kh-quiz-score.low { color: #dc2626; }
        .kh-quiz-score-label { font-size: 0.9rem; color: #64748b; margin-top: 4px; }
        .kh-quiz-results-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
        .kh-quiz-result-item { padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; }
        .kh-quiz-result-item.correct { background: #f0fdf4; border-color: #bbf7d0; }
        .kh-quiz-result-item.wrong { background: #fef2f2; border-color: #fecaca; }
        .kh-quiz-result-body { margin: 6px 0; font-size: 0.9rem; }
        .kh-quiz-result-answer { font-size: 0.85rem; margin-bottom: 4px; }
        .kh-quiz-result-explanation { font-size: 0.8rem; color: #64748b; padding: 6px; background: #fff; border-radius: 4px; }
        .kh-quiz-actions { text-align: center; }
        .kh-quiz-retake { background: #0f2027; color: #fff; border-color: #0f2027; padding: 12px 24px; }
        .kh-quiz-retake:hover { background: #1e3a44; }
      </style>
    `;
  }

  // ------------------------------------------------------------------
  // Utility
  // ------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  window.KH_QUIZ = {
    load,
    render,
    submit,
    getState: () => ({
      loaded: !!state.quiz,
      submitted: state.submitted,
      currentIndex: state.currentIndex,
      answers: state.answers.slice()
    })
  };
})();