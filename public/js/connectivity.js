// public/js/connectivity.js — Sync queue manager
(function () {
  'use strict';

  const SYNC_INTERVAL_MS = 30_000;
  const MAX_BATCH_SIZE = 50;
  let syncing = false;
  let intervalHandle = null;

  function isOnline() {
    return typeof window.KH_IS_ONLINE === 'function'
      ? window.KH_IS_ONLINE()
      : navigator.onLine;
  }

  async function syncNow() {
    if (syncing) return { skipped: true, reason: 'already_syncing' };
    if (!isOnline()) return { skipped: true, reason: 'offline' };
    if (!window.KH_DB) return { skipped: true, reason: 'db_not_ready' };

    syncing = true;
    setBadge('syncing');

    try {
      const pending = await KH_DB.getPendingAttempts();
      if (pending.length === 0) {
        setBadge(isOnline() ? 'online' : 'offline');
        return { skipped: true, reason: 'nothing_pending' };
      }

      let totalApplied = 0;
      let totalDuplicate = 0;
      let totalRejected = 0;

      for (let i = 0; i < pending.length; i += MAX_BATCH_SIZE) {
        const batch = pending.slice(i, i + MAX_BATCH_SIZE).map((a) => ({
          clientId: a.id,
          quizId: a.quizId,
          clientTimestamp: a.clientTimestamp,
          answers: a.answers,
          anonymousId: a.anonymousId || null
        }));

        const result = await postJSON('/api/sync/batch', { attempts: batch });
        if (!result || !result.data || !Array.isArray(result.data.results)) {
          throw new Error('Unexpected batch response');
        }

        for (const r of result.data.results) {
          if (r.status === 'applied' || r.status === 'duplicate') {
            await KH_DB.markAttemptSynced(r.clientId, r);
            if (r.status === 'applied') totalApplied++;
            else totalDuplicate++;
          } else {
            totalRejected++;
          }
        }
      }

      const summary = { applied: totalApplied, duplicate: totalDuplicate, rejected: totalRejected };
      setBadge('online');
      window.dispatchEvent(new CustomEvent('kh:sync-complete', { detail: summary }));
      return { ok: true, ...summary };
    } catch (err) {
      console.warn('Sync failed:', err.message);
      setBadge(isOnline() ? 'online' : 'offline');
      window.dispatchEvent(new CustomEvent('kh:sync-failed', { detail: { error: err.message } }));
      return { ok: false, error: err.message };
    } finally {
      syncing = false;
    }
  }

  function setBadge(state) {
    const badge = document.getElementById('connection-badge');
    if (!badge) return;
    badge.classList.remove('badge-online', 'badge-offline', 'badge-syncing', 'badge-demo');
    const dot = '<span class="dot"></span>';

    if (state === 'syncing') {
      badge.classList.add('badge-syncing');
      badge.innerHTML = `${dot} Syncing…`;
    } else if (state === 'online') {
      badge.classList.add('badge-online');
      badge.innerHTML = `${dot} Online`;
    } else {
      badge.classList.add('badge-offline');
      badge.innerHTML = `${dot} Offline`;
    }
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
    }
    return res.json();
  }

  function startAutoSync() {
    if (intervalHandle) return;
    intervalHandle = setInterval(() => {
      if (isOnline()) syncNow();
    }, SYNC_INTERVAL_MS);

    window.addEventListener('online', () => {
      setTimeout(syncNow, 1500);
    });

    window.addEventListener('kh:connection-change', (e) => {
      if (e.detail.online && !e.detail.demoOffline) {
        setTimeout(syncNow, 1500);
      }
    });

    window.addEventListener('kh:attempt-saved', () => {
      if (isOnline()) {
        setTimeout(syncNow, 500);
      }
    });
  }

  window.KH_SYNC = { syncNow, startAutoSync, setBadge };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAutoSync);
  } else {
    startAutoSync();
  }
})();