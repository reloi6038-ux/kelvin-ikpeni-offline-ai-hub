// server/services/contentImporter.js
// Extracts text from uploaded files and structures it into a lesson via AI

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { getAIConfig } = require('../config/ai');
const logger = require('../utils/logger');

const MAX_TEXT_LENGTH = 12000;

async function extractText(buffer, mimetype, originalname) {
  const lower = (originalname || '').toLowerCase();

  if (mimetype === 'application/pdf' || lower.endsWith('.pdf')) {
    const data = await pdfParse(buffer);
    return {
      text: data.text || '',
      pages: data.numpages || 0,
      kind: 'pdf'
    };
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value || '',
      pages: null,
      kind: 'docx'
    };
  }

  throw new Error('Unsupported file type. Upload a PDF or .docx.');
}

async function structureText(rawText, meta) {
  const trimmed = String(rawText || '').trim();
  if (trimmed.length < 100) {
    throw new Error('Extracted text is too short. Is this a scanned image PDF?');
  }

  const textForAI = trimmed.slice(0, MAX_TEXT_LENGTH);
  const cfg = getAIConfig();

  if (cfg.enabled) {
    try {
      const structured = await callAIForStructure(textForAI, meta, cfg);
      if (structured && structured.title && structured.content) {
        logger.info(`Structured via ${cfg.provider}: "${structured.title}"`);
        return { ...structured, provider: cfg.provider };
      }
    } catch (err) {
      logger.warn(`AI structuring failed (${err.message}), using heuristic`);
    }
  }

  return { ...heuristicStructure(trimmed, meta), provider: 'heuristic' };
}

async function callAIForStructure(text, meta, cfg) {
  const prompt = `You are a curriculum extraction assistant. Read the following document text and extract a single structured lesson.

Return ONLY valid JSON, no markdown, no explanation, no code fences. The JSON must have exactly these keys:
{
  "title": "concise lesson title, max 120 chars",
  "summary": "one-sentence description, max 200 chars",
  "content": "HTML paragraph content using <p>, <strong>, <em>, <ul>, <ol>, <li> tags only. Preserve the source's core content faithfully. 3-8 paragraphs.",
  "level": "one of JSS1, JSS2, JSS3, SS1, SS2, SS3 — infer from context or use the provided default",
  "keyPoints": ["array of 3-5 short string key points"],
  "keywords": ["array of 3-8 lowercase single-word keywords"],
  "sourceRef": "best guess at the source, e.g. 'JSS2 Mathematics, Chapter 3'",
  "quiz": {
    "title": "short quiz title",
    "questions": [
      {
        "questionText": "string",
        "options": ["exactly 4 strings"],
        "correctIndex": 0,
        "explanation": "1-2 sentence explanation"
      }
    ]
  }
}

Generate 3-5 quiz questions covering the key points. Do NOT include any text outside the JSON.

Context:
- Subject: ${meta.subjectName || '(unknown)'}
- Default level: ${meta.level || 'JSS2'}

Document text:
${text}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const url = buildProviderUrl(cfg);
    const headers = buildProviderHeaders(cfg);
    const body = buildProviderBody(cfg, prompt);

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Provider responded ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const raw = extractProviderContent(cfg.provider, data);
    return parseJSONFromText(raw);
  } finally {
    clearTimeout(timeout);
  }
}

function buildProviderUrl(cfg) {
  if (cfg.provider === 'gemini') {
    return `${cfg.baseUrl}/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
  }
  return `${cfg.baseUrl}/chat/completions`;
}

function buildProviderHeaders(cfg) {
  if (cfg.authStyle === 'bearer') {
    return { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' };
  }
  return { 'Content-Type': 'application/json' };
}

function buildProviderBody(cfg, prompt) {
  if (cfg.provider === 'gemini') {
    return {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 3000,
        responseMimeType: 'application/json'
      }
    };
  }
  return {
    model: cfg.model,
    messages: [
      { role: 'system', content: 'You are a curriculum extraction assistant that returns only valid JSON.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 3000,
    response_format: { type: 'json_object' }
  };
}

function extractProviderContent(provider, data) {
  if (provider === 'gemini') {
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  return data?.choices?.[0]?.message?.content || '';
}

function parseJSONFromText(raw) {
  if (!raw) throw new Error('Empty response from provider');
  let s = String(raw).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Response did not contain JSON');
  }
  s = s.slice(firstBrace, lastBrace + 1);
  const parsed = JSON.parse(s);

  if (!parsed.title || !parsed.content) {
    throw new Error('Parsed JSON missing required fields');
  }

  if (!parsed.quiz || !Array.isArray(parsed.quiz.questions)) {
    parsed.quiz = { title: `${parsed.title} — Quiz`, questions: [] };
  }
  parsed.quiz.questions = parsed.quiz.questions
    .filter((q) => q.questionText && Array.isArray(q.options) && q.options.length >= 2)
    .map((q) => ({
      questionText: String(q.questionText).slice(0, 500),
      options: q.options.slice(0, 4).map((o) => String(o).slice(0, 200)),
      correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0,
      explanation: String(q.explanation || '').slice(0, 500)
    }))
    .slice(0, 5);

  parsed.keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 6).map(String) : [];
  parsed.keywords = Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 10).map(String) : [];

  return parsed;
}

function heuristicStructure(text, meta) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const paragraphs = lines.filter((l) => l.length > 40);
  const title = (lines.find((l) => l.length > 10 && l.length < 120) || 'Imported Lesson').trim();
  const summary = (paragraphs[0] || '').slice(0, 200);

  const contentParas = paragraphs.slice(0, 6).map((p) => `<p>${escapeHtml(p)}</p>`);
  const content = contentParas.join('\n') || `<p>${escapeHtml(summary)}</p>`;

  const sentences = text
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 200);
  const keyPoints = sentences.slice(0, 4);

  const STOP = new Set(['the','and','for','are','but','not','you','can','how','why','what','when','where','who','does','this','that','with','from','have','has','was','were','will','would','could','should','they','them','their','there','which','while','been','being']);
  const freq = new Map();
  const words = text.toLowerCase().match(/[a-z]{4,}/g) || [];
  for (const w of words) {
    if (STOP.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const keywords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);

  const quizQuestions = [];
  if (sentences.length >= 3) {
    const distractors = sentences.slice(1, 5).map((s) => s.slice(0, 80));
    quizQuestions.push({
      questionText: `According to the text, which of these is correct?`,
      options: [sentences[0].slice(0, 80), ...distractors.slice(0, 3)],
      correctIndex: 0,
      explanation: 'This is the first statement from the extracted text.'
    });
  }

  return {
    title: title.slice(0, 120),
    summary,
    content,
    level: meta.level || 'JSS2',
    keyPoints,
    keywords,
    sourceRef: meta.sourceRef || 'Imported curriculum document',
    quiz: {
      title: `${title.slice(0, 100)} — Quiz`,
      questions: quizQuestions
    }
  };
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

module.exports = { extractText, structureText };