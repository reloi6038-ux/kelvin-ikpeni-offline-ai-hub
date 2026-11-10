// public/js/admin.js — Premium admin dashboard
(function () {
  'use strict';

  const STORAGE_KEY = 'kh_admin_key';
  const state = {
    adminKey: null,
    subjects: [],
    formQuestions: [],
    editQuizQuestions: [],
    editQuizLoadedId: null,
    classroomPollHandle: null
  };

  const dom = {
    loginView: document.getElementById('admin-login-view'),
    loginForm: document.getElementById('admin-login-form'),
    loginError: document.getElementById('admin-login-error'),
    keyInput: document.getElementById('admin-key-input'),
    shell: document.getElementById('admin-shell'),
    sidebar: document.getElementById('ad-sidebar'),
    menuBtn: document.getElementById('ad-menu-btn'),
    navButtons: document.querySelectorAll('.ad-nav-btn'),
    panels: document.querySelectorAll('[data-panel]'),
    toastContainer: document.getElementById('toast-container')
  };

  // ------------------------------------------------------------------
  // Auth
  // ------------------------------------------------------------------
  function tryExistingKey() {
    const key = sessionStorage.getItem(STORAGE_KEY);
    if (key) {
      state.adminKey = key;
      verifyAndEnter().catch(() => { sessionStorage.removeItem(STORAGE_KEY); });
    }
  }

  dom.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = dom.keyInput.value.trim();
    if (!key) return;
    dom.loginError.hidden = true;
    state.adminKey = key;
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      await verifyAndEnter();
      sessionStorage.setItem(STORAGE_KEY, key);
    } catch {
      state.adminKey = null;
      dom.loginError.hidden = false;
      dom.loginError.textContent = 'Invalid key or server unavailable.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in →';
    }
  });

  async function verifyAndEnter() {
    const res = await adminFetch('/api/admin/stats');
    if (!res.ok) throw new Error('Auth failed');
    dom.loginView.hidden = true;
    dom.shell.hidden = false;
    await Promise.all([loadSubjects(), loadOverview()]);
  }

  function signOut() {
    sessionStorage.removeItem(STORAGE_KEY);
    state.adminKey = null;
    if (state.classroomPollHandle) {
      clearInterval(state.classroomPollHandle);
      state.classroomPollHandle = null;
    }
    dom.shell.hidden = true;
    dom.loginView.hidden = false;
    dom.keyInput.value = '';
  }

  async function adminFetch(path, options = {}) {
    const headers = Object.assign({}, options.headers, { 'X-Admin-Key': state.adminKey || '' });
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(path, Object.assign({}, options, { headers }));
  }

  async function adminJSON(path, options = {}) {
    const res = await adminFetch(path, options);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------
  dom.navButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  if (dom.menuBtn) {
    dom.menuBtn.addEventListener('click', () => {
      dom.sidebar.classList.toggle('is-open');
    });
  }

  function switchView(view) {
    if (view === 'logout') { signOut(); return; }
    dom.navButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
    dom.panels.forEach((p) => { p.hidden = p.dataset.panel !== view; });
    if (dom.sidebar.classList.contains('is-open')) dom.sidebar.classList.remove('is-open');

    if (view === 'overview') loadOverview();
    else if (view === 'feedback') loadFeedback();
    else if (view === 'packs') loadPacks();
    else if (view === 'content') loadContent();
    else if (view === 'create-quiz') { state.formQuestions = []; renderQuestions(); }
    else if (view === 'classroom') initClassroomView();
  }

  // ------------------------------------------------------------------
  // Overview
  // ------------------------------------------------------------------
  async function loadOverview() {
    const loading = document.getElementById('admin-overview-loading');
    const content = document.getElementById('admin-overview-content');
    loading.hidden = false;
    content.hidden = true;
    try {
      const json = await adminJSON('/api/admin/stats');
      const data = json.data;
      content.innerHTML = `
        <div class="ad-stats">
          <div class="ad-stat">
            <div class="ad-stat-icon ad-stat-icon-blue">📚</div>
            <div class="ad-stat-value">${data.counts.subjectCount}</div>
            <div class="ad-stat-label">Subjects</div>
          </div>
          <div class="ad-stat">
            <div class="ad-stat-icon ad-stat-icon-teal">📖</div>
            <div class="ad-stat-value">${data.counts.lessonCount}</div>
            <div class="ad-stat-label">Lessons</div>
          </div>
          <div class="ad-stat">
            <div class="ad-stat-icon ad-stat-icon-green">✏️</div>
            <div class="ad-stat-value">${data.counts.quizCount}</div>
            <div class="ad-stat-label">Quizzes</div>
          </div>
          <div class="ad-stat">
            <div class="ad-stat-icon ad-stat-icon-purple">📦</div>
            <div class="ad-stat-value">${data.counts.packCount}</div>
            <div class="ad-stat-label">Packs</div>
          </div>
          <div class="ad-stat">
            <div class="ad-stat-icon ad-stat-icon-amber">📝</div>
            <div class="ad-stat-value">${data.counts.attemptCount}</div>
            <div class="ad-stat-label">Attempts</div>
          </div>
          <div class="ad-stat">
            <div class="ad-stat-icon ad-stat-icon-red">💬</div>
            <div class="ad-stat-value">${data.counts.feedbackOpen}</div>
            <div class="ad-stat-label">Open feedback</div>
          </div>
        </div>
        <div class="ad-card">
          <div style="padding: 12px 16px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; font-size: 0.85rem; color: #92400e;">
            ⚠️ ${esc(data.warning || 'Prototype admin key.')}
          </div>
        </div>
      `;
      loading.hidden = true;
      content.hidden = false;
    } catch (err) {
      loading.hidden = true;
      content.innerHTML = `<div class="ad-card"><p style="color: #991b1b;">Failed: ${esc(err.message)}</p></div>`;
      content.hidden = false;
    }
  }

  // ------------------------------------------------------------------
  // Subjects
  // ------------------------------------------------------------------
  async function loadSubjects() {
    try {
      const res = await fetch('/api/subjects?limit=100');
      const json = await res.json();
      state.subjects = json.data || [];
      const opts = state.subjects.map(s => `<option value="${s._id}">${esc(s.name)}</option>`).join('');
      document.getElementById('cl-subject').innerHTML = '<option value="">Select subject…</option>' + opts;
      document.getElementById('cq-subject').innerHTML = '<option value="">Select subject…</option>' + opts;
    } catch (err) {
      console.warn('Subjects load failed:', err.message);
    }
  }

  document.getElementById('cq-subject').addEventListener('change', async (e) => {
    const sid = e.target.value;
    const lessonSel = document.getElementById('cq-lesson');
    if (!sid) { lessonSel.innerHTML = '<option value="">No lesson</option>'; return; }
    try {
      const subj = state.subjects.find(s => s._id === sid);
      const res = await fetch(`/api/subjects/${subj.slug}/lessons?limit=100`);
      const json = await res.json();
      const lessons = json.data || [];
      lessonSel.innerHTML = '<option value="">No lesson</option>' +
        lessons.map(l => `<option value="${l._id}">${esc(l.title)}</option>`).join('');
    } catch { lessonSel.innerHTML = '<option value="">Error loading lessons</option>'; }
  });

  // ------------------------------------------------------------------
  // Create Lesson
  // ------------------------------------------------------------------
  document.getElementById('create-lesson-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      subjectId: document.getElementById('cl-subject').value,
      title: document.getElementById('cl-title').value,
      level: document.getElementById('cl-level').value,
      summary: document.getElementById('cl-summary').value,
      content: document.getElementById('cl-content').value,
      keyPoints: document.getElementById('cl-keypoints').value.split('\n').map(s => s.trim()).filter(Boolean),
      sourceRef: document.getElementById('cl-source').value,
      isPublished: document.getElementById('cl-publish').checked
    };
    if (!payload.subjectId) return toast('Select a subject', 'error');
    if (!payload.title) return toast('Title is required', 'error');
    if (!payload.content) return toast('Content is required', 'error');
    try {
      const json = await adminJSON('/api/admin/lessons', { method: 'POST', body: JSON.stringify(payload) });
      toast(`Lesson "${json.data.title}" created`, 'success');
      e.target.reset();
      document.getElementById('cl-publish').checked = true;
    } catch (err) {
      toast('Create failed: ' + err.message, 'error');
    }
  });

  // ------------------------------------------------------------------
  // Quiz question editor (shared for create + edit)
  // ------------------------------------------------------------------
  function renderQuestionEditor(container, questions, stateKey) {
    container.innerHTML = questions.map((q, qi) => `
      <div class="ad-question-editor" data-qindex="${qi}">
        <div class="ad-question-head">
          <div class="ad-question-num">Question ${qi + 1}</div>
          <button type="button" class="ad-table-btn ad-table-btn-danger" data-remove="${qi}">Remove</button>
        </div>
        <input type="text" class="ad-form-input q-text" placeholder="Question text" value="${esc(q.questionText)}" data-qi="${qi}" style="margin-bottom:10px;">
        <div class="ad-question-options">
          ${q.options.map((opt, oi) => `
            <div class="ad-option-row">
              <input type="radio" name="correct-${stateKey}-${qi}" value="${oi}" ${q.correctIndex === oi ? 'checked' : ''} data-qi="${qi}" data-oi="${oi}" title="Mark as correct">
              <input type="text" class="q-opt" placeholder="Option ${String.fromCharCode(65 + oi)}" value="${esc(opt)}" data-qi="${qi}" data-oi="${oi}">
              ${q.options.length > 2 ? `<button type="button" class="ad-remove-opt" data-remove-opt="${oi}" data-qi="${qi}">×</button>` : ''}
            </div>
          `).join('')}
          ${q.options.length < 6 ? `<button type="button" class="ad-add-btn" data-add-opt="${qi}">+ Add option</button>` : ''}
        </div>
        <input type="text" class="ad-form-input q-explanation" placeholder="Explanation (optional)" value="${esc(q.explanation || '')}" data-qi="${qi}" style="margin-top:8px;">
      </div>
    `).join('');

    // Wire
    container.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
      const arr = stateKey === 'create' ? state.formQuestions : state.editQuizQuestions;
      arr.splice(Number(b.dataset.remove), 1);
      renderQuestionEditor(container, arr, stateKey);
    }));
    container.querySelectorAll('[data-add-opt]').forEach(b => b.addEventListener('click', () => {
      const arr = stateKey === 'create' ? state.formQuestions : state.editQuizQuestions;
      arr[Number(b.dataset.addOpt)].options.push('');
      renderQuestionEditor(container, arr, stateKey);
    }));
    container.querySelectorAll('[data-remove-opt]').forEach(b => b.addEventListener('click', () => {
      const arr = stateKey === 'create' ? state.formQuestions : state.editQuizQuestions;
      const qi = Number(b.dataset.qi);
      arr[qi].options.splice(Number(b.dataset.removeOpt), 1);
      if (arr[qi].correctIndex >= arr[qi].options.length) arr[qi].correctIndex = 0;
      renderQuestionEditor(container, arr, stateKey);
    }));
    container.querySelectorAll('.q-text').forEach(inp => inp.addEventListener('input', () => {
      const arr = stateKey === 'create' ? state.formQuestions : state.editQuizQuestions;
      arr[Number(inp.dataset.qi)].questionText = inp.value;
    }));
    container.querySelectorAll('.q-opt').forEach(inp => inp.addEventListener('input', () => {
      const arr = stateKey === 'create' ? state.formQuestions : state.editQuizQuestions;
      arr[Number(inp.dataset.qi)].options[Number(inp.dataset.oi)] = inp.value;
    }));
    container.querySelectorAll('.q-explanation').forEach(inp => inp.addEventListener('input', () => {
      const arr = stateKey === 'create' ? state.formQuestions : state.editQuizQuestions;
      arr[Number(inp.dataset.qi)].explanation = inp.value;
    }));
    container.querySelectorAll('input[type="radio"]').forEach(rad => rad.addEventListener('change', () => {
      const arr = stateKey === 'create' ? state.formQuestions : state.editQuizQuestions;
      arr[Number(rad.dataset.qi)].correctIndex = Number(rad.value);
    }));
  }

  document.getElementById('cq-add-question').addEventListener('click', () => {
    state.formQuestions.push({ questionText: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });
    renderQuestionEditor(document.getElementById('cq-questions'), state.formQuestions, 'create');
  });

  // ------------------------------------------------------------------
  // Create Quiz
  // ------------------------------------------------------------------
  document.getElementById('create-quiz-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      subjectId: document.getElementById('cq-subject').value,
      lessonId: document.getElementById('cq-lesson').value || null,
      title: document.getElementById('cq-title').value,
      level: document.getElementById('cq-level').value,
      passingScore: Number(document.getElementById('cq-pass').value) || 70,
      questions: state.formQuestions.map(q => ({
        questionText: q.questionText.trim(),
        options: q.options.filter(o => o.trim() !== ''),
        correctIndex: q.correctIndex,
        explanation: (q.explanation || '').trim(),
        difficulty: 'medium'
      })).filter(q => q.questionText && q.options.length >= 2)
    };
    if (!payload.subjectId) return toast('Select a subject', 'error');
    if (!payload.title) return toast('Title is required', 'error');
    if (payload.questions.length === 0) return toast('Add at least one valid question', 'error');
    try {
      const json = await adminJSON('/api/admin/quizzes', { method: 'POST', body: JSON.stringify(payload) });
      toast(`Quiz "${json.data.title}" created with ${json.data.questionCount} questions`, 'success');
      e.target.reset();
      state.formQuestions = [];
      renderQuestionEditor(document.getElementById('cq-questions'), state.formQuestions, 'create');
    } catch (err) {
      toast('Create failed: ' + err.message, 'error');
    }
  });

  // ------------------------------------------------------------------
  // Create Subject
  // ------------------------------------------------------------------
  document.getElementById('create-subject-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const levels = Array.from(document.getElementById('cs-levels').selectedOptions).map(o => o.value);
    const payload = {
      name: document.getElementById('cs-name').value,
      icon: document.getElementById('cs-icon').value || '📘',
      description: document.getElementById('cs-description').value,
      levels: levels.length > 0 ? levels : ['JSS1', 'JSS2', 'JSS3']
    };
    if (!payload.name) return toast('Name is required', 'error');
    try {
      const json = await adminJSON('/api/admin/subjects', { method: 'POST', body: JSON.stringify(payload) });
      toast(`Subject "${json.data.name}" created`, 'success');
      e.target.reset();
      await loadSubjects();
    } catch (err) {
      toast('Create failed: ' + err.message, 'error');
    }
  });

  // ------------------------------------------------------------------
  // Manage Content
  // ------------------------------------------------------------------
  async function loadContent() {
    document.getElementById('content-lessons').innerHTML = '<p style="color: #64748b;">Loading…</p>';
    document.getElementById('content-quizzes').innerHTML = '<p style="color: #64748b;">Loading…</p>';
    try {
      const [lessonsJson, quizzesJson] = await Promise.all([
        adminJSON('/api/lessons?limit=100'),
        adminJSON('/api/admin/quizzes?limit=100')
      ]);
      const lessons = lessonsJson.data || [];
      const quizzes = quizzesJson.data || [];

      document.getElementById('content-lessons').innerHTML = lessons.length === 0
        ? '<p style="color: #64748b;">No lessons yet.</p>'
        : `<table class="ad-table">
            <thead><tr><th>Title</th><th>Level</th><th>Status</th><th style="text-align:right;">Actions</th></tr></thead>
            <tbody>
              ${lessons.map(l => `
                <tr>
                  <td>${esc(l.title)}</td>
                  <td>${esc(l.level)}</td>
                  <td>${l.isPublished
                    ? '<span class="ad-badge ad-badge-published">✓ Published</span>'
                    : '<span class="ad-badge ad-badge-unpublished">⏸ Unpublished</span>'}</td>
                  <td>
                    <div class="ad-table-actions">
                      <button class="ad-table-btn" data-edit-lesson="${l._id}">Edit</button>
                      <button class="ad-table-btn ad-table-btn-danger" data-delete-lesson="${l._id}" data-title="${esc(l.title)}">Delete</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>`;

      document.getElementById('content-quizzes').innerHTML = quizzes.length === 0
        ? '<p style="color: #64748b;">No quizzes yet.</p>'
        : `<table class="ad-table">
            <thead><tr><th>Title</th><th>Questions</th><th>Pass</th><th>Status</th><th style="text-align:right;">Actions</th></tr></thead>
            <tbody>
              ${quizzes.map(q => `
                <tr>
                  <td>${esc(q.title)}</td>
                  <td>${q.questionCount}</td>
                  <td>${q.passingScore}%</td>
                  <td>${q.isPublished
                    ? '<span class="ad-badge ad-badge-published">✓ Published</span>'
                    : '<span class="ad-badge ad-badge-unpublished">⏸ Unpublished</span>'}</td>
                  <td>
                    <div class="ad-table-actions">
                      <button class="ad-table-btn" data-edit-quiz="${q.id}">Edit</button>
                      <button class="ad-table-btn ad-table-btn-danger" data-delete-quiz="${q.id}" data-title="${esc(q.title)}">Delete</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>`;

      document.querySelectorAll('[data-edit-lesson]').forEach(b => b.addEventListener('click', () => openEditLesson(b.dataset.editLesson)));
      document.querySelectorAll('[data-delete-lesson]').forEach(b => b.addEventListener('click', () => deleteLesson(b.dataset.deleteLesson, b.dataset.title)));
      document.querySelectorAll('[data-edit-quiz]').forEach(b => b.addEventListener('click', () => openEditQuiz(b.dataset.editQuiz)));
      document.querySelectorAll('[data-delete-quiz]').forEach(b => b.addEventListener('click', () => deleteQuiz(b.dataset.deleteQuiz, b.dataset.title)));
    } catch (err) {
      document.getElementById('content-lessons').innerHTML = `<p style="color: #991b1b;">Failed: ${esc(err.message)}</p>`;
    }
  }

  // ------------------------------------------------------------------
  // Edit Lesson
  // ------------------------------------------------------------------
  async function openEditLesson(lessonId) {
    try {
      const json = await adminJSON(`/api/admin/lessons/${lessonId}`);
      const l = json.data;
      document.getElementById('el-id').value = l.id;
      document.getElementById('el-subject-id').value = l.subject ? l.subject._id : '';
      document.getElementById('el-title').value = l.title || '';
      document.getElementById('el-level').value = l.level || 'JSS2';
      document.getElementById('el-summary').value = l.summary || '';
      document.getElementById('el-content').value = l.content || '';
      document.getElementById('el-keypoints').value = (l.keyPoints || []).join('\n');
      document.getElementById('el-source').value = l.sourceRef || '';
      document.getElementById('el-publish').checked = !!l.isPublished;
      document.getElementById('edit-lesson-title').textContent = `Edit: ${l.title}`;
      switchView('edit-lesson');
    } catch (err) {
      toast('Could not load lesson: ' + err.message, 'error');
    }
  }

  document.getElementById('edit-lesson-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('el-id').value;
    const payload = {
      title: document.getElementById('el-title').value,
      level: document.getElementById('el-level').value,
      summary: document.getElementById('el-summary').value,
      content: document.getElementById('el-content').value,
      keyPoints: document.getElementById('el-keypoints').value.split('\n').map(s => s.trim()).filter(Boolean),
      sourceRef: document.getElementById('el-source').value,
      isPublished: document.getElementById('el-publish').checked
    };
    if (!payload.title) return toast('Title is required', 'error');
    if (!payload.content) return toast('Content is required', 'error');
    try {
      await adminJSON(`/api/admin/lessons/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      toast(`Lesson "${payload.title}" updated`, 'success');
      switchView('content');
    } catch (err) {
      toast('Update failed: ' + err.message, 'error');
    }
  });

  document.getElementById('el-cancel').addEventListener('click', () => switchView('content'));

  async function deleteLesson(id, title) {
    if (!confirm(`Unpublish "${title}"? Students who already downloaded it keep access.`)) return;
    try {
      await adminJSON(`/api/admin/lessons/${id}`, { method: 'DELETE' });
      toast(`Lesson "${title}" unpublished`, 'success');
      loadContent();
    } catch (err) {
      toast('Delete failed: ' + err.message, 'error');
    }
  }

  // ------------------------------------------------------------------
  // Edit Quiz
  // ------------------------------------------------------------------
  async function openEditQuiz(quizId) {
    try {
      const json = await adminJSON(`/api/admin/quizzes/${quizId}`);
      const q = json.data;
      document.getElementById('eq-id').value = q.id;
      document.getElementById('eq-subject-id').value = q.subject ? q.subject._id : '';
      document.getElementById('eq-title').value = q.title || '';
      document.getElementById('eq-level').value = q.level || 'JSS2';
      document.getElementById('eq-pass').value = q.passingScore || 70;
      document.getElementById('eq-publish').checked = !!q.isPublished;
      document.getElementById('edit-quiz-title').textContent = `Edit: ${q.title}`;
      state.editQuizQuestions = (q.questions || []).map(question => ({
        questionText: question.questionText,
        options: question.options.slice(),
        correctIndex: question.correctIndex,
        explanation: question.explanation || ''
      }));
      state.editQuizLoadedId = quizId;
      renderQuestionEditor(document.getElementById('eq-questions'), state.editQuizQuestions, 'edit');
      switchView('edit-quiz');
    } catch (err) {
      toast('Could not load quiz: ' + err.message, 'error');
    }
  }

  document.getElementById('eq-add-question').addEventListener('click', () => {
    state.editQuizQuestions.push({ questionText: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' });
    renderQuestionEditor(document.getElementById('eq-questions'), state.editQuizQuestions, 'edit');
  });

  document.getElementById('edit-quiz-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('eq-id').value;
    const payload = {
      title: document.getElementById('eq-title').value,
      level: document.getElementById('eq-level').value,
      passingScore: Number(document.getElementById('eq-pass').value) || 70,
      isPublished: document.getElementById('eq-publish').checked,
      questions: state.editQuizQuestions
        .map(q => ({
          questionText: q.questionText.trim(),
          options: q.options.filter(o => o.trim() !== ''),
          correctIndex: q.correctIndex,
          explanation: (q.explanation || '').trim(),
          difficulty: 'medium'
        }))
        .filter(q => q.questionText && q.options.length >= 2)
    };
    if (!payload.title) return toast('Title is required', 'error');
    if (payload.questions.length === 0) return toast('At least one valid question is required', 'error');
    try {
      await adminJSON(`/api/admin/quizzes/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      toast(`Quiz "${payload.title}" updated`, 'success');
      switchView('content');
    } catch (err) {
      toast('Update failed: ' + err.message, 'error');
    }
  });

  document.getElementById('eq-cancel').addEventListener('click', () => switchView('content'));

  async function deleteQuiz(id, title) {
    if (!confirm(`Unpublish "${title}"? Students who already downloaded it keep access.`)) return;
    try {
      await adminJSON(`/api/admin/quizzes/${id}`, { method: 'DELETE' });
      toast(`Quiz "${title}" unpublished`, 'success');
      loadContent();
    } catch (err) {
      toast('Delete failed: ' + err.message, 'error');
    }
  }

  // ------------------------------------------------------------------
  // Feedback
  // ------------------------------------------------------------------
  async function loadFeedback() {
    const list = document.getElementById('feedback-list');
    list.innerHTML = '<p style="color: #64748b;">Loading…</p>';
    try {
      const json = await adminJSON('/api/feedback?limit=30');
      const items = json.data || [];
      if (items.length === 0) {
        list.innerHTML = '<p style="color: #64748b; text-align: center; padding: 40px;">No feedback yet. 🎉</p>';
        return;
      }
      list.innerHTML = '';
      for (const fb of items) {
        const el = document.createElement('div');
        el.className = 'ad-feedback-item' + (fb.status === 'resolved' ? ' is-resolved' : '');
        el.innerHTML = `
          <div class="ad-feedback-head">
            <span class="ad-feedback-type ${esc(fb.type)}">${esc(fb.type.replace(/_/g, ' '))}</span>
            <span class="ad-feedback-time">${esc(fb.status)} · ${new Date(fb.createdAt).toLocaleString()}</span>
          </div>
          <p class="ad-feedback-message">${esc(fb.message)}</p>
          ${fb.status !== 'resolved' ? `
            <div class="ad-feedback-actions">
              <button class="ad-table-btn" data-resolve="${fb.id}">Mark resolved</button>
              <button class="ad-table-btn" data-dismiss="${fb.id}">Dismiss</button>
            </div>
          ` : ''}
        `;
        list.appendChild(el);
      }
      list.querySelectorAll('[data-resolve]').forEach(b => b.addEventListener('click', () => updateFeedback(b.dataset.resolve, 'resolved')));
      list.querySelectorAll('[data-dismiss]').forEach(b => b.addEventListener('click', () => updateFeedback(b.dataset.dismiss, 'dismissed')));
    } catch (err) {
      list.innerHTML = `<p style="color: #991b1b;">Failed: ${esc(err.message)}</p>`;
    }
  }

  async function updateFeedback(id, status) {
    try {
      await adminJSON(`/api/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast('Feedback updated', 'success');
      loadFeedback();
    } catch (err) { toast('Update failed: ' + err.message, 'error'); }
  }

  // ------------------------------------------------------------------
  // Packs
  // ------------------------------------------------------------------
  async function loadPacks() {
    const list = document.getElementById('admin-packs-list');
    list.innerHTML = '<p style="color: #64748b;">Loading…</p>';
    try {
      const json = await adminJSON('/api/admin/packs?limit=100');
      const items = json.data || [];
      if (items.length === 0) {
        list.innerHTML = '<p style="color: #64748b;">No packs yet.</p>';
        return;
      }
      list.innerHTML = `<table class="ad-table">
        <thead><tr><th>Name</th><th>Level</th><th>Version</th><th>Lessons</th><th>Status</th><th style="text-align:right;">Actions</th></tr></thead>
        <tbody>
          ${items.map(p => `<tr>
            <td>${esc(p.name)}</td>
            <td>${esc(p.level)}</td>
            <td>v${p.version}</td>
            <td>${p.lessonCount}</td>
            <td>${p.isPublished
              ? '<span class="ad-badge ad-badge-published">✓ Published</span>'
              : '<span class="ad-badge ad-badge-unpublished">⏸ Unpublished</span>'}</td>
            <td>
              <div class="ad-table-actions">
                ${p.isPublished ? `<button class="ad-table-btn ad-table-btn-danger" data-unpublish="${p.id}">Unpublish</button>` : ''}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
      list.querySelectorAll('[data-unpublish]').forEach(b => b.addEventListener('click', () => unpublishPack(b.dataset.unpublish)));
    } catch (err) {
      list.innerHTML = `<p style="color: #991b1b;">Failed: ${esc(err.message)}</p>`;
    }
  }

  async function unpublishPack(id) {
    if (!confirm('Unpublish this pack? Students who already downloaded it keep access.')) return;
    try {
      await adminJSON(`/api/admin/packs/${id}`, { method: 'DELETE' });
      toast('Pack unpublished', 'success');
      loadPacks();
    } catch (err) { toast('Unpublish failed: ' + err.message, 'error'); }
  }

  // ------------------------------------------------------------------
  // AI warm
  // ------------------------------------------------------------------
  document.getElementById('ai-warm-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const lessonId = document.getElementById('warm-lesson-id').value.trim();
    const result = document.getElementById('warm-result');
    result.hidden = true;
    try {
      const json = await adminJSON('/api/admin/ai/warm', { method: 'POST', body: JSON.stringify({ lessonId }) });
      const results = json.data.results || [];
      result.innerHTML = `<div style="padding: 12px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; font-size: 0.85rem; color: #166534;">
        ✅ Warmed ${results.length} action(s).
        <ul style="margin:8px 0 0;padding-left:20px">${results.map(r => `<li>${esc(r.action)} — ${r.ok ? `${esc(r.provider)} (${esc(r.source)})` : 'failed: ' + esc(r.error || '')}</li>`).join('')}</ul>
      </div>`;
      result.hidden = false;
      toast('AI cache warmed', 'success');
    } catch (err) {
      result.innerHTML = `<div style="padding: 12px 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; font-size: 0.85rem; color: #991b1b;">Failed: ${esc(err.message)}</div>`;
      result.hidden = false;
      toast('Warm-up failed', 'error');
    }
  });

  // ------------------------------------------------------------------
  // Classroom
  // ------------------------------------------------------------------
  async function initClassroomView() {
    try {
      const json = await adminJSON('/api/classroom/status');
      if (json.data && json.data.active) {
        await showActiveSession(json.data);
      } else {
        showInactiveSession();
      }
    } catch (err) {
      console.warn('Classroom status failed:', err.message);
      showInactiveSession();
    }
  }

  function showInactiveSession() {
    document.getElementById('classroom-inactive').hidden = false;
    document.getElementById('classroom-active').hidden = true;
    if (state.classroomPollHandle) {
      clearInterval(state.classroomPollHandle);
      state.classroomPollHandle = null;
    }
    const startBtn = document.getElementById('classroom-start-btn');
    if (startBtn && !startBtn.dataset.wired) {
      startBtn.dataset.wired = '1';
      startBtn.addEventListener('click', startClassroom);
    }
  }

  async function showActiveSession(session) {
    document.getElementById('classroom-inactive').hidden = true;
    document.getElementById('classroom-active').hidden = false;
    document.getElementById('classroom-session-name').textContent = session.name || 'Classroom';
    document.getElementById('classroom-join-url').textContent = session.joinUrl || '';
    document.getElementById('classroom-local-ip').textContent = `${session.ip}:${session.port}`;
    document.getElementById('classroom-student-count').textContent = String(session.studentCount || 0);
    const started = new Date(session.startedAt);
    document.getElementById('classroom-elapsed').textContent = `${Math.round((Date.now() - started.getTime()) / 60000)} min`;

    const qrImg = document.getElementById('classroom-qr-img');
    if (!qrImg.src || qrImg.src === window.location.href) {
      try {
        const startJson = await adminJSON('/api/classroom/start', { method: 'POST', body: JSON.stringify({ name: session.name }) });
        if (startJson.data && startJson.data.qrCode) qrImg.src = startJson.data.qrCode;
      } catch {}
    }

    const studentsEl = document.getElementById('classroom-students');
    const renderStudents = (list) => {
      studentsEl.innerHTML = list.length === 0
        ? '<p style="color: #64748b; font-size: 0.85rem;">No students yet.</p>'
        : list.map((s) => `
            <div class="ad-student-row">
              <span class="ad-student-dot"></span>
              <span class="ad-student-name">${esc(s.name)}</span>
              <span class="ad-student-time">${new Date(s.joinedAt).toLocaleTimeString()}</span>
            </div>
          `).join('');
    };
    renderStudents(session.students || []);

    const stopBtn = document.getElementById('classroom-stop-btn');
    if (stopBtn && !stopBtn.dataset.wired) {
      stopBtn.dataset.wired = '1';
      stopBtn.addEventListener('click', stopClassroom);
    }
    const copyBtn = document.getElementById('classroom-copy-url');
    if (copyBtn && !copyBtn.dataset.wired) {
      copyBtn.dataset.wired = '1';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(session.joinUrl || '').then(() => toast('URL copied', 'success'));
      });
    }
    const announceBtn = document.getElementById('classroom-announce-btn');
    if (announceBtn && !announceBtn.dataset.wired) {
      announceBtn.dataset.wired = '1';
      announceBtn.addEventListener('click', async () => {
        const text = prompt('Announcement to all students:');
        if (!text || !text.trim()) return;
        try {
          await adminJSON('/api/classroom/announce', { method: 'POST', body: JSON.stringify({ text: text.trim() }) });
          toast('Announcement sent', 'success');
        } catch (err) {
          toast('Failed: ' + err.message, 'error');
        }
      });
    }

    if (state.classroomPollHandle) clearInterval(state.classroomPollHandle);
    state.classroomPollHandle = setInterval(async () => {
      const panel = document.querySelector('[data-panel="classroom"]');
      if (!panel || panel.hidden) {
        clearInterval(state.classroomPollHandle);
        state.classroomPollHandle = null;
        return;
      }
      try {
        const res = await adminJSON('/api/classroom/status');
        if (!res.data || !res.data.active) { showInactiveSession(); return; }
        document.getElementById('classroom-student-count').textContent = String(res.data.studentCount || 0);
        document.getElementById('classroom-elapsed').textContent = `${Math.round((Date.now() - new Date(res.data.startedAt).getTime()) / 60000)} min`;
        renderStudents(res.data.students || []);
      } catch {}
    }, 5000);
  }

  async function startClassroom() {
    const btn = document.getElementById('classroom-start-btn');
    btn.disabled = true;
    btn.textContent = 'Starting…';
    try {
      const json = await adminJSON('/api/classroom/start', { method: 'POST', body: JSON.stringify({ name: 'Kelvin Hub Classroom' }) });
      toast('Classroom started', 'success');
      await initClassroomView();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '🚀 Start classroom session';
      toast('Start failed: ' + err.message, 'error');
    }
  }

  async function stopClassroom() {
    if (!confirm('End the classroom session? All students will be disconnected.')) return;
    try {
      await adminJSON('/api/classroom/stop', { method: 'POST' });
      toast('Classroom ended', 'success');
      showInactiveSession();
    } catch (err) {
      toast('Stop failed: ' + err.message, 'error');
    }
  }

  // ------------------------------------------------------------------
  // Toast + utils
  // ------------------------------------------------------------------
  function toast(message, type = '') {
    const el = document.createElement('div');
    el.className = 'ad-toast ' + type;
    el.textContent = message;
    dom.toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryExistingKey);
  else tryExistingKey();
})();