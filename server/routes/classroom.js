// server/routes/classroom.js
const express = require('express');
const QRCode = require('qrcode');
const mongoose = require('mongoose');
const localNetwork = require('../services/localNetwork');
const LearningPack = require('../models/LearningPack');
const { requireAdmin } = require('../middleware/auth');
const { ok, fail } = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================
// Admin: start a classroom session
// ============================================================
router.post('/start', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const packIds = Array.isArray(b.packIds) ? b.packIds : [];

    // Validate pack IDs if provided
    let validPacks = [];
    if (packIds.length > 0) {
      validPacks = await LearningPack.find({
        _id: { $in: packIds.filter((id) => mongoose.isValidObjectId(id)) },
        isPublished: true
      }).select('_id name').lean();
    }

    const session = localNetwork.startClassroomSession({
      name: b.name || 'Kelvin Hub Classroom',
      packIds: validPacks.map((p) => p._id.toString())
    });

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(session.joinUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#0f2027', light: '#ffffff' }
    });

    return res.json(ok({
      sessionId: session.id,
      name: session.name,
      ip: session.ip,
      port: session.port,
      joinUrl: session.joinUrl,
      shortUrl: session.shortUrl,
      hostname: session.hostname,
      qrCode: qrDataUrl,
      packsToShare: validPacks.map((p) => ({ id: p._id.toString(), name: p.name })),
      startedAt: session.startedAt
    }));
  } catch (err) {
    logger.error(`POST /api/classroom/start → ${err.message}`);
    return fail(res, 500, err.message || 'Could not start classroom', 'CLASSROOM_START_ERROR');
  }
});

// ============================================================
// Admin: stop session
// ============================================================
router.post('/stop', requireAdmin, (req, res) => {
  try {
    localNetwork.stopClassroomSession();
    return res.json(ok({ stopped: true }));
  } catch (err) {
    logger.error(`POST /api/classroom/stop → ${err.message}`);
    return fail(res, 500, 'Could not stop classroom', 'CLASSROOM_STOP_ERROR');
  }
});

// ============================================================
// Admin: session status + student list
// ============================================================
router.get('/status', requireAdmin, (req, res) => {
  const session = localNetwork.getSession();
  if (!session) {
    return res.json(ok({ active: false }));
  }
  const students = localNetwork.getStudentList();
  return res.json(ok({
    active: true,
    sessionId: session.id,
    name: session.name,
    ip: session.ip,
    port: session.port,
    joinUrl: session.joinUrl,
    hostname: session.hostname,
    startedAt: session.startedAt,
    studentCount: students.length,
    students,
    announcements: session.announcements
  }));
});

// ============================================================
// Admin: push announcement to classroom
// ============================================================
router.post('/announce', requireAdmin, (req, res) => {
  try {
    const text = String((req.body || {}).text || '').trim().slice(0, 280);
    if (!text) return fail(res, 400, 'text is required', 'INVALID_PAYLOAD');
    const announcement = localNetwork.addAnnouncement(text);
    if (!announcement) return fail(res, 404, 'No active classroom session', 'NO_SESSION');
    return res.json(ok(announcement));
  } catch (err) {
    logger.error(`POST /api/classroom/announce → ${err.message}`);
    return fail(res, 500, 'Could not post announcement', 'ANNOUNCE_ERROR');
  }
});

// ============================================================
// PUBLIC: session info (students hit this after scanning QR)
// ============================================================
router.get('/session/:sessionId', (req, res) => {
  const session = localNetwork.getSession();
  if (!session || session.id !== req.params.sessionId) {
    return fail(res, 404, 'Classroom session not active', 'SESSION_NOT_FOUND');
  }
  return res.json(ok({
    sessionId: session.id,
    name: session.name,
    startedAt: session.startedAt,
    packsToShare: session.packsToShare,
    announcements: session.announcements
  }));
});

// ============================================================
// PUBLIC: join session
// ============================================================
router.post('/join/:sessionId', (req, res) => {
  try {
    const b = req.body || {};
    if (!b.clientId || typeof b.clientId !== 'string') {
      return fail(res, 400, 'clientId is required', 'INVALID_PAYLOAD');
    }
    const session = localNetwork.joinSession(req.params.sessionId, {
      clientId: b.clientId,
      name: b.name,
      progress: 'connected'
    });
    if (!session) return fail(res, 404, 'Session not active', 'SESSION_NOT_FOUND');

    return res.json(ok({
      sessionId: session.id,
      name: session.name,
      packsToShare: session.packsToShare,
      announcements: session.announcements,
      studentCount: localNetwork.getStudentList().length
    }));
  } catch (err) {
    logger.error(`POST /api/classroom/join → ${err.message}`);
    return fail(res, 500, 'Could not join', 'JOIN_ERROR');
  }
});

// ============================================================
// PUBLIC: heartbeat (student reports activity)
// ============================================================
router.post('/heartbeat/:sessionId', (req, res) => {
  const b = req.body || {};
  const student = localNetwork.heartbeat(
    req.params.sessionId,
    b.clientId,
    b.progress
  );
  if (!student) return fail(res, 404, 'Not in session', 'NOT_IN_SESSION');
  return res.json(ok({
    lastSeen: student.lastSeen,
    announcements: localNetwork.getSession()?.announcements || []
  }));
});

// ============================================================
// PUBLIC: leave session
// ============================================================
router.post('/leave/:sessionId', (req, res) => {
  const b = req.body || {};
  localNetwork.leaveSession(req.params.sessionId, b.clientId);
  return res.json(ok({ left: true }));
});

module.exports = router;