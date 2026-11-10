// public/js/download.js — Download Center client
(function () {
  'use strict';

  const state = {
    packs: [],
    localPacks: new Map(),
    filters: { subject: '', level: '', status: 'all', sort: 'name' },
    revealObserver: null
  };

  const dom = {
    loading: document.getElementById('packs-loading'),
    error: document.getElementById('packs-error'),
    errorMessage: document.getElementById('packs-error-message'),
    empty: document.getElementById('packs-empty'),
    grid: document.getElementById('packs-grid'),
    summary: document.getElementById('download-summary'),
    downloadedCount: document.getElementById('downloaded-count'),
    storageUsed: document.getElementById('storage-used'),
    filterSubject: document.getElementById('filter-subject'),
    filterLevel: document.getElementById('filter-level'),
    filterStatus: document.getElementById('filter-status'),
    filterSort: document.getElementById('filter-sort'),
    retryBtn: document.getElementById('retry-btn'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    resetFiltersEmptyBtn: document.getElementById('reset-filters-empty-btn')
  };

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  async function loadPacks() {
    setLoading(true);
    setError(null);

    try {
      const local = await KH_DB.listPacks();
      state.localPacks = new Map(local.map((p) => [p.id, p]));
    } catch (err) {
      console.warn('Local packs load failed:', err.message);
      state.localPacks = new Map();
    }

    const online = window.KH_IS_ONLINE ? window.KH_IS_ONLINE() : navigator.onLine;
    if (!online) {
      state.packs = Array.from(state.localPacks.values()).map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description || '',
        level: p.level,
        curriculum: p.curriculum,
        language: p.language,
        subject: p.subject,
        sizeBytes: p.sizeBytes,
        sizeLabel: formatBytes(p.sizeBytes || 0),
        lessonCount: p.lessonCount,
        quizCount: p.quizCount,
        version: p.version,
        estimatedMinutes: p.estimatedMinutes || 0,
        updatedAt: p.downloadedAt
      }));
      setLoading(false);
      if (state.packs.length === 0) {
        setError('You are offline and haven\'t downloaded any packs yet.');
      } else {
        render();
      }
      return;
    }

    try {
      const res = await fetch('/api/packs?limit=100');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      state.packs = json.data || [];
      setLoading(false);
      render();
    } catch (err) {
      console.warn('Remote fetch failed, using local:', err.message);
      state.packs = Array.from(state.localPacks.values());
      setLoading(false);
      if (state.packs.length > 0) {
        render();
      } else {
        setError(err.message || 'Network error');
      }
    }
  }

  function setLoading(v) {
    if (v) {
      dom.loading.hidden = false;
      dom.error.hidden = true;
      dom.empty.hidden = true;
      dom.grid.hidden = true;
    } else {
      dom.loading.hidden = true;
    }
  }

  function setError(msg) {
    if (msg) {
      dom.error.hidden = false;
      dom.errorMessage.textContent = msg;
      dom.grid.hidden = true;
      dom.empty.hidden = true;
    } else {
      dom.error.hidden = true;
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  function render() {
    const filtered = applyFilters(state.packs);
    if (filtered.length === 0) {
      dom.grid.hidden = true;
      dom.empty.hidden = false;
      dom.error.hidden = true;
      return;
    }
    dom.empty.hidden = true;
    dom.error.hidden = true;
    dom.grid.hidden = false;
    dom.grid.innerHTML = '';

    for (const pack of filtered) {
      dom.grid.appendChild(renderPackCard(pack));
    }

    updateSummary();
    populateFiltersIfNeeded();
    observeCards();
  }

  function applyFilters(packs) {
    let out = packs.slice();
    if (state.filters.subject) {
      out = out.filter((p) => p.subject && p.subject.slug === state.filters.subject);
    }
    if (state.filters.level) {
      out = out.filter((p) => p.level === state.filters.level);
    }
    if (state.filters.status === 'offline') {
      out = out.filter((p) => state.localPacks.has(p.id));
    } else if (state.filters.status === 'updates') {
      out = out.filter((p) => hasUpdate(p));
    } else if (state.filters.status === 'available') {
      out = out.filter((p) => !state.localPacks.has(p.id));
    }
    const sorters = {
      name: (a, b) => String(a.name).localeCompare(String(b.name)),
      size: (a, b) => (a.sizeBytes || 0) - (b.sizeBytes || 0),
      recent: (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
    };
    out.sort(sorters[state.filters.sort] || sorters.name);
    return out;
  }

  function hasUpdate(pack) {
    const local = state.localPacks.get(pack.id);
    if (!local) return false;
    return (pack.version || 1) > (local.version || 1);
  }

  function renderPackCard(pack) {
    const local = state.localPacks.get(pack.id);
    const downloaded = !!local;
    const update = hasUpdate(pack);

    const card = document.createElement('article');
    card.className = 'dl-card';
    if (downloaded) card.classList.add('is-downloaded');
    if (update) card.classList.add('has-update');
    card.dataset.packId = pack.id;

    const badges = [];
    if (downloaded) badges.push('<span class="dl-badge dl-badge-downloaded">✓ Downloaded</span>');
    if (update) badges.push('<span class="dl-badge dl-badge-update">Update Available</span>');
    if (!downloaded && !update) badges.push('<span class="dl-badge dl-badge-offline">Works Offline</span>');

    const online = window.KH_IS_ONLINE ? window.KH_IS_ONLINE() : navigator.onLine;
    const actionLabel = downloaded
      ? (update ? '⬆ Update' : '📖 Open')
      : (online ? '⬇ Download' : 'Go online');
    const actionDisabled = !online && !downloaded;

    const iconEmoji = (pack.subject && pack.subject.icon) || '📘';
    const subjectName = (pack.subject && pack.subject.name) || 'General';
    const sizeLabel = pack.sizeLabel || formatBytes(pack.sizeBytes || 0);
    const minutes = pack.estimatedMinutes || 0;

    card.innerHTML = `
      <div class="dl-badges">${badges.join('')}</div>
      <div class="dl-card-header">
        <div class="dl-card-icon" aria-hidden="true">${escapeHtml(iconEmoji)}</div>
        <div class="dl-card-titles">
          <h3 class="dl-card-title">${escapeHtml(pack.name)}</h3>
          <p class="dl-card-sub">${escapeHtml(subjectName)} · ${escapeHtml(pack.level || '')}</p>
        </div>
      </div>
      <div class="dl-card-meta">
        <span>📚 ${pack.lessonCount || 0} ${(pack.lessonCount || 0) === 1 ? 'lesson' : 'lessons'}</span>
        <span>❓ ${pack.quizCount || 0} ${(pack.quizCount || 0) === 1 ? 'quiz' : 'quizzes'}</span>
        <span>⏱ ${minutes} min</span>
        <span>💾 ${sizeLabel}</span>
      </div>
      <p class="dl-card-desc">${escapeHtml(pack.description || '')}</p>
      <div class="dl-progress" data-role="progress">
        <div class="dl-progress-track">
          <div class="dl-progress-fill" data-role="progress-fill"></div>
        </div>
        <div class="dl-progress-label" data-role="progress-label">Preparing…</div>
      </div>
      <p class="dl-card-status" data-role="status-text"></p>
      <div class="dl-card-actions">
        <button class="dl-btn-download" data-role="action-btn" ${actionDisabled ? 'disabled' : ''}>
          ${escapeHtml(actionLabel)}
        </button>
        ${downloaded ? '<button class="dl-btn-delete" data-role="delete-btn" title="Remove download" aria-label="Remove download">🗑</button>' : ''}
      </div>
    `;

    card.querySelector('[data-role="action-btn"]').addEventListener('click', () => handleAction(pack, local));
    const deleteBtn = card.querySelector('[data-role="delete-btn"]');
    if (deleteBtn) deleteBtn.addEventListener('click', () => handleDelete(pack));

    return card;
  }

  async function handleAction(pack, local) {
    if (local) {
      if (hasUpdate(pack)) {
        await downloadPack(pack);
      } else {
        window.location.href = `/pages/offline-library.html?pack=${encodeURIComponent(pack.id)}`;
      }
      return;
    }
    await downloadPack(pack);
  }

  async function handleDelete(pack) {
    if (!confirm(`Remove "${pack.name}" from your device? You can re-download it later.`)) return;
    try {
      await KH_DB.deletePack(pack.id);
      state.localPacks.delete(pack.id);
      render();
    } catch (err) {
      alert('Could not remove pack: ' + err.message);
    }
  }

  // ------------------------------------------------------------------
  // Download
  // ------------------------------------------------------------------
  async function downloadPack(pack) {
    if (!window.KH_IS_ONLINE || !window.KH_IS_ONLINE()) {
      alert('You need to be online to download a pack.');
      return;
    }

    const card = document.querySelector(`[data-pack-id="${pack.id}"]`);
    if (!card) return;

    const progressWrap = card.querySelector('[data-role="progress"]');
    const progressFill = card.querySelector('[data-role="progress-fill"]');
    const progressLabel = card.querySelector('[data-role="progress-label"]');
    const statusText = card.querySelector('[data-role="status-text"]');
    const actionBtn = card.querySelector('[data-role="action-btn"]');
    const deleteBtn = card.querySelector('[data-role="delete-btn"]');

    progressWrap.classList.add('is-active');
    actionBtn.disabled = true;
    actionBtn.textContent = 'Downloading…';
    if (deleteBtn) deleteBtn.hidden = true;
    statusText.textContent = '';

    try {
      const response = await fetch(`/api/packs/${pack.id}/download`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error(`Server responded ${response.status}`);

      const contentLength = Number(response.headers.get('Content-Length') || 0);
      const expectedChecksum = response.headers.get('X-Pack-Checksum') || '';

      let bodyText;
      if (response.body && contentLength > 0 && response.body.getReader) {
        bodyText = await streamWithProgress(response, (received, total) => {
          const pct = Math.min(100, Math.round((received / total) * 100));
          progressFill.style.width = pct + '%';
          progressLabel.textContent = `${pct}% · ${formatBytes(received)} / ${formatBytes(total)}`;
        });
      } else {
        progressFill.style.width = '60%';
        progressLabel.textContent = 'Receiving…';
        bodyText = await response.text();
      }

      progressFill.style.width = '85%';
      progressLabel.textContent = 'Verifying…';

      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        throw new Error('Downloaded file is not valid JSON.');
      }

      const payloadChecksum = payload && payload.manifest && payload.manifest.checksum;
      if (expectedChecksum && payloadChecksum && expectedChecksum !== payloadChecksum) {
        throw new Error('Checksum mismatch — download may be corrupted.');
      }

      progressFill.style.width = '95%';
      progressLabel.textContent = 'Saving…';
      await KH_DB.savePack(payload);

      const local = await KH_DB.listPacks();
      state.localPacks = new Map(local.map((p) => [p.id, p]));

      progressFill.style.width = '100%';
      progressLabel.textContent = 'Done';
      statusText.textContent = '✅ Available offline';

      setTimeout(() => render(), 600);
      updateSummary();
    } catch (err) {
      console.error('Download failed:', err);
      progressFill.style.width = '0%';
      progressLabel.textContent = '';
      progressWrap.classList.remove('is-active');
      actionBtn.disabled = false;
      actionBtn.textContent = '⬇ Retry';
      statusText.innerHTML = `<span style="color:var(--danger)">Download failed: ${escapeHtml(err.message)}</span>`;
    }
  }

  async function streamWithProgress(response, onProgress) {
    const reader = response.body.getReader();
    const total = Number(response.headers.get('Content-Length')) || 0;
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress(received, total);
    }
    const blob = new Blob(chunks);
    return await blob.text();
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  async function updateSummary() {
    const count = state.localPacks.size;
    if (count === 0) {
      dom.summary.hidden = true;
      return;
    }
    dom.summary.hidden = false;
    dom.downloadedCount.textContent = String(count);
    try {
      const est = await KH_DB.getStorageEstimate();
      dom.storageUsed.textContent = formatBytes(est.usage || 0);
    } catch {
      dom.storageUsed.textContent = '—';
    }
  }

  // ------------------------------------------------------------------
  // Filters
  // ------------------------------------------------------------------
  let filtersPopulated = false;
  function populateFiltersIfNeeded() {
    if (filtersPopulated) return;
    filtersPopulated = true;
    const subjects = new Map();
    const levels = new Set();
    for (const p of state.packs) {
      if (p.subject && p.subject.slug) subjects.set(p.subject.slug, p.subject.name || p.subject.slug);
      if (p.level) levels.add(p.level);
    }
    for (const [slug, name] of [...subjects.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
      const opt = document.createElement('option');
      opt.value = slug;
      opt.textContent = name;
      dom.filterSubject.appendChild(opt);
    }
    for (const level of [...levels].sort()) {
      const opt = document.createElement('option');
      opt.value = level;
      opt.textContent = level;
      dom.filterLevel.appendChild(opt);
    }
  }

  dom.filterSubject.addEventListener('change', (e) => { state.filters.subject = e.target.value; render(); });
  dom.filterLevel.addEventListener('change', (e) => { state.filters.level = e.target.value; render(); });
  dom.filterStatus.addEventListener('change', (e) => { state.filters.status = e.target.value; render(); });
  dom.filterSort.addEventListener('change', (e) => { state.filters.sort = e.target.value; render(); });
  dom.retryBtn.addEventListener('click', () => { filtersPopulated = false; loadPacks(); });

  function resetFilters() {
    state.filters = { subject: '', level: '', status: 'all', sort: 'name' };
    dom.filterSubject.value = '';
    dom.filterLevel.value = '';
    dom.filterStatus.value = 'all';
    dom.filterSort.value = 'name';
    render();
  }
  dom.resetFiltersBtn.addEventListener('click', resetFilters);
  dom.resetFiltersEmptyBtn.addEventListener('click', resetFilters);

  window.addEventListener('kh:connection-change', () => render());

  // ------------------------------------------------------------------
  // Scroll reveal
  // ------------------------------------------------------------------
  function observeCards() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isDataSaver = document.documentElement.classList.contains('data-saver');
    const cards = dom.grid.querySelectorAll('.dl-card');

    if (prefersReducedMotion || isDataSaver || !('IntersectionObserver' in window)) {
      cards.forEach((c) => c.classList.add('is-visible'));
      return;
    }

    if (state.revealObserver) state.revealObserver.disconnect();
    state.revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = Array.from(entry.target.parentElement.children).indexOf(entry.target);
          setTimeout(() => {
            entry.target.classList.add('is-visible');
          }, Math.min(idx * 60, 300));
          state.revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    cards.forEach((c) => state.revealObserver.observe(c));
  }

  // ------------------------------------------------------------------
  // Utils
  // ------------------------------------------------------------------
  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadPacks);
  else loadPacks();
})();