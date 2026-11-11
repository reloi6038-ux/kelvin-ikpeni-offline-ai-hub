// public/js/voice-pack.js — Renders "Download voice pack" button
(function () {
  'use strict';

  function renderVoicePack(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // If browser has native SpeechRecognition, no pack needed (works online instantly)
    const hasNative = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!window.KH_VOICE || !window.KH_VOICE.isSupported()) {
      container.innerHTML = '';
      return;
    }

    // Already downloaded
    if (window.KH_VOICE.isModelReady()) {
      // If native also available, hide the card entirely (no benefit to showing "ready")
      if (hasNative) {
        container.innerHTML = '';
        return;
      }
      container.innerHTML = `
        <div class="voice-pack-card" style="border-style: solid; border-color: #bbf7d0; background: #f0fdf4;">
          <div class="voice-pack-icon">✓</div>
          <div class="voice-pack-body">
            <p class="voice-pack-title" style="color: #166534;">Voice pack ready</p>
            <p class="voice-pack-desc">Offline voice input is available.</p>
          </div>
        </div>
      `;
      return;
    }

    // Not downloaded yet
    container.innerHTML = `
      <div class="voice-pack-card">
        <div class="voice-pack-icon">🎙️</div>
        <div class="voice-pack-body">
          <p class="voice-pack-title">Download voice pack</p>
          <p class="voice-pack-desc">10 MB — one-time download. Enables voice input offline.</p>
          <div class="voice-pack-progress" id="voice-pack-progress-wrap-${containerId}" hidden>
            <div class="voice-pack-progress-fill" id="voice-pack-progress-fill-${containerId}"></div>
          </div>
        </div>
        <button class="voice-pack-btn" id="voice-pack-btn-${containerId}">⬇ Download</button>
      </div>
    `;

    const btn = document.getElementById(`voice-pack-btn-${containerId}`);
    const progressWrap = document.getElementById(`voice-pack-progress-wrap-${containerId}`);
    const progressFill = document.getElementById(`voice-pack-progress-fill-${containerId}`);

    btn.addEventListener('click', async () => {
      if (!navigator.onLine) {
        alert('You need to be online to download the voice pack.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Starting…';
      progressWrap.hidden = false;

      try {
        await window.KH_VOICE.preloadWhisper((pct, msg) => {
          progressFill.style.width = pct + '%';
          btn.textContent = pct + '%';
        });
        btn.textContent = '✓ Ready';
        btn.classList.add('is-ready');
        setTimeout(() => renderVoicePack(containerId), 1000);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '⬇ Retry';
        progressWrap.hidden = true;
        alert('Voice pack download failed: ' + err.message);
      }
    });
  }

  window.KH_VOICE_PACK = { renderVoicePack };
})();