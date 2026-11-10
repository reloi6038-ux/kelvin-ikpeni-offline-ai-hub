// public/js/sync.js — Manual sync UI helpers
// Extends the base KH_SYNC from connectivity.js with progress feedback.
// Exposes window.KH_SYNC_UI
// Usage:
//   KH_SYNC_UI.syncWithToast();   // fire sync + show toast on result
//   KH_SYNC_UI.getStatus();        // { pending, online, syncing, lastSyncAt }
//   KH_SYNC_UI.autoStart();        // begin polling sync status every 30s

(function () {
  'use strict';

  const state = {
    lastSyncAt: null,
    lastSyncResult: null,
    pollHandle: null
  };

  // ------------------------------------------------------------------
  // Toast helper (creates its own if page doesn't have one)
  // ------------------------------------------------------------------
  function showToast(message, type = '') {
    let container = document.getElementById('sync-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'sync-toast-container';
      container.style.cssText =
        'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;' +
        'display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.textContent = message;
    const bg = type === 'error' ? '#dc2626'
             : type === 'success' ? '#16a34a'
             : '#0f2027';
    el.style.cssText =
      `padding:10px 18px;background:${bg};color:#fff;border-radius:999px;` +
      `font-size:0.85rem;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,0.2);` +
      `pointer-events:auto;animation:syncToastIn 200ms ease;`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // Inject keyframes once
  if (!document.getElementById('sync-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'sync-toast-styles';
    style.textContent =
      '@keyframes syncToastIn{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}';
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------------
  // Sync with UI feedback
  // ------------------------------------------------------------------
  async function syncWithToast() {
    if (!window.KH_SYNC) {
      showToast('Sync not available', 'error');
      return { ok: false, reason: 'no_sync_module' };
    }
    if (!window.KH_IS_ONLINE || !window.KH_IS_ONLINE()) {
      showToast('You are offline — sync when connected', 'error');
      return { ok: false, reason: 'offline' };
    }

    showToast('Syncing…');
    try {
      const result = await window.KH_SYNC.syncNow();
      state.lastSyncAt = new Date().toISOString();
      state.lastSyncResult = result;

      if (result && result.skipped) {
        if (result.reason === 'nothing_pending') {
          showToast('All caught up — nothing to sync', 'success');
        } else if (result.reason === 'offline') {
          showToast('Offline — cannot sync', 'error');
        } else {
          showToast('Sync skipped: ' + (result.reason || 'unknown'));
        }
      } else if (result && result.ok) {
        const applied = result.applied || 0;
        const dup = result.duplicate || 0;
        if (applied > 0) {
          showToast(`Synced ${applied} attempt${applied !== 1 ? 's' : ''}` +
                    (dup > 0 ? ` (${dup} already synced)` : ''), 'success');
        } else if (dup > 0) {
          showToast(`All ${dup} attempt${dup !== 1 ? 's' : ''} already synced`, 'success');
        } else {
          showToast('Sync complete', 'success');
        }
      } else {
        showToast('Sync failed: ' + (result && result.error || 'unknown'), 'error');
      }
      return result;
    } catch (err) {
      showToast('Sync failed: ' + err.message, 'error');
      return { ok: false, error: err.message };
    }
  }

  // ------------------------------------------------------------------
  // Status
  // ------------------------------------------------------------------
  async function getStatus() {
    const online = window.KH_IS_ONLINE ? window.KH_IS_ONLINE() : navigator.onLine;
    let pending = 0;
    try {
      if (window.KH_DB) {
        const attempts = await KH_DB.getPendingAttempts();
        pending = attempts.length;
      }
    } catch {}
    const syncing = document.getElementById('connection-badge')?.classList.contains('badge-syncing') || false;
    return {
      online,
      pending,
      syncing,
      lastSyncAt: state.lastSyncAt,
      lastSyncResult: state.lastSyncResult
    };
  }

  // ------------------------------------------------------------------
  // Auto-poll: refresh pending count every 30s and update any bound elements
  // ------------------------------------------------------------------
  function autoStart() {
    if (state.pollHandle) return;
    state.pollHandle = setInterval(async () => {
      const status = await getStatus();
      document.querySelectorAll('[data-sync-pending]').forEach((el) => {
        el.textContent = String(status.pending);
      });
      document.querySelectorAll('[data-sync-status]').forEach((el) => {
        if (status.syncing) el.textContent = 'Syncing…';
        else if (!status.online) el.textContent = 'Offline';
        else if (status.pending > 0) el.textContent = `${status.pending} pending`;
        else el.textContent = 'All synced';
      });
    }, 30000);
  }

  // ------------------------------------------------------------------
  // Wire data-sync-trigger buttons automatically
  // ------------------------------------------------------------------
  function bindTriggers() {
    document.querySelectorAll('[data-sync-trigger]').forEach((btn) => {
      if (btn.dataset.syncWired === '1') return;
      btn.dataset.syncWired = '1';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'Syncing…';
        try {
          await syncWithToast();
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    });
  }

  // Auto-bind on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindTriggers();
      autoStart();
    });
  } else {
    bindTriggers();
    autoStart();
  }

  // Re-bind whenever new content is rendered
  const observer = new MutationObserver(() => bindTriggers());
  observer.observe(document.body, { childList: true, subtree: true });

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  window.KH_SYNC_UI = {
    syncWithToast,
    getStatus,
    autoStart,
    showToast
  };
})();