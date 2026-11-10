// public/js/offline-db.js
// IndexedDB wrapper. Five object stores:
//   packs     — downloaded pack manifests
//   lessons   — lesson content (with ai{} responses)
//   quizzes   — quiz content
//   attempts  — pending sync queue + history
//   meta      — key/value settings
//
// All methods return Promises. No dependencies.

(function () {
  'use strict';

  const DB_NAME = 'kelvin_hub_offline';
  const DB_VERSION = 1;
  const STORES = ['packs', 'lessons', 'quizzes', 'attempts', 'meta'];

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const storeName of STORES) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            if (storeName === 'attempts') {
              store.createIndex('synced', 'synced', { unique: false });
            }
            if (storeName === 'lessons') {
              store.createIndex('packId', 'packId', { unique: false });
            }
            if (storeName === 'quizzes') {
              store.createIndex('packId', 'packId', { unique: false });
            }
          }
        }
      };

      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(storeName, mode) {
    return open().then((db) => db.transaction(storeName, mode).objectStore(storeName));
  }

  function put(storeName, value) {
    return tx(storeName, 'readwrite').then((store) =>
      new Promise((resolve, reject) => {
        const req = store.put(value);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
    );
  }

  function get(storeName, id) {
    return tx(storeName, 'readonly').then((store) =>
      new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })
    );
  }

  function getAll(storeName) {
    return tx(storeName, 'readonly').then((store) =>
      new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      })
    );
  }

  function remove(storeName, id) {
    return tx(storeName, 'readwrite').then((store) =>
      new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      })
    );
  }

  function getAllByIndex(storeName, indexName, value) {
    return tx(storeName, 'readonly').then((store) =>
      new Promise((resolve, reject) => {
        const req = store.index(indexName).getAll(value);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      })
    );
  }

  async function savePack(pack) {
    if (!pack || !pack.packId || !Array.isArray(pack.lessons)) {
      throw new Error('Invalid pack payload');
    }

    await put('packs', {
      id: pack.packId,
      name: pack.name,
      slug: pack.slug,
      version: pack.version,
      language: pack.language,
      level: pack.level,
      curriculum: pack.curriculum,
      subject: pack.subject || null,
      lessonCount: pack.lessons.length,
      quizCount: (pack.quizzes || []).length,
      checksum: pack.manifest ? pack.manifest.checksum : null,
      downloadedAt: new Date().toISOString(),
      sizeBytes: estimateSize(pack),
      lastSyncAt: null,
      hasUpdates: false
    });

    for (const lesson of pack.lessons) {
      await put('lessons', {
        id: lesson.id,
        packId: pack.packId,
        title: lesson.title,
        summary: lesson.summary || '',
        content: lesson.content,
        level: lesson.level,
        curriculum: lesson.curriculum,
        contentType: lesson.contentType,
        language: lesson.language,
        order: lesson.order || 0,
        estimatedMinutes: lesson.estimatedMinutes || 10,
        keyPoints: lesson.keyPoints || [],
        keywords: lesson.keywords || [],
        sourceRef: lesson.sourceRef || '',
        version: lesson.version || 1,
        ai: lesson.ai || {},
        readAt: null,
        lastViewedAt: null
      });
    }

    for (const quiz of pack.quizzes || []) {
      await put('quizzes', {
        id: quiz.id,
        packId: pack.packId,
        title: quiz.title,
        lessonId: quiz.lessonId,
        level: quiz.level,
        contentType: quiz.contentType,
        passingScore: quiz.passingScore || 70,
        timeLimitMinutes: quiz.timeLimitMinutes || 0,
        questions: quiz.questions
      });
    }

    await put('meta', {
      id: 'last_download',
      value: { packId: pack.packId, at: new Date().toISOString() }
    });

    return true;
  }

  function estimateSize(pack) {
    try {
      return new Blob([JSON.stringify(pack)]).size;
    } catch { return 0; }
  }

  function listPacks() { return getAll('packs'); }
  function getLesson(id) { return get('lessons', id); }
  async function lessonsForPack(packId) {
    const lessons = await getAllByIndex('lessons', 'packId', packId);
    return lessons.sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  function quizzesForPack(packId) { return getAllByIndex('quizzes', 'packId', packId); }
  function getQuiz(id) { return get('quizzes', id); }

  async function saveAttempt(attempt) {
    return put('attempts', {
      ...attempt,
      synced: 0,                                      // ← FIX: 0 instead of false
      savedAt: new Date().toISOString(),
      serverResponse: null
    });
  }

  async function getPendingAttempts() {
    return getAllByIndex('attempts', 'synced', IDBKeyRange.only(0));  // ← FIX: 0 instead of false
  }

  async function markAttemptSynced(clientId, serverResponse) {
    const existing = await get('attempts', clientId);
    if (!existing) return;
    await put('attempts', {
      ...existing,
      synced: 1,                                      // ← FIX: 1 instead of true
      syncedAt: new Date().toISOString(),
      serverResponse: serverResponse || null
    });
  }

  async function markPackHasUpdates(packId) {
    const pack = await get('packs', packId);
    if (!pack) return;
    await put('packs', { ...pack, hasUpdates: true });
  }

  async function deletePack(packId) {
    const lessons = await lessonsForPack(packId);
    const quizzes = await quizzesForPack(packId);
    for (const l of lessons) await remove('lessons', l.id);
    for (const q of quizzes) await remove('quizzes', q.id);
    await remove('packs', packId);
  }

  async function getStorageEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) return { usage: 0, quota: 0 };
    try {
      const est = await navigator.storage.estimate();
      return { usage: est.usage || 0, quota: est.quota || 0 };
    } catch { return { usage: 0, quota: 0 }; }
  }

  window.KH_DB = {
    open, put, get, getAll, remove,
    savePack, listPacks, getLesson, lessonsForPack,
    quizzesForPack, getQuiz,
    saveAttempt, getPendingAttempts, markAttemptSynced,
    markPackHasUpdates, deletePack, getStorageEstimate
  };
})();