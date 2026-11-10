// public/js/app.js — Shared bootstrap for every page
// Handles: nav toggle, connection badge, data saver, demo offline, footer year.

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // 1. Mobile nav toggle
  // ------------------------------------------------------------------
  const navToggle = document.getElementById('nav-toggle');
  const mainNav = document.getElementById('main-nav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const open = mainNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    mainNav.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => {
        mainNav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      })
    );
  }

  // ------------------------------------------------------------------
  // 2. Connection badge (real + demo)
  // ------------------------------------------------------------------
  const badge = document.getElementById('connection-badge');
  const demoOfflineToggle = document.getElementById('demo-offline-toggle');

  function getDemoOffline() {
    return localStorage.getItem('kh_demo_offline') === '1';
  }
  function setDemoOffline(v) {
    localStorage.setItem('kh_demo_offline', v ? '1' : '0');
  }

  function updateBadge() {
    if (!badge) return;
    const demo = getDemoOffline();
    const online = navigator.onLine && !demo;

    badge.classList.remove('badge-online', 'badge-offline', 'badge-syncing', 'badge-demo');
    if (demo) {
      badge.classList.add('badge-demo');
      badge.innerHTML = '<span class="dot"></span> Demo Offline';
    } else if (online) {
      badge.classList.add('badge-online');
      badge.innerHTML = '<span class="dot"></span> Online';
    } else {
      badge.classList.add('badge-offline');
      badge.innerHTML = '<span class="dot"></span> Offline';
    }

    window.dispatchEvent(new CustomEvent('kh:connection-change', {
      detail: { online, demoOffline: demo }
    }));
  }

  window.addEventListener('online', updateBadge);
  window.addEventListener('offline', updateBadge);
  updateBadge();

  if (demoOfflineToggle) {
    const active = getDemoOffline();
    demoOfflineToggle.setAttribute('aria-pressed', active ? 'true' : 'false');
    demoOfflineToggle.addEventListener('click', () => {
      const next = !getDemoOffline();
      setDemoOffline(next);
      demoOfflineToggle.setAttribute('aria-pressed', next ? 'true' : 'false');
      updateBadge();
    });
  }

  // Expose helper for other scripts
  window.KH_IS_ONLINE = () => navigator.onLine && !getDemoOffline();

  // ------------------------------------------------------------------
  // 3. Data saver mode
  // ------------------------------------------------------------------
  const dataSaverToggle = document.getElementById('data-saver-toggle');

  function applyDataSaver(on) {
    document.documentElement.classList.toggle('data-saver', on);
    if (dataSaverToggle) dataSaverToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    localStorage.setItem('kh_data_saver', on ? '1' : '0');
  }

  applyDataSaver(localStorage.getItem('kh_data_saver') === '1');

  if (dataSaverToggle) {
    dataSaverToggle.addEventListener('click', () => {
      const next = !document.documentElement.classList.contains('data-saver');
      applyDataSaver(next);
    });
  }

  // Auto-enable on very slow connections (browser save-data hint)
  if (navigator.connection && navigator.connection.saveData) {
    applyDataSaver(true);
  }

  // ------------------------------------------------------------------
  // 4. Footer year
  // ------------------------------------------------------------------
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // ------------------------------------------------------------------
  // 5. Service worker registration (silent until Step 10)
  // ------------------------------------------------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // sw.js doesn't exist yet — silent
      });
    });
  }
})();