// server/__seed_packs_temp.js â€” TEMPORARY
require('dotenv').config();
const { connectDB, disconnectDB } = require('./config/db');
const Subject      = require('./models/Subject');
const Lesson       = require('./models/Lesson');
const Quiz         = require('./models/Quiz');
const LearningPack = require('./models/LearningPack');
const AICache      = require('./models/AICache');
const logger       = require('./utils/logger');

(async () => {
  try {
    await connectDB();

    const math = await Subject.findOne({ slug: 'mathematics' }).lean();
    if (!math) throw new Error('Run __seed_temp.js first (no Mathematics subject found)');

    const lesson = await Lesson.findOne({ subjectId: math._id, title: 'Introduction to Fractions' });
    if (!lesson) throw new Error('Fractions lesson not found â€” run __seed_temp.js first');

    // Create a quiz for the lesson
    const quiz = await Quiz.findOneAndUpdate(
      { title: 'Fractions Basics', lessonId: lesson._id },
      {
        title: 'Fractions Basics',
        subjectId: math._id,
        lessonId: lesson._id,
        level: 'JSS2',
        contentType: 'teacher_approved',
        passingScore: 70,
        isPublished: true,
        questions: [
          {
            questionText: 'In the fraction 3/4, which number is the numerator?',
            options: ['3', '4', '3 and 4', 'Neither'],
            correctIndex: 0,
            explanation: 'The numerator is the top number â€” it shows how many parts you have.',
            difficulty: 'easy'
          },
          {
            questionText: 'What is 1/4 + 2/4?',
            options: ['3/8', '3/4', '2/4', '1/2'],
            correctIndex: 1,
            explanation: 'When denominators match, add the numerators: 1 + 2 = 3, so the answer is 3/4.',
            difficulty: 'easy'
          },
          {
            questionText: 'Which fraction is equivalent to 2/4?',
            options: ['1/2', '2/3', '3/4', '4/2'],
            correctIndex: 0,
            explanation: 'Both numerator and denominator are divisible by 2, so 2/4 simplifies to 1/2.',
            difficulty: 'medium'
          },
          {
            questionText: 'What does the denominator tell us?',
            options: [
              'How many parts we have',
              'How many equal parts the whole is divided into',
              'The sum of the parts',
              'The product of the parts'
            ],
            correctIndex: 1,
            explanation: 'The denominator (bottom number) is the total number of equal parts the whole is divided into.',
            difficulty: 'easy'
          }
        ]
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    // Seed AI cache entries for the lesson
    const aiEntries = [
      {
        action: 'explain_simply',
        content: `**Fractions, Simply**\n\nA fraction is just a piece of something whole.\n\nImagine a pizza cut into 4 equal slices. If you take 3 slices, you have 3/4 of the pizza.\n\n- The **top number (numerator)** = how many slices you took.\n- The **bottom number (denominator)** = how many slices the pizza was cut into.\n\nSo in 3/4: 3 slices taken out of 4 possible.`
      },
      {
        action: 'give_examples',
        content: `**Real-life fraction examples**\n\n1. Half a loaf of bread = 1/2\n2. Three-quarters of a tank of fuel = 3/4\n3. One-third of your class = 1/3 (about 20 students in a class of 60)\n4. Adding fractions: 1/4 (one slice) + 2/4 (two more slices) = 3/4 (three slices total)\n\nNotice: when the bottom number is the same, just add the top numbers.`
      },
      {
        action: 'practice_questions',
        content: `**Practice questions â€” Fractions**\n\n1. What is 2/5 + 1/5?\n   â†’ Answer: 3/5 (denominators match, add numerators: 2+1=3)\n\n2. What is 5/8 âˆ’ 2/8?\n   â†’ Answer: 3/8\n\n3. Simplify 6/8.\n   â†’ Answer: 3/4 (divide both numbers by 2)\n\n4. Is 2/4 equal to 1/2? Explain.\n   â†’ Answer: Yes, because both can be simplified by dividing by 2.\n\nTry writing your answers before checking!`
      },
      {
        action: 'summarize',
        content: `**Key points â€” Fractions**\n\n1. A fraction represents a part of a whole.\n2. Written as numerator/denominator (top/bottom).\n3. To add or subtract fractions with the same denominator, only change the numerator.\n4. Simplify by dividing both numbers by their greatest common factor.`
      }
    ];

    for (const entry of aiEntries) {
      await AICache.findOneAndUpdate(
        {
          lessonId: lesson._id,
          action: entry.action,
          learningDifficulty: 'beginner',
          language: 'en',
          lessonVersion: lesson.version
        },
        {
          lessonId: lesson._id,
          action: entry.action,
          learningDifficulty: 'beginner',
          language: 'en',
          content: entry.content,
          provider: 'template',
          groundedIn: lesson.sourceRef || '',
          confidence: 'high',
          isVerified: true,
          lessonVersion: lesson.version
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
    }
    logger.info(`Seeded ${aiEntries.length} AI cache entries for lesson "${lesson.title}"`);

    // Build the pack
    const pack = await LearningPack.findOneAndUpdate(
      { slug: 'jss2-mathematics-pack' },
      {
        name: 'JSS2 Mathematics Essentials',
        slug: 'jss2-mathematics-pack',
        description: 'Fractions and number basics for JSS2 students. Works fully offline.',
        subjectId: math._id,
        level: 'JSS2',
        curriculum: 'Nigerian',
        language: 'en',
        lessonIds: [lesson._id],
        quizIds: [quiz._id],
        lessonCount: 1,
        quizCount: 1,
        estimatedMinutes: 22,
        isPublished: true,
        offlineReady: true,
        version: 1
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    // Update denormalized sizeBytes by actually building the payload
    // (We do a rough estimate here; production buildPack would run through the real endpoint)
    const approxSize = JSON.stringify({
      lesson: lesson.content,
      quiz: quiz.questions,
      ai: aiEntries
    }).length;
    pack.sizeBytes = approxSize;
    await pack.save();

    logger.info(`Seeded pack: ${pack.name} (${(approxSize / 1024).toFixed(1)} KB)`);
  } catch (err) {
    logger.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
})();