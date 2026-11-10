// public/js/classroom.js — Student-side classroom client
(function () {
  'use strict';

  const state = {
    sessionId: null,
    clientId: null,
    studentName: '',
    heartbeatHandle: null,
    lastAnnouncementId: null
  };

  const dom = {
    viewJoin: document.getElementById('view-join'),
    viewClassroom: document.getElementById('view-classroom'),
    joinTitle: document.getElementById('join-title'),
    joinSub: document.getElementById('join-sub'),
    joinLoading: document.getElementById('join-loading'),
    joinError: document.getElementById('join-error'),
    joinErrorMsg: document.getElementById('join-error-msg'),
    joinForm: document.getElementById('join-form'),
    studentName: document.getElementById('student-name'),
    joinBtn: document.getElementById('join-btn'),
    classroomTitle: document.getElementById('classroom-title'),
    classroomSub: document.getElementById('classroom-sub'),
    announcementsCard: document.getElementById('announcements-card'),
    announcementList: document.getElementById('announcement-list'),
    packsList: document.getElementById('packs-list'),
    studentCount: document.getElementById('student-count'),
    leaveBtn: document.getElementById('leave-btn')
  };

  function getOrCreateClientId() {
    let id = localStorage.getItem('kh_classroom_client_id');
    if (!id) {
      id = 'stu_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      localStorage.setItem('kh_classroom_client_id', id);
    }
    return id;
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    state.sessionId = params.get('session');
    state.clientId = getOrCreateClientId();
    state.studentName = localStorage.getItem('kh_classroom_name') || '';

    if (!state.sessionId) {
      showError('No session ID in the URL. Ask your teacher for the QR code.');
      return;
    }

    // Load session metadata
    try {
      const res = await fetch(`/api/classroom/session/${state.sessionId}`);
      if (!res.ok) throw new Error('Session not found');
      const json = await res.json();
      const data = json.data;

      dom.joinTitle.textContent = `Welcome to ${data.name}`;
      dom.joinSub.textContent = `Started at ${new Date(data.startedAt).toLocaleTimeString()}`;

      // Pre-fill name if remembered
      if (state.studentName) dom.studentName.value = state.studentName;

      dom.joinLoading.hidden = true;
      dom.joinForm.hidden = false;
      dom.studentName.focus();
    } catch (err) {
      showError(err.message);
    }
  }

  function showError(msg) {
    dom.joinLoading.hidden = true;
    dom.joinForm.hidden = true;
    dom.joinError.hidden = false;
    dom.joinErrorMsg.textContent = msg;
  }

  async function join() {
    state.studentName = dom.studentName.value.trim().slice(0, 40);
    if (state.studentName) {
      localStorage.setItem('kh_classroom_name', state.studentName);
    }

    dom.joinBtn.disabled = true;
    dom.joinBtn.textContent = 'Joining…';

    try {
      const res = await fetch(`/api/classroom/join/${state.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: state.clientId,
          name: state.studentName
        })
      });
      if (!res.ok) throw new Error('Could not join');
      const json = await res.json();
      enterClassroom(json.data);
    } catch (err) {
      dom.joinBtn.disabled = false;
      dom.joinBtn.textContent = 'Enter classroom →';
      alert('Could not join: ' + err.message);
    }
  }

  function enterClassroom(data) {
    dom.viewJoin.hidden = true;
    dom.viewClassroom.hidden = false;
    dom.classroomTitle.textContent = data.name;
    dom.classroomSub.textContent = `You're in! Welcome, ${state.studentName || 'student'}.`;

    renderAnnouncements(data.announcements || []);
    renderPacks(data.packsToShare || []);
    if (typeof data.studentCount === 'number') {
      dom.studentCount.textContent = String(data.studentCount);
    }

    startHeartbeat();
  }

  function renderAnnouncements(announcements) {
    if (announcements.length === 0) {
      dom.announcementsCard.hidden = true;
      return;
    }
    dom.announcementsCard.hidden = false;
    dom.announcementList.innerHTML = announcements.map((a) => `
      <div class="classroom-announcement">
        <div class="classroom-announcement-time">${new Date(a.at).toLocaleTimeString()}</div>
        <div class="classroom-announcement-text">${escapeHtml(a.text)}</div>
      </div>
    `).join('');

    // Toast on new announcement
    if (state.lastAnnouncementId && announcements[0].id !== state.lastAnnouncementId) {
      showToast(`📢 ${announcements[0].text}`);
    }
    if (announcements[0]) state.lastAnnouncementId = announcements[0].id;
  }

  async function renderPacks(packIds) {
    if (!packIds || packIds.length === 0) {
      dom.packsList.innerHTML = '<p class="classroom-muted">No packs shared yet.</p>';
      return;
    }

    // Fetch pack metadata
    dom.packsList.innerHTML = '<p class="classroom-muted">Loading packs…</p>';
    try {
      const downloads = await Promise.all(packIds.map(async (id) => {
        const local = await KH_DB.get('packs', id);
        return { id, local };
      }));

      const packData = await Promise.all(packIds.map(async (id) => {
        try {
          const res = await fetch(`/api/packs/${id}`);
          if (!res.ok) return null;
          const json = await res.json();
          return json.data;
        } catch {
          return null;
        }
      }));

      dom.packsList.innerHTML = packIds.map((id, i) => {
        const pack = packData[i];
        const downloaded = downloads[i].local;
        if (!pack) return '';
        return `
          <div class="classroom-pack" data-pack-id="${id}">
            <div class="classroom-pack-icon">${escapeHtml((pack.subject && pack.subject.icon) || '📘')}</div>
            <div class="classroom-pack-body">
              <div class="classroom-pack-title">${escapeHtml(pack.name)}</div>
              <div class="classroom-pack-meta">${pack.lessonCount} lessons · ${pack.sizeLabel}</div>
            </div>
            <button class="btn btn-sm ${downloaded ? 'btn-secondary' : 'btn-primary'}" data-download="${id}" ${downloaded ? 'disabled' : ''}>
              ${downloaded ? '✓ Downloaded' : '⬇ Download'}
            </button>
          </div>
        `;
      }).join('');

      dom.packsList.querySelectorAll('[data-download]').forEach((btn) => {
        btn.addEventListener('click', () => downloadPack(btn.dataset.download, btn));
      });
    } catch (err) {
      dom.packsList.innerHTML = `<p class="classroom-muted">Could not load packs: ${escapeHtml(err.message)}</p>`;
    }
  }

  async function downloadPack(packId, btn) {
    btn.disabled = true;
    btn.textContent = 'Downloading…';
    try {
      const res = await fetch(`/api/packs/${packId}/download`);
      if (!res.ok) throw new Error('Download failed');
      const payload = await res.json();
      await KH_DB.savePack(payload);
      btn.textContent = '✓ Downloaded';
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-secondary');
      showToast('Pack downloaded');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '⬇ Retry';
      showToast('Download failed: ' + err.message);
    }
  }

  function startHeartbeat() {
    if (state.heartbeatHandle) clearInterval(state.heartbeatHandle);
    // Send every 20 seconds
    state.heartbeatHandle = setInterval(sendHeartbeat, 20000);
    sendHeartbeat();
  }

  async function sendHeartbeat() {
    try {
      const res = await fetch(`/api/classroom/heartbeat/${state.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: state.clientId, progress: 'active' })
      });
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data;
      if (data.announcements) renderAnnouncements(data.announcements);

      // Refresh student count
      const statusRes = await fetch(`/api/classroom/session/${state.sessionId}`);
      if (statusRes.ok) {
        const statusJson = await statusRes.json();
        if (statusJson.data && statusJson.data.studentCount) {
          dom.studentCount.textContent = String(statusJson.data.studentCount);
        }
      }
    } catch {}
  }

  async function leave() {
    if (!confirm('Leave the classroom?')) return;
    try {
      await fetch(`/api/classroom/leave/${state.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: state.clientId })
      });
    } catch {}
    if (state.heartbeatHandle) clearInterval(state.heartbeatHandle);
    window.location.href = '/';
  }

  function showToast(msg) {
    const el = document.createElement('div');
    el.className = 'classroom-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  dom.joinBtn.addEventListener('click', join);
  dom.studentName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') join();
  });
  dom.leaveBtn.addEventListener('click', leave);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();