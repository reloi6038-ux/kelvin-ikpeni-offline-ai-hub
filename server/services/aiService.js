// server/services/aiService.js
const AICache = require('../models/AICache');
const Lesson  = require('../models/Lesson');
const { getAIConfig } = require('../config/ai');
const logger  = require('../utils/logger');

const PROVIDER_TIMEOUT_MS = 15000;
const MAX_RESPONSE_LENGTH = 4000;

// Fixed action → prompt template. No user text enters the system prompt.
const ACTION_PROMPTS = {
  explain_simply: (ctx) =>
    `Explain the following lesson content in very simple language for a ${ctx.difficulty} ` +
    `${ctx.level} student in ${ctx.curriculum} curriculum. Use short sentences, short paragraphs, ` +
    `and at most one analogy. Do NOT invent facts beyond the lesson content.\n\n` +
    `LESSON TITLE: ${ctx.title}\n` +
    `LESSON CONTENT:\n${ctx.content}\n` +
    `KEY POINTS: ${ctx.keyPoints.join('; ')}`,

  give_examples: (ctx) =>
    `Give 3 concrete, everyday examples that explain the following lesson to a ` +
    `${ctx.difficulty} ${ctx.level} student. Use examples relevant to a Nigerian student. ` +
    `After each example, tie it back to the lesson. Do NOT invent facts outside the lesson.\n\n` +
    `LESSON TITLE: ${ctx.title}\nLESSON CONTENT:\n${ctx.content}`,

  practice_questions: (ctx) =>
    `Generate 4 practice questions with answers for a ${ctx.level} ${ctx.difficulty} student ` +
    `based ONLY on the following lesson. Format: question, then "→ Answer: ...". ` +
    `Do NOT invent facts outside the lesson.\n\n` +
    `LESSON TITLE: ${ctx.title}\nLESSON CONTENT:\n${ctx.content}\n` +
    `KEY POINTS: ${ctx.keyPoints.join('; ')}`,

  summarize: (ctx) =>
    `Summarize the following lesson in 4 numbered key points for a ${ctx.difficulty} ` +
    `${ctx.level} student. Keep each point under 25 words. Use ONLY facts from the lesson.\n\n` +
    `LESSON TITLE: ${ctx.title}\nLESSON CONTENT:\n${ctx.content}`,

  explain_mistake: (ctx) =>
    `A ${ctx.level} student answered a quiz question incorrectly. ` +
    `Explain gently why their answer was wrong, what the correct answer is, and how to ` +
    `remember it next time. Do NOT shame the student.\n\n` +
    `QUESTION: ${ctx.questionText}\n` +
    `STUDENT'S ANSWER: ${ctx.selectedOption}\n` +
    `CORRECT ANSWER: ${ctx.correctOption}\n` +
    `OFFICIAL EXPLANATION: ${ctx.officialExplanation}\n` +
    `LESSON CONTEXT:\n${ctx.content}`
};

// ------------------------------------------------------------------
// Public API: getAIResponse
// ------------------------------------------------------------------
/**
 * Returns an AI response for (lesson, action, difficulty, language).
 * Resolution order:
 *   1. Fresh AICache entry (instant, offline-friendly)
 *   2. External AI provider (if configured and reachable)
 *   3. Deterministic template from keyPoints (always works)
 */
async function getAIResponse({ lessonId, action, learningDifficulty = 'beginner', language = 'en' }) {
  const lesson = await Lesson.findOne({ _id: lessonId, isPublished: true }).lean();
  if (!lesson) {
    return { ok: false, code: 'LESSON_NOT_FOUND', status: 404 };
  }

  // ---- 1. Cache ----
  const cached = await AICache.findOne({
    lessonId: lesson._id,
    action,
    learningDifficulty,
    language,
    lessonVersion: lesson.version
  }).lean();

  if (cached) {
    return {
      ok: true,
      response: {
        content: cached.content,
        provider: cached.provider,
        isVerified: cached.isVerified,
        groundedIn: cached.groundedIn || lesson.sourceRef || '',
        confidence: cached.confidence,
        source: 'cache',
        lessonVersion: cached.lessonVersion
      }
    };
  }

  // ---- 2. Provider call ----
  const cfg = getAIConfig();
  if (cfg.enabled) {
    try {
      const content = await callProvider(action, lesson, learningDifficulty, language, cfg);
      if (content) {
        // Persist for future requests (including future pack downloads)
        await AICache.findOneAndUpdate(
          { lessonId: lesson._id, action, learningDifficulty, language, lessonVersion: lesson.version },
          {
            lessonId: lesson._id,
            action,
            learningDifficulty,
            language,
            lessonVersion: lesson.version,
            content,
            provider: cfg.provider,
            model: cfg.model,
            groundedIn: lesson.sourceRef || '',
            confidence: 'medium',
            isVerified: false
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return {
          ok: true,
          response: {
            content,
            provider: cfg.provider,
            isVerified: false,
            groundedIn: lesson.sourceRef || '',
            confidence: 'medium',
            source: 'provider',
            lessonVersion: lesson.version
          }
        };
      }
    } catch (err) {
      logger.warn(`Provider call failed for ${action}: ${err.message}`);
      // Fall through to template
    }
  }

  // ---- 3. Template fallback ----
  const templated = buildTemplateResponse(action, lesson, learningDifficulty);
  if (!templated) {
    return { ok: false, code: 'UNSUPPORTED_ACTION', status: 400 };
  }

  // Persist template responses too — this powers offline mode after 1 online request
  await AICache.findOneAndUpdate(
    { lessonId: lesson._id, action, learningDifficulty, language, lessonVersion: lesson.version },
    {
      lessonId: lesson._id,
      action,
      learningDifficulty,
      language,
      lessonVersion: lesson.version,
      content: templated,
      provider: 'template',
      groundedIn: lesson.sourceRef || '',
      confidence: 'high',
      isVerified: true
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    ok: true,
    response: {
      content: templated,
      provider: 'template',
      isVerified: true,
      groundedIn: lesson.sourceRef || '',
      confidence: 'high',
      source: 'template',
      lessonVersion: lesson.version
    }
  };
}

// ------------------------------------------------------------------
// Explain a specific quiz mistake
// ------------------------------------------------------------------
async function explainMistake({ lessonId, questionText, options, selectedIndex, correctIndex, officialExplanation }) {
  const lesson = await Lesson.findOne({ _id: lessonId, isPublished: true }).lean();
  if (!lesson) return { ok: false, code: 'LESSON_NOT_FOUND', status: 404 };

  const ctx = {
    lesson,
    level: lesson.level,
    curriculum: lesson.curriculum,
    difficulty: 'beginner',
    title: lesson.title,
    content: (lesson.content || '').slice(0, 3000),
    keyPoints: lesson.keyPoints || [],
    questionText,
    selectedOption: options[selectedIndex] ?? '(no answer)',
    correctOption:  options[correctIndex] ?? '(unknown)',
    officialExplanation: officialExplanation || '(none provided)'
  };

  const cfg = getAIConfig();
  if (cfg.enabled) {
    try {
      const content = await callProvider('explain_mistake', lesson, 'beginner', 'en', cfg, ctx);
      if (content) {
        return {
          ok: true,
          response: {
            content,
            provider: cfg.provider,
            isVerified: false,
            groundedIn: lesson.sourceRef || '',
            confidence: 'medium',
            source: 'provider'
          }
        };
      }
    } catch (err) {
      logger.warn(`Provider failed for explain_mistake: ${err.message}`);
    }
  }

  // Template fallback — deterministic and educational
  const content =
    `**Let's look at this together**\n\n` +
    `You chose: **${ctx.selectedOption}**\n` +
    `Correct answer: **${ctx.correctOption}**\n\n` +
    (officialExplanation ? `**Why:** ${officialExplanation}\n\n` : '') +
    `**How to remember it:** ${pickKeyPoint(lesson, questionText)}`;

  return {
    ok: true,
    response: {
      content,
      provider: 'template',
      isVerified: true,
      groundedIn: lesson.sourceRef || '',
      confidence: 'high',
      source: 'template'
    }
  };
}

// ------------------------------------------------------------------
// Free-form "ask a question" — grounded in a lesson
// ------------------------------------------------------------------
async function askGrounded({ lessonId, question, learningDifficulty = 'beginner' }) {
  const lesson = await Lesson.findOne({ _id: lessonId, isPublished: true }).lean();
  if (!lesson) return { ok: false, code: 'LESSON_NOT_FOUND', status: 404 };

  const q = String(question || '').trim().slice(0, 400);
  if (q.length < 3) return { ok: false, code: 'QUESTION_TOO_SHORT', status: 400 };

  const cfg = getAIConfig();
  if (cfg.enabled) {
    try {
      const ctx = {
        lesson, level: lesson.level, curriculum: lesson.curriculum, difficulty: learningDifficulty,
        title: lesson.title, content: lesson.content, keyPoints: lesson.keyPoints || []
      };
      const prompt =
        `A ${learningDifficulty} ${lesson.level} student asks: "${q}"\n\n` +
        `Answer using ONLY the lesson content below. If the answer is not in the lesson, ` +
        `say so honestly and suggest the student ask their teacher. Do not invent facts.\n\n` +
        `LESSON TITLE: ${lesson.title}\nLESSON CONTENT:\n${lesson.content}\n` +
        `KEY POINTS: ${(lesson.keyPoints || []).join('; ')}`;
      const content = await callProviderRaw(prompt, cfg);
      if (content) {
        return {
          ok: true,
          response: {
            content,
            provider: cfg.provider,
            isVerified: false,
            groundedIn: lesson.sourceRef || '',
            confidence: 'medium',
            source: 'provider'
          }
        };
      }
    } catch (err) {
      logger.warn(`Provider failed for askGrounded: ${err.message}`);
    }
  }

  // Offline-friendly fallback: keyword match against the lesson
  const matchedPoints = (lesson.keyPoints || []).filter((kp) =>
    hasKeywordOverlap(q, kp)
  );
  const content = matchedPoints.length
    ? `**From this lesson**\n\n${matchedPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n` +
      `_This answer comes directly from the lesson notes. Ask your teacher if you need more detail._`
    : `**I don't have this in the downloaded lesson**\n\n` +
      `Try re-reading the section titled "${lesson.title}" and looking for these key points:\n\n` +
      `${(lesson.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n` +
      `_If you're online, ask the AI tutor. If offline, ask your teacher or check your textbook._`;

  return {
    ok: true,
    response: {
      content,
      provider: 'template',
      isVerified: true,
      groundedIn: lesson.sourceRef || '',
      confidence: matchedPoints.length ? 'high' : 'low',
      source: 'template'
    }
  };
}

// ------------------------------------------------------------------
// Provider integration
// ------------------------------------------------------------------
async function callProvider(action, lesson, difficulty, language, cfg, extraCtx = null) {
  const ctx = extraCtx || {
    lesson,
    level: lesson.level,
    curriculum: lesson.curriculum,
    difficulty,
    language,
    title: lesson.title,
    content: lesson.content,
    keyPoints: lesson.keyPoints || []
  };
  const promptFn = ACTION_PROMPTS[action];
  if (!promptFn) throw new Error(`Unknown action: ${action}`);
  return callProviderRaw(promptFn(ctx), cfg);
}

async function callProviderRaw(prompt, cfg) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

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
      throw new Error(`Provider ${cfg.provider} responded ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = extractProviderContent(cfg.provider, data);
    return sanitize(content);
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
      generationConfig: { temperature: 0.4, maxOutputTokens: 700 }
    };
  }
  // OpenAI-compatible (openai, deepseek)
  return {
    model: cfg.model,
    messages: [
      { role: 'system', content: 'You are a patient tutor. Ground every answer in the provided lesson. If unsure, say so.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.4,
    max_tokens: 700
  };
}

function extractProviderContent(provider, data) {
  if (provider === 'gemini') {
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  return data?.choices?.[0]?.message?.content || '';
}

// ------------------------------------------------------------------
// Template fallback (uses only the lesson data — no invention)
// ------------------------------------------------------------------
function buildTemplateResponse(action, lesson, difficulty) {
  const kp = lesson.keyPoints || [];
  const title = lesson.title || 'this lesson';
  const src = lesson.sourceRef ? `\n\n_Source: ${lesson.sourceRef}_` : '';

  switch (action) {
    case 'explain_simply':
      return kp.length
        ? `**${title} — Simply Explained**\n\n` +
          kp.map((p, i) => `${i + 1}. ${p}`).join('\n') +
          `\n\n_These points come from your downloaded curriculum notes.${src}_`
        : `**${title}**\n\nThis lesson covers ${title.toLowerCase()}. Read it once, then try explaining it out loud in your own words.${src}`;

    case 'give_examples':
      return `**Examples from the lesson**\n\n` +
        (kp.length
          ? kp.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join('\n')
          : `Look at the examples inside the lesson notes.${src}`) +
        `\n\n_For more examples, ask your teacher._${src}`;

    case 'practice_questions':
      return `**Practice — ${title}**\n\n` +
        `Try to answer these from the lesson:\n\n` +
        kp.slice(0, 4).map((p, i) => `${i + 1}. Explain in your own words: ${p}`).join('\n') +
        `\n\n_When you can explain each key point clearly, you understand the lesson._${src}`;

    case 'summarize':
      return `**Key takeaways — ${title}**\n\n` +
        (kp.length ? kp.map((p, i) => `${i + 1}. ${p}`).join('\n') : `Re-read the lesson notes to identify the key points.`) +
        `\n\n_These are drawn directly from the downloaded lesson.${src}_`;

    default:
      return null;
  }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function pickKeyPoint(lesson, questionText) {
  const kps = lesson.keyPoints || [];
  if (!kps.length) return 're-read the lesson notes for this topic.';
  const match = kps.find((kp) => hasKeywordOverlap(questionText, kp));
  return match || kps[0];
}

function hasKeywordOverlap(text, point) {
  const STOP = new Set(['a','an','the','of','in','on','to','and','or','is','are','for','with','by','as','be','from','this','that','it','at','which','what','how']);
  const toks = String(text).toLowerCase().match(/[a-z]{3,}/g) || [];
  const significant = toks.filter((t) => !STOP.has(t));
  return significant.some((t) => point.toLowerCase().includes(t));
}

/**
 * Strip risky HTML, cap length. Keeps markdown-like formatting (asterisks, underscores, \n).
 */
function sanitize(content) {
  if (!content) return '';
  let s = String(content);
  // Remove script tags and event attributes
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  // Remove most HTML tags except a small allowlist
  s = s.replace(/<(?!\/?(p|br|strong|em|ul|ol|li)\b)[^>]+>/gi, '');
  // Cap length
  if (s.length > MAX_RESPONSE_LENGTH) s = s.slice(0, MAX_RESPONSE_LENGTH) + '\n\n_(truncated)_';
  return s.trim();
}

module.exports = {
  getAIResponse,
  explainMistake,
  askGrounded
};