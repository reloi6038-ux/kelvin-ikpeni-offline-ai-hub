// server/services/localNetwork.js
const os = require('os');
const crypto = require('crypto');
const logger = require('../utils/logger');

let bonjour = null;
let publishedService = null;
let currentSession = null;

/**
 * Find the LAN IP address of this machine.
 * Prefers Wi-Fi or Ethernet over VPN/tunnel adapters.
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      // Skip IPv6, internal (loopback), and obvious virtual adapters
      if (addr.family !== 'IPv4') continue;
      if (addr.internal) continue;
      if (/^169\.254\./.test(addr.address)) continue;  // APIPA
      if (/^172\.(1[7-9]|2[0-9]|3[01])\./.test(addr.address)) continue; // Docker/WSL

      // Score adapters: Wi-Fi/Ethernet higher than VM adapters
      let score = 0;
      if (/wi-?fi|wlan|wireless|ethernet|eth|en/i.test(name)) score += 10;
      if (/virtualbox|vmware|hyper-v|vbox|docker|wsl/i.test(name)) score -= 20;
      candidates.push({ name, address: addr.address, score });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].address;
}

/**
 * Start an mDNS-published classroom session.
 */
function startClassroomSession(options = {}) {
  if (currentSession) {
    return currentSession;
  }

  const port = Number(process.env.PORT) || 3000;
  const ip = getLocalIP();
  if (!ip) {
    throw new Error('No LAN IP found. Connect to Wi-Fi or Ethernet.');
  }

  const sessionId = crypto.randomBytes(6).toString('hex');
  const classroomName = options.name || 'Kelvin Hub Classroom';
  const joinUrl = `http://${ip}:${port}/pages/classroom.html?session=${sessionId}`;
  const shortUrl = `http://${ip}:${port}/c`;

  currentSession = {
    id: sessionId,
    name: classroomName,
    ip,
    port,
    joinUrl,
    shortUrl,
    startedAt: new Date().toISOString(),
    students: new Map(),   // clientId → { name, joinedAt, lastSeen, progress }
    announcements: [],
    packsToShare: options.packIds || [],
    hostname: 'kelvin-hub.local'
  };

  // Try to publish mDNS (fails silently if port 5353 is busy)
  try {
    bonjour = require('bonjour-service').default
      ? new (require('bonjour-service').default)()
      : require('bonjour-service')();

    publishedService = bonjour.publish({
      name: classroomName,
      type: 'http',
      port,
      host: 'kelvin-hub.local',
      txt: {
        description: 'Offline AI Learning Classroom',
        version: '1.0',
        session: sessionId
      }
    });

    publishedService.on('up', () => {
      logger.info(`mDNS published: ${classroomName} at kelvin-hub.local:${port}`);
    });
    publishedService.on('error', (err) => {
      logger.warn(`mDNS error (non-fatal): ${err.message}`);
    });
  } catch (err) {
    logger.warn(`mDNS unavailable (${err.message}). LAN IP access still works.`);
  }

  logger.info(`Classroom session started: ${sessionId}`);
  logger.info(`Join URL: ${joinUrl}`);
  logger.info(`Alternative: http://kelvin-hub.local:${port}/pages/classroom.html?session=${sessionId}`);
  logger.info(`Local IP: ${ip}`);

  return currentSession;
}

function stopClassroomSession() {
  if (!currentSession) return;
  try {
    if (publishedService) {
      publishedService.stop(() => {});
      publishedService = null;
    }
    if (bonjour) {
      bonjour.destroy();
      bonjour = null;
    }
  } catch (err) {
    logger.warn(`Cleanup error: ${err.message}`);
  }
  currentSession = null;
  logger.info('Classroom session stopped');
}

function getSession() {
  return currentSession;
}

function joinSession(sessionId, student) {
  if (!currentSession || currentSession.id !== sessionId) {
    return null;
  }
  const clientId = student.clientId;
  const existing = currentSession.students.get(clientId);
  const now = new Date().toISOString();

  if (existing) {
    existing.lastSeen = now;
    if (student.name) existing.name = student.name;
    if (student.progress) existing.progress = student.progress;
  } else {
    currentSession.students.set(clientId, {
      clientId,
      name: student.name || `Student ${currentSession.students.size + 1}`,
      joinedAt: now,
      lastSeen: now,
      progress: student.progress || 'joining'
    });
  }
  return currentSession;
}

function heartbeat(sessionId, clientId, progress) {
  if (!currentSession || currentSession.id !== sessionId) return null;
  const student = currentSession.students.get(clientId);
  if (!student) return null;
  student.lastSeen = new Date().toISOString();
  if (progress) student.progress = progress;
  return student;
}

function leaveSession(sessionId, clientId) {
  if (!currentSession || currentSession.id !== sessionId) return null;
  currentSession.students.delete(clientId);
  return currentSession;
}

function getStudentList() {
  if (!currentSession) return [];
  return Array.from(currentSession.students.values())
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
}

function addAnnouncement(text) {
  if (!currentSession) return null;
  const announcement = {
    id: crypto.randomBytes(4).toString('hex'),
    text,
    at: new Date().toISOString()
  };
  currentSession.announcements.unshift(announcement);
  currentSession.announcements = currentSession.announcements.slice(0, 10);
  return announcement;
}

module.exports = {
  getLocalIP,
  startClassroomSession,
  stopClassroomSession,
  getSession,
  joinSession,
  heartbeat,
  leaveSession,
  getStudentList,
  addAnnouncement
};