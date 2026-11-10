// server/seed.js — Complete curriculum seed (JSS1–SS3)
// Run with: npm run seed
// Safe to run multiple times — clears only demo content.

require('dotenv').config();
const crypto = require('crypto');

const { connectDB, disconnectDB } = require('./config/db');
const logger       = require('./utils/logger');
const Subject      = require('./models/Subject');
const Lesson       = require('./models/Lesson');
const Quiz         = require('./models/Quiz');
const LearningPack = require('./models/LearningPack');
const AICache      = require('./models/AICache');
const Attempt      = require('./models/Attempt');
const Feedback     = require('./models/Feedback');
const { slugify }  = require('./utils/helpers');

// ============================================================
// SUBJECTS
// ============================================================
const SUBJECTS = [
  { name: 'Mathematics',      icon: '🔢', color: '#2563eb',
    description: 'Numbers, algebra, geometry — the foundational subject.',
    levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'Basic Science',    icon: '🔬', color: '#16a34a',
    description: 'Foundational science for junior secondary students.',
    levels: ['JSS1','JSS2','JSS3'] },
  { name: 'Computer Studies', icon: '💻', color: '#9333ea',
    description: 'Introduction to computers, coding, and digital literacy.',
    levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'English Language', icon: '📖', color: '#dc2626',
    description: 'Comprehension, grammar, and composition.',
    levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'Civic Education',  icon: '🏛', color: '#f59e0b',
    description: 'Rights, responsibilities, and citizenship.',
    levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] }
];

// ============================================================
// LESSONS + QUIZZES — one pair per class level per subject
// ============================================================
const CONTENT = [
  // ==================================================
  // MATHEMATICS
  // ==================================================
  {
    subject: 'Mathematics', level: 'JSS1', order: 1,
    title: 'Whole Numbers and Place Value',
    summary: 'Understand the value of each digit based on its position.',
    content: `<p><strong>Whole numbers</strong> are the counting numbers starting from 0: 0, 1, 2, 3, ...</p>
<p>In a number like <strong>4,825</strong>, each digit has a <em>place value</em>:</p>
<ul>
<li><strong>4</strong> is in the thousands place → 4 × 1000 = 4000</li>
<li><strong>8</strong> is in the hundreds place → 8 × 100 = 800</li>
<li><strong>2</strong> is in the tens place → 2 × 10 = 20</li>
<li><strong>5</strong> is in the ones place → 5 × 1 = 5</li>
</ul>
<p>Adding these gives back 4,825. Understanding place value is essential for addition, subtraction, and understanding number magnitudes.</p>`,
    keyPoints: [
      'Whole numbers start from 0 and increase by 1',
      'Each digit has a place value based on its position',
      'Ones, tens, hundreds, thousands — each is 10× the previous',
      'Place value helps us read and write numbers correctly'
    ],
    keywords: ['whole numbers', 'place value', 'digits', 'counting'],
    sourceRef: 'JSS1 Mathematics, Chapter 1',
    quiz: {
      title: 'Whole Numbers & Place Value',
      questions: [
        { q: 'In 4,825, what is the value of the digit 8?', opts: ['8', '80', '800', '8000'], correct: 2, exp: 'The 8 is in the hundreds place, so its value is 8 × 100 = 800.' },
        { q: 'Which of these is a whole number?', opts: ['-3', '0.5', '12', '1/2'], correct: 2, exp: 'Whole numbers are 0, 1, 2, 3... 12 is a whole number.' },
        { q: 'What is the place value of 5 in 3,571?', opts: ['5', '50', '500', '5000'], correct: 2, exp: 'The 5 is in the hundreds place.' }
      ]
    }
  },
  {
    subject: 'Mathematics', level: 'JSS2', order: 1,
    title: 'Introduction to Fractions',
    summary: 'Learn what fractions are, how to identify numerator and denominator, and add simple fractions.',
    content: `<p>A <strong>fraction</strong> represents a part of a whole. It is written as a top number (numerator) over a bottom number (denominator): <strong>a/b</strong>.</p>
<p><strong>Example:</strong> In the fraction 3/4, the <strong>numerator is 3</strong> (how many parts you have) and the <strong>denominator is 4</strong> (how many equal parts the whole is divided into).</p>
<p>To add fractions with the same denominator, add the numerators and keep the denominator: <strong>1/4 + 2/4 = 3/4</strong>.</p>
<p>To simplify a fraction, divide both the numerator and denominator by their greatest common factor.</p>`,
    keyPoints: [
      'A fraction shows a part of a whole',
      'The numerator is the top number',
      'The denominator is the bottom number',
      'Add fractions with the same denominator by adding the numerators',
      'Simplify by dividing both numbers by their greatest common factor'
    ],
    keywords: ['fraction', 'numerator', 'denominator', 'addition', 'simplify'],
    sourceRef: 'JSS2 Mathematics, Chapter 3',
    quiz: {
      title: 'Fractions Basics',
      questions: [
        { q: 'In the fraction 3/4, which number is the numerator?', opts: ['3', '4', '3 and 4', 'Neither'], correct: 0, exp: 'The numerator is the top number — it shows how many parts you have.' },
        { q: 'What is 1/4 + 2/4?', opts: ['3/8', '3/4', '2/4', '1/2'], correct: 1, exp: 'When denominators match, add numerators: 1 + 2 = 3, so 3/4.' },
        { q: 'Which fraction is equivalent to 2/4?', opts: ['1/2', '2/3', '3/4', '4/2'], correct: 0, exp: 'Both numerator and denominator are divisible by 2, so 2/4 = 1/2.' },
        { q: 'What does the denominator tell us?', opts: ['How many parts we have', 'How many equal parts the whole is divided into', 'The sum of the parts', 'The product of the parts'], correct: 1, exp: 'The denominator is the total number of equal parts the whole is divided into.' }
      ]
    }
  },
  {
    subject: 'Mathematics', level: 'JSS3', order: 1,
    title: 'Introduction to Algebra',
    summary: 'Use letters to represent unknown numbers and solve simple equations.',
    content: `<p><strong>Algebra</strong> uses letters (like x, y, a, b) to represent unknown numbers.</p>
<p>An <strong>expression</strong> combines numbers, letters, and operations: 3x + 5, 2a − 7, x/4.</p>
<p>An <strong>equation</strong> says two expressions are equal: 3x + 5 = 20.</p>
<p>To <strong>solve</strong> an equation, find the value of x that makes it true. Do the same operation to both sides:</p>
<ul>
<li>3x + 5 = 20</li>
<li>3x = 20 − 5 = 15</li>
<li>x = 15 ÷ 3 = <strong>5</strong></li>
</ul>
<p>Check: 3(5) + 5 = 15 + 5 = 20 ✓</p>`,
    keyPoints: [
      'Algebra uses letters to represent unknown numbers',
      'An expression combines numbers, letters, and operations',
      'An equation says two expressions are equal',
      'Solve by doing the same operation to both sides',
      'Always check your answer by substitution'
    ],
    keywords: ['algebra', 'equation', 'expression', 'solve', 'variable'],
    sourceRef: 'JSS3 Mathematics, Chapter 2',
    quiz: {
      title: 'Algebra Basics',
      questions: [
        { q: 'Solve for x: 3x + 5 = 20', opts: ['3', '5', '7', '15'], correct: 1, exp: '3x = 15, so x = 5.' },
        { q: 'What does 2x mean?', opts: ['x + 2', 'x × 2', 'x − 2', 'x ÷ 2'], correct: 1, exp: '2x means 2 multiplied by x.' },
        { q: 'If x = 4, what is 3x + 1?', opts: ['7', '12', '13', '16'], correct: 2, exp: '3(4) + 1 = 12 + 1 = 13.' }
      ]
    }
  },
  {
    subject: 'Mathematics', level: 'SS1', order: 1,
    title: 'Quadratic Equations',
    summary: 'Solve equations of the form ax² + bx + c = 0.',
    content: `<p>A <strong>quadratic equation</strong> has the form <strong>ax² + bx + c = 0</strong>, where a ≠ 0.</p>
<p>Example: x² − 5x + 6 = 0.</p>
<p><strong>Factoring method:</strong> find two numbers that multiply to <em>c</em> and add to <em>b</em>.</p>
<ul>
<li>Product = 6, Sum = −5</li>
<li>The numbers are −2 and −3</li>
<li>Factor: (x − 2)(x − 3) = 0</li>
<li>So x = 2 or x = 3</li>
</ul>
<p><strong>Quadratic formula:</strong> x = (−b ± √(b² − 4ac)) / 2a. Works for any quadratic, including ones that can't be factored.</p>`,
    keyPoints: [
      'Quadratic equations have the form ax² + bx + c = 0',
      'a cannot be zero',
      'Factor by finding two numbers that multiply to c and add to b',
      'The quadratic formula solves any quadratic: x = (−b ± √(b² − 4ac)) / 2a',
      'The discriminant b² − 4ac tells you how many roots exist'
    ],
    keywords: ['quadratic', 'equation', 'factor', 'roots', 'discriminant'],
    sourceRef: 'SS1 Mathematics, Chapter 6',
    quiz: {
      title: 'Quadratic Equations',
      questions: [
        { q: 'Solve: x² − 5x + 6 = 0', opts: ['x = 1 or 6', 'x = 2 or 3', 'x = -2 or -3', 'x = 0 or 5'], correct: 1, exp: 'Factor as (x−2)(x−3)=0, so x = 2 or 3.' },
        { q: 'What is the discriminant of x² − 4x + 4 = 0?', opts: ['0', '4', '8', '16'], correct: 0, exp: 'Discriminant = b² − 4ac = 16 − 16 = 0.' },
        { q: 'A quadratic with a negative discriminant has:', opts: ['Two real roots', 'One real root', 'No real roots', 'Infinite roots'], correct: 2, exp: 'A negative discriminant means no real solutions.' }
      ]
    }
  },
  {
    subject: 'Mathematics', level: 'SS2', order: 1,
    title: 'Trigonometry: Sine, Cosine, Tangent',
    summary: 'Relate the angles of a right triangle to the lengths of its sides.',
    content: `<p><strong>Trigonometry</strong> studies the relationships between angles and side lengths in triangles.</p>
<p>For a right triangle, define ratios using <strong>SOH-CAH-TOA</strong>:</p>
<ul>
<li><strong>sin θ</strong> = opposite / hypotenuse</li>
<li><strong>cos θ</strong> = adjacent / hypotenuse</li>
<li><strong>tan θ</strong> = opposite / adjacent</li>
</ul>
<p>Example: A right triangle has opposite = 3, adjacent = 4, hypotenuse = 5.</p>
<p>sin θ = 3/5 = 0.6, cos θ = 4/5 = 0.8, tan θ = 3/4 = 0.75.</p>
<p>These ratios are used in navigation, engineering, physics, and construction.</p>`,
    keyPoints: [
      'SOH-CAH-TOA: sin = opposite/hypotenuse, cos = adjacent/hypotenuse, tan = opposite/adjacent',
      'Trig ratios work in right triangles',
      'The ratios depend only on the angle, not the triangle size',
      'Used in navigation, engineering, and physics'
    ],
    keywords: ['trigonometry', 'sine', 'cosine', 'tangent', 'triangle'],
    sourceRef: 'SS2 Mathematics, Chapter 8',
    quiz: {
      title: 'Trigonometry Basics',
      questions: [
        { q: 'sin θ = ?', opts: ['adjacent/hypotenuse', 'opposite/hypotenuse', 'opposite/adjacent', 'hypotenuse/opposite'], correct: 1, exp: 'SOH: sin = opposite/hypotenuse.' },
        { q: 'If opposite = 5 and adjacent = 12, what is tan θ?', opts: ['5/12', '12/5', '5/13', '12/13'], correct: 0, exp: 'TOA: tan = opposite/adjacent = 5/12.' },
        { q: 'In a right triangle, opposite = 6 and hypotenuse = 10. Find sin θ.', opts: ['0.4', '0.6', '0.8', '1.6'], correct: 1, exp: 'sin θ = 6/10 = 0.6.' }
      ]
    }
  },
  {
    subject: 'Mathematics', level: 'SS3', order: 1,
    title: 'Differentiation Basics (Calculus)',
    summary: 'Find the rate of change of a function.',
    content: `<p><strong>Differentiation</strong> finds the <em>rate of change</em> of a function — how fast the output changes as the input changes.</p>
<p>For a function y = f(x), the derivative is written f'(x) or dy/dx.</p>
<p><strong>The power rule:</strong> if y = xⁿ, then dy/dx = n·xⁿ⁻¹.</p>
<ul>
<li>y = x³ → dy/dx = 3x²</li>
<li>y = x² → dy/dx = 2x</li>
<li>y = x → dy/dx = 1</li>
<li>y = 5 (constant) → dy/dx = 0</li>
</ul>
<p>Example: For y = 3x² + 2x + 1, dy/dx = 6x + 2. This tells us the slope of the curve at any point x.</p>`,
    keyPoints: [
      'Differentiation finds the rate of change of a function',
      'Notation: f\'(x) or dy/dx',
      'Power rule: d/dx(xⁿ) = n·xⁿ⁻¹',
      'The derivative of a constant is zero',
      'The derivative gives the slope of the curve at any point'
    ],
    keywords: ['calculus', 'differentiation', 'derivative', 'rate of change', 'power rule'],
    sourceRef: 'SS3 Mathematics, Chapter 10',
    quiz: {
      title: 'Differentiation Basics',
      questions: [
        { q: 'If y = x³, what is dy/dx?', opts: ['x²', '3x', '3x²', 'x³/3'], correct: 2, exp: 'Power rule: 3·x² = 3x².' },
        { q: 'The derivative of a constant is:', opts: ['1', 'The constant', '0', 'Undefined'], correct: 2, exp: 'A constant doesn\'t change, so its rate of change is 0.' },
        { q: 'If y = 4x², what is dy/dx?', opts: ['4x', '8x', '8x²', '2x'], correct: 1, exp: 'd/dx(4x²) = 4·2x = 8x.' }
      ]
    }
  },

  // ==================================================
  // BASIC SCIENCE (JSS only)
  // ==================================================
  {
    subject: 'Basic Science', level: 'JSS1', order: 1,
    title: 'Living and Non-Living Things',
    summary: 'Learn the characteristics that separate living organisms from non-living matter.',
    content: `<p><strong>Living things</strong> carry out the seven life processes: nutrition, respiration, movement, growth, reproduction, excretion, and sensitivity.</p>
<p><strong>Non-living things</strong> do not carry out all these processes. A rock, a chair, and water are non-living.</p>
<p>Some things that seem living are not: a car moves, but it doesn't grow or reproduce. A fire grows, but doesn't reproduce.</p>
<p>The key test: does it carry out <em>all seven</em> life processes?</p>`,
    keyPoints: [
      'Living things carry out seven life processes',
      'The seven processes are: nutrition, respiration, movement, growth, reproduction, excretion, sensitivity',
      'Non-living things do not carry out all life processes',
      'A car moves but does not grow or reproduce'
    ],
    keywords: ['living things', 'non-living', 'life processes', 'biology'],
    sourceRef: 'JSS1 Basic Science, Chapter 1',
    quiz: {
      title: 'Living vs Non-Living',
      questions: [
        { q: 'Which is NOT a characteristic of living things?', opts: ['Growth', 'Reproduction', 'Rusting', 'Respiration'], correct: 2, exp: 'Rusting is a chemical process of non-living metals, not a life process.' },
        { q: 'How many life processes do living things carry out?', opts: ['3', '5', '7', '10'], correct: 2, exp: 'There are 7: nutrition, respiration, movement, growth, reproduction, excretion, sensitivity.' },
        { q: 'A car moving is:', opts: ['Living', 'Non-living', 'Semi-living', 'A plant'], correct: 1, exp: 'A car moves but does not grow, reproduce, or respire. It is non-living.' }
      ]
    }
  },
  {
    subject: 'Basic Science', level: 'JSS2', order: 1,
    title: 'Photosynthesis Basics',
    summary: 'How plants make their own food using sunlight, water, and carbon dioxide.',
    content: `<p><strong>Photosynthesis</strong> is how green plants make their own food.</p>
<p>Plants absorb <strong>sunlight</strong> (through chlorophyll in the leaves), <strong>water</strong> (from the roots), and <strong>carbon dioxide</strong> (from the air) to produce <strong>glucose</strong> (their food) and release <strong>oxygen</strong>.</p>
<p>The chemical equation is: <strong>6CO₂ + 6H₂O + sunlight → C₆H₁₂O₆ + 6O₂</strong></p>
<p>This is why plants are so important — they produce the oxygen we breathe, and they are the base of almost every food chain on Earth.</p>`,
    keyPoints: [
      'Plants make food using sunlight, water, and carbon dioxide',
      'Glucose is the plant food',
      'Oxygen is released as a by-product',
      'Chlorophyll is the green pigment that captures sunlight'
    ],
    keywords: ['photosynthesis', 'plants', 'chlorophyll', 'glucose', 'oxygen', 'carbon dioxide'],
    sourceRef: 'JSS2 Basic Science, Chapter 5',
    quiz: {
      title: 'Photosynthesis Quick Check',
      questions: [
        { q: 'What gas do plants release during photosynthesis?', opts: ['Carbon dioxide', 'Nitrogen', 'Oxygen', 'Hydrogen'], correct: 2, exp: 'Oxygen is released as a by-product.' },
        { q: 'What is the main source of energy for photosynthesis?', opts: ['Sunlight', 'Soil', 'Water', 'Wind'], correct: 0, exp: 'Sunlight provides the energy.' },
        { q: 'Which pigment captures sunlight in plants?', opts: ['Hemoglobin', 'Chlorophyll', 'Carotene', 'Melanin'], correct: 1, exp: 'Chlorophyll captures sunlight.' }
      ]
    }
  },
  {
    subject: 'Basic Science', level: 'JSS3', order: 1,
    title: 'Elements, Compounds and Mixtures',
    summary: 'Understand the building blocks of matter.',
    content: `<p><strong>Elements</strong> are pure substances made of only one type of atom. Examples: oxygen (O), iron (Fe), gold (Au).</p>
<p><strong>Compounds</strong> are made of two or more elements chemically combined in fixed proportions. Examples: water (H₂O), table salt (NaCl), carbon dioxide (CO₂).</p>
<p><strong>Mixtures</strong> contain two or more substances that are NOT chemically combined. Examples: air, salt water, soil. Mixtures can be separated by physical means (filtration, evaporation).</p>
<p>Key difference: compounds have fixed composition and properties that differ from their elements. Mixtures retain the properties of their components.</p>`,
    keyPoints: [
      'Elements contain only one type of atom',
      'Compounds are two or more elements chemically combined in fixed proportions',
      'Mixtures are two or more substances physically combined',
      'Mixtures can be separated by physical means, compounds cannot',
      'Compounds have properties that differ from their elements'
    ],
    keywords: ['element', 'compound', 'mixture', 'matter', 'atom'],
    sourceRef: 'JSS3 Basic Science, Chapter 4',
    quiz: {
      title: 'Elements, Compounds & Mixtures',
      questions: [
        { q: 'Which of these is a compound?', opts: ['Oxygen', 'Iron', 'Water', 'Gold'], correct: 2, exp: 'Water (H₂O) is made of hydrogen and oxygen chemically combined.' },
        { q: 'Air is an example of a:', opts: ['Element', 'Compound', 'Mixture', 'Atom'], correct: 2, exp: 'Air is a mixture of gases.' },
        { q: 'Can compounds be separated by physical means?', opts: ['Yes, always', 'No, only chemical reactions can', 'Only sometimes', 'Only when heated'], correct: 1, exp: 'Compounds require chemical reactions to break apart.' }
      ]
    }
  },

  // ==================================================
  // COMPUTER STUDIES
  // ==================================================
  {
    subject: 'Computer Studies', level: 'JSS1', order: 1,
    title: 'Introduction to Computers',
    summary: 'What a computer is, its main parts, and basic uses.',
    content: `<p>A <strong>computer</strong> is an electronic device that accepts data (input), processes it, and produces information (output).</p>
<p>The main parts are:</p>
<ul>
<li><strong>Input devices</strong> — keyboard, mouse, scanner</li>
<li><strong>Processing unit</strong> — CPU</li>
<li><strong>Output devices</strong> — monitor, printer, speaker</li>
<li><strong>Storage</strong> — hard drive, USB, RAM</li>
</ul>
<p>Computers are used in schools, banks, hospitals, businesses, and entertainment.</p>`,
    keyPoints: [
      'A computer accepts input, processes it, and produces output',
      'The CPU is the processor',
      'Input devices include keyboard and mouse',
      'Output devices include monitor and printer',
      'Computers are used everywhere — schools, banks, hospitals'
    ],
    keywords: ['computer', 'cpu', 'input', 'output', 'processing'],
    sourceRef: 'JSS1 Computer Studies, Chapter 1',
    quiz: {
      title: 'Computer Basics',
      questions: [
        { q: 'What does CPU stand for?', opts: ['Central Print Unit', 'Central Processing Unit', 'Computer Personal Unit', 'Control Protocol Unit'], correct: 1, exp: 'CPU = Central Processing Unit.' },
        { q: 'Which is an input device?', opts: ['Monitor', 'Printer', 'Keyboard', 'Speaker'], correct: 2, exp: 'A keyboard sends data INTO the computer.' },
        { q: 'The IPO cycle stands for:', opts: ['Input-Print-Output', 'Internal-Process-Output', 'Input-Process-Output', 'Information-Processing-Order'], correct: 2, exp: 'IPO = Input → Process → Output.' }
      ]
    }
  },
  {
    subject: 'Computer Studies', level: 'JSS2', order: 1,
    title: 'What is a Computer? (Deeper Look)',
    summary: 'Hardware vs software, and the IPO cycle explained.',
    content: `<p>A computer has two main parts: <strong>hardware</strong> (physical parts you can touch) and <strong>software</strong> (programs you cannot touch).</p>
<p><strong>Hardware</strong> examples: monitor, keyboard, CPU, motherboard, hard drive.</p>
<p><strong>Software</strong> examples: Windows, Chrome, MS Word, WhatsApp, games.</p>
<p>Hardware without software is useless. Software without hardware has nowhere to run. They work together.</p>
<p>The <strong>IPO cycle</strong> describes the flow: <em>Input</em> (data comes in) → <em>Process</em> (CPU transforms it) → <em>Output</em> (results go out).</p>`,
    keyPoints: [
      'Hardware is the physical parts you can touch',
      'Software is the programs you cannot touch',
      'Hardware and software work together',
      'The IPO cycle is Input → Process → Output',
      'The CPU performs the processing step'
    ],
    keywords: ['computer', 'hardware', 'software', 'ipo', 'cpu'],
    sourceRef: 'JSS2 Computer Studies, Chapter 1',
    quiz: {
      title: 'Hardware & Software',
      questions: [
        { q: 'Which of these is hardware?', opts: ['Microsoft Word', 'Google Chrome', 'A keyboard', 'WhatsApp'], correct: 2, exp: 'A keyboard is a physical part you can touch.' },
        { q: 'What does CPU stand for?', opts: ['Central Print Unit', 'Central Processing Unit', 'Computer Personal Unit', 'Control Protocol Unit'], correct: 1, exp: 'CPU = Central Processing Unit.' },
        { q: 'Which of these is an output device?', opts: ['Mouse', 'Keyboard', 'Scanner', 'Monitor'], correct: 3, exp: 'A monitor displays information — it is an output device.' },
        { q: 'The IPO cycle is:', opts: ['Input-Process-Output', 'Internal-Print-Output', 'Information-Processing-Order', 'Input-Print-Output'], correct: 0, exp: 'IPO = Input → Process → Output.' }
      ]
    }
  },
  {
    subject: 'Computer Studies', level: 'JSS3', order: 1,
    title: 'Introduction to Programming',
    summary: 'What programming is and the concept of algorithms.',
    content: `<p><strong>Programming</strong> is writing instructions that tell a computer what to do. These instructions are called <strong>code</strong>.</p>
<p>An <strong>algorithm</strong> is a step-by-step plan for solving a problem. It is not tied to any programming language.</p>
<p>Example — finding the largest of two numbers:</p>
<ol>
<li>Get number A</li>
<li>Get number B</li>
<li>If A > B, then A is largest</li>
<li>Otherwise, B is largest</li>
</ol>
<p>Then you write this algorithm in a programming language — Python, JavaScript, etc.</p>`,
    keyPoints: [
      'Programming means writing instructions for a computer',
      'An algorithm is a step-by-step plan for solving a problem',
      'Algorithms are language-independent',
      'Code is an algorithm written in a specific programming language',
      'Common languages: Python, JavaScript, Java, C++'
    ],
    keywords: ['programming', 'algorithm', 'code', 'python', 'javascript'],
    sourceRef: 'JSS3 Computer Studies, Chapter 6',
    quiz: {
      title: 'Programming Concepts',
      questions: [
        { q: 'What is an algorithm?', opts: ['A programming language', 'A step-by-step plan for solving a problem', 'A type of computer', 'A hardware device'], correct: 1, exp: 'An algorithm is a plan — language-independent.' },
        { q: 'Which is NOT a programming language?', opts: ['Python', 'JavaScript', 'Windows', 'Java'], correct: 2, exp: 'Windows is an operating system, not a language.' },
        { q: 'Programming is:', opts: ['Drawing pictures', 'Writing instructions for a computer', 'Fixing hardware', 'Browsing the internet'], correct: 1, exp: 'Programming = writing instructions that a computer executes.' }
      ]
    }
  },
  {
    subject: 'Computer Studies', level: 'SS1', order: 1,
    title: 'Computer Networks Basics',
    summary: 'How computers connect and share resources.',
    content: `<p>A <strong>computer network</strong> is two or more computers connected to share data and resources.</p>
<p>Types of networks:</p>
<ul>
<li><strong>LAN</strong> (Local Area Network) — small area, like a school or office</li>
<li><strong>WAN</strong> (Wide Area Network) — large area, like a city or country. The internet is the largest WAN</li>
<li><strong>MAN</strong> (Metropolitan Area Network) — covers a city</li>
</ul>
<p>Networks let computers share files, printers, and internet connections. They also allow communication via email and messaging.</p>`,
    keyPoints: [
      'A network connects two or more computers',
      'LAN covers a small area like a school',
      'WAN covers a large area — the internet is the biggest WAN',
      'Networks allow sharing of files, printers, and internet',
      'Networks enable communication'
    ],
    keywords: ['network', 'lan', 'wan', 'internet', 'sharing'],
    sourceRef: 'SS1 Computer Studies, Chapter 5',
    quiz: {
      title: 'Computer Networks',
      questions: [
        { q: 'What does LAN stand for?', opts: ['Large Area Network', 'Local Area Network', 'Long Access Network', 'Linked Access Node'], correct: 1, exp: 'LAN = Local Area Network.' },
        { q: 'The internet is an example of:', opts: ['LAN', 'MAN', 'WAN', 'PAN'], correct: 2, exp: 'The internet is the largest Wide Area Network.' },
        { q: 'Networks allow computers to share:', opts: ['Only files', 'Only printers', 'Files, printers, and internet', 'Only electricity'], correct: 2, exp: 'Networks share many resources.' }
      ]
    }
  },
  {
    subject: 'Computer Studies', level: 'SS2', order: 1,
    title: 'Introduction to Databases',
    summary: 'Structured storage of data for fast retrieval.',
    content: `<p>A <strong>database</strong> is an organized collection of data stored and accessed electronically.</p>
<p>Key concepts:</p>
<ul>
<li><strong>Table</strong> — a collection of related data (like a spreadsheet)</li>
<li><strong>Record</strong> — one row in a table (one student, one product)</li>
<li><strong>Field</strong> — one column in a table (name, age, phone)</li>
<li><strong>Primary key</strong> — a unique identifier for each record (like a student ID)</li>
</ul>
<p>Databases power everything from bank systems to school records to shopping apps. Common systems: MySQL, PostgreSQL, MongoDB.</p>`,
    keyPoints: [
      'A database is an organized collection of data',
      'A table is a collection of related records',
      'A record is one row in a table',
      'A field is one column in a table',
      'A primary key uniquely identifies each record'
    ],
    keywords: ['database', 'table', 'record', 'field', 'primary key'],
    sourceRef: 'SS2 Computer Studies, Chapter 7',
    quiz: {
      title: 'Database Fundamentals',
      questions: [
        { q: 'A single row in a database table is called a:', opts: ['Field', 'Record', 'Table', 'Primary key'], correct: 1, exp: 'A record = one row of data.' },
        { q: 'What is a primary key?', opts: ['The first column', 'A unique identifier for each record', 'The largest value', 'A foreign key'], correct: 1, exp: 'A primary key is unique for each record.' },
        { q: 'Which is NOT a database system?', opts: ['MySQL', 'PostgreSQL', 'MongoDB', 'Photoshop'], correct: 3, exp: 'Photoshop is an image editor, not a database.' }
      ]
    }
  },
  {
    subject: 'Computer Studies', level: 'SS3', order: 1,
    title: 'Web Development Basics',
    summary: 'How websites are built with HTML, CSS, and JavaScript.',
    content: `<p>Websites are built with three core technologies:</p>
<ul>
<li><strong>HTML</strong> — the structure and content (headings, paragraphs, images)</li>
<li><strong>CSS</strong> — the styling (colors, fonts, layout)</li>
<li><strong>JavaScript</strong> — the behavior (interactivity, animations, data handling)</li>
</ul>
<p>A simple HTML page:</p>
<pre><code>&lt;h1&gt;Hello&lt;/h1&gt;
&lt;p&gt;This is my website&lt;/p&gt;</code></pre>
<p>Websites are hosted on servers and accessed via browsers. The browser requests files from a server, receives HTML/CSS/JS, and renders them into the page you see.</p>`,
    keyPoints: [
      'HTML provides structure and content',
      'CSS provides styling and layout',
      'JavaScript provides interactivity',
      'Browsers request files from servers and render them',
      'HTML, CSS, and JS work together for every website'
    ],
    keywords: ['html', 'css', 'javascript', 'web development', 'browser'],
    sourceRef: 'SS3 Computer Studies, Chapter 9',
    quiz: {
      title: 'Web Development Basics',
      questions: [
        { q: 'HTML is used for:', opts: ['Styling', 'Structure and content', 'Interactivity', 'Database queries'], correct: 1, exp: 'HTML provides the structure.' },
        { q: 'CSS is used for:', opts: ['Structure', 'Styling', 'Interactivity', 'Server logic'], correct: 1, exp: 'CSS handles styling and layout.' },
        { q: 'JavaScript is used for:', opts: ['Structure', 'Styling', 'Interactivity', 'Database storage'], correct: 2, exp: 'JS adds behavior and interactivity.' }
      ]
    }
  },

  // ==================================================
  // ENGLISH LANGUAGE
  // ==================================================
  {
    subject: 'English Language', level: 'JSS1', order: 1,
    title: 'Parts of Speech: Nouns',
    summary: 'Identify and classify nouns.',
    content: `<p>A <strong>noun</strong> names a person, place, thing, or idea.</p>
<p>Types of nouns:</p>
<ul>
<li><strong>Common nouns</strong> — general names: boy, city, book</li>
<li><strong>Proper nouns</strong> — specific names, capitalized: Lagos, Chioma, Nigeria</li>
<li><strong>Abstract nouns</strong> — ideas/feelings: freedom, love, honesty</li>
<li><strong>Collective nouns</strong> — groups: team, family, class</li>
</ul>
<p>Examples in sentences: <em>"The <strong>teacher</strong> gave <strong>books</strong> to the <strong>class</strong>."</em></p>`,
    keyPoints: [
      'A noun names a person, place, thing, or idea',
      'Common nouns are general, proper nouns are specific and capitalized',
      'Abstract nouns name ideas or feelings',
      'Collective nouns name groups',
      'Nouns can be singular or plural'
    ],
    keywords: ['noun', 'common', 'proper', 'abstract', 'collective'],
    sourceRef: 'JSS1 English, Chapter 1',
    quiz: {
      title: 'Nouns — Types & Uses',
      questions: [
        { q: 'Which of these is a proper noun?', opts: ['city', 'Lagos', 'book', 'teacher'], correct: 1, exp: 'Lagos is a specific place — a proper noun.' },
        { q: '"Freedom" is what kind of noun?', opts: ['Common', 'Proper', 'Abstract', 'Collective'], correct: 2, exp: 'Freedom is an idea — abstract.' },
        { q: '"Team" is what kind of noun?', opts: ['Common', 'Proper', 'Abstract', 'Collective'], correct: 3, exp: 'Team is a group — collective.' }
      ]
    }
  },
  {
    subject: 'English Language', level: 'JSS2', order: 1,
    title: 'Parts of Speech: Nouns and Verbs',
    summary: 'Identify nouns and verbs, and use them correctly in sentences.',
    content: `<p><strong>Nouns</strong> name a person, place, thing, or idea. Examples: teacher, Lagos, book, freedom, honesty.</p>
<p><strong>Verbs</strong> describe an action or a state of being. Examples: run, eat, think, is, seems.</p>
<p>Every complete sentence must have at least one noun (or pronoun) and one verb. For example: <em>"The student reads."</em> — "student" is the noun, "reads" is the verb.</p>
<p>Pronouns replace nouns: he, she, it, they, we, us.</p>`,
    keyPoints: [
      'Nouns name people, places, things, or ideas',
      'Verbs describe actions or states of being',
      'Every complete sentence needs a noun and a verb',
      'Pronouns replace nouns (he, she, it, they)'
    ],
    keywords: ['noun', 'verb', 'sentence', 'grammar', 'pronoun'],
    sourceRef: 'JSS2 English, Chapter 1',
    quiz: {
      title: 'Nouns & Verbs',
      questions: [
        { q: 'Which word is a verb?', opts: ['happy', 'run', 'tree', 'Lagos'], correct: 1, exp: 'Run is an action.' },
        { q: 'Which word is a noun?', opts: ['eat', 'quickly', 'book', 'jump'], correct: 2, exp: 'Book is a thing.' },
        { q: 'Every complete sentence must have:', opts: ['At least one noun and one verb', 'Only nouns', 'Only verbs', 'Only adjectives'], correct: 0, exp: 'A complete sentence requires both.' }
      ]
    }
  },
  {
    subject: 'English Language', level: 'JSS3', order: 1,
    title: 'Tenses: Past, Present, Future',
    summary: 'Use the correct tense to show when an action happens.',
    content: `<p><strong>Tense</strong> tells us when an action happens.</p>
<ul>
<li><strong>Present tense</strong> — happens now, or always: <em>"She <strong>walks</strong> to school."</em></li>
<li><strong>Past tense</strong> — already happened: <em>"She <strong>walked</strong> to school yesterday."</em></li>
<li><strong>Future tense</strong> — will happen: <em>"She <strong>will walk</strong> to school tomorrow."</em></li>
</ul>
<p>Each tense has simple, continuous, and perfect forms:</p>
<ul>
<li>Simple past: <em>I ate</em></li>
<li>Past continuous: <em>I was eating</em></li>
<li>Past perfect: <em>I had eaten</em></li>
</ul>`,
    keyPoints: [
      'Tense tells when an action happens',
      'Present: happens now or always',
      'Past: already happened',
      'Future: will happen',
      'Each tense has simple, continuous, and perfect forms'
    ],
    keywords: ['tense', 'past', 'present', 'future', 'grammar'],
    sourceRef: 'JSS3 English, Chapter 3',
    quiz: {
      title: 'Tenses',
      questions: [
        { q: '"She walked" is which tense?', opts: ['Present', 'Past', 'Future', 'Present perfect'], correct: 1, exp: 'Walked is the past tense of walk.' },
        { q: '"I will eat" is which tense?', opts: ['Present', 'Past', 'Future', 'Past perfect'], correct: 2, exp: 'Will + verb indicates future.' },
        { q: '"I am eating" is which form?', opts: ['Simple', 'Continuous', 'Perfect', 'Future'], correct: 1, exp: 'Am + verb-ing = present continuous.' }
      ]
    }
  },
  {
    subject: 'English Language', level: 'SS1', order: 1,
    title: 'Comprehension Skills',
    summary: 'Read a passage and extract meaning, main ideas, and inferences.',
    content: `<p><strong>Comprehension</strong> is the ability to understand what you read and answer questions about it.</p>
<p>Key strategies:</p>
<ul>
<li><strong>Skim first</strong> — read quickly to get the main idea</li>
<li><strong>Scan for details</strong> — look for specific information</li>
<li><strong>Identify the main idea</strong> — what is the passage mostly about?</li>
<li><strong>Infer</strong> — read between the lines, understand what's implied but not stated</li>
<li><strong>Vocabulary in context</strong> — figure out unfamiliar words from surrounding text</li>
</ul>
<p>Practice: read a passage once, then answer without re-reading. Then re-read to check your answers.</p>`,
    keyPoints: [
      'Comprehension means understanding what you read',
      'Skim first to get the main idea',
      'Scan for specific details',
      'Identify the main idea of a passage',
      'Infer meaning from context, not just literal text'
    ],
    keywords: ['comprehension', 'reading', 'inference', 'main idea', 'context'],
    sourceRef: 'SS1 English, Chapter 2',
    quiz: {
      title: 'Comprehension Skills',
      questions: [
        { q: 'What does it mean to "skim" a text?', opts: ['Read every word carefully', 'Read quickly for the main idea', 'Skip the text entirely', 'Read out loud'], correct: 1, exp: 'Skimming means reading fast for main ideas.' },
        { q: 'To infer means to:', opts: ['Copy exactly what is said', 'Read between the lines', 'Guess randomly', 'Skip difficult words'], correct: 1, exp: 'Inferring = understanding what is implied.' },
        { q: 'The main idea of a passage is:', opts: ['The first sentence', 'The last sentence', 'What the passage is mostly about', 'The longest sentence'], correct: 2, exp: 'Main idea = the central point.' }
      ]
    }
  },
  {
    subject: 'English Language', level: 'SS2', order: 1,
    title: 'Essay Writing: Structure & Style',
    summary: 'Write well-organized essays with clear introduction, body, and conclusion.',
    content: `<p>A good essay has three parts:</p>
<ul>
<li><strong>Introduction</strong> — grabs attention, states the topic, ends with a thesis (main argument)</li>
<li><strong>Body</strong> — each paragraph covers one main point with evidence/examples</li>
<li><strong>Conclusion</strong> — restates the thesis, summarizes key points, ends with a memorable closing</li>
</ul>
<p>Types of essays:</p>
<ul>
<li><strong>Narrative</strong> — tells a story</li>
<li><strong>Descriptive</strong> — describes something vividly</li>
<li><strong>Expository</strong> — explains or informs</li>
<li><strong>Argumentative</strong> — takes a position and defends it</li>
</ul>
<p>Tip: a paragraph = one idea. If you find two ideas, split into two paragraphs.</p>`,
    keyPoints: [
      'Every essay has introduction, body, and conclusion',
      'The introduction ends with a thesis statement',
      'Each body paragraph covers one main point',
      'The conclusion restates the thesis and summarizes',
      'Four types: narrative, descriptive, expository, argumentative'
    ],
    keywords: ['essay', 'introduction', 'body', 'conclusion', 'thesis', 'writing'],
    sourceRef: 'SS2 English, Chapter 4',
    quiz: {
      title: 'Essay Writing Structure',
      questions: [
        { q: 'Which part of an essay states the main argument?', opts: ['Introduction', 'Body', 'Conclusion', 'Title'], correct: 0, exp: 'The thesis is stated at the end of the introduction.' },
        { q: 'How many main ideas should a body paragraph cover?', opts: ['One', 'Two', 'Three', 'As many as possible'], correct: 0, exp: 'One idea per paragraph.' },
        { q: 'Which essay type defends a position?', opts: ['Narrative', 'Descriptive', 'Expository', 'Argumentative'], correct: 3, exp: 'Argumentative essays take and defend a position.' }
      ]
    }
  },
  {
    subject: 'English Language', level: 'SS3', order: 1,
    title: 'WAEC/SSCE Exam Preparation',
    summary: 'Strategies for success in WAEC English Language.',
    content: `<p>The WAEC/SSCE English Language exam has four components: <strong>comprehension, summary, essay writing, and objective (multiple choice) questions</strong>.</p>
<p>Strategies for each:</p>
<ul>
<li><strong>Comprehension</strong> — read carefully, answer in complete sentences, use your own words where asked</li>
<li><strong>Summary</strong> — find the main points, write them in your own words, stay under the word limit</li>
<li><strong>Essay</strong> — plan briefly, write clear paragraphs, watch your time</li>
<li><strong>Objective</strong> — read each question fully, eliminate obviously wrong answers</li>
</ul>
<p>Time management is critical: allocate time per section and stick to it. Answer the easiest questions first.</p>`,
    keyPoints: [
      'Four components: comprehension, summary, essay, objective',
      'Comprehension — answer in complete sentences',
      'Summary — use your own words, watch the word limit',
      'Essay — plan before writing, keep paragraphs focused',
      'Objective — eliminate wrong options first'
    ],
    keywords: ['waec', 'ssce', 'exam', 'english', 'preparation'],
    sourceRef: 'SS3 English, WAEC Prep',
    quiz: {
      title: 'WAEC English Strategies',
      questions: [
        { q: 'How many components does the WAEC English exam have?', opts: ['2', '3', '4', '5'], correct: 2, exp: 'Comprehension, summary, essay, and objective.' },
        { q: 'In a summary question, you should:', opts: ['Copy the passage exactly', 'Use your own words', 'Use as many words as possible', 'Skip it'], correct: 1, exp: 'Summaries require paraphrasing.' },
        { q: 'When answering objective questions, first:', opts: ['Read the passage twice', 'Eliminate obviously wrong answers', 'Guess', 'Skip difficult ones'], correct: 1, exp: 'Elimination narrows your options.' }
      ]
    }
  },

  // ==================================================
  // CIVIC EDUCATION
  // ==================================================
  {
    subject: 'Civic Education', level: 'JSS1', order: 1,
    title: 'Rights and Responsibilities',
    summary: 'Know your rights and your responsibilities as a citizen.',
    content: `<p>Every citizen has <strong>rights</strong> — things you are entitled to — and <strong>responsibilities</strong> — things you are expected to do.</p>
<p><strong>Rights</strong> include:</p>
<ul>
<li>Right to life</li>
<li>Right to education</li>
<li>Right to freedom of speech</li>
<li>Right to a fair hearing</li>
</ul>
<p><strong>Responsibilities</strong> include:</p>
<ul>
<li>Obeying the law</li>
<li>Paying taxes</li>
<li>Respecting the rights of others</li>
<li>Protecting public property</li>
</ul>
<p>Rights and responsibilities go together. My right to speak ends where your right to peace begins.</p>`,
    keyPoints: [
      'Rights are things you are entitled to',
      'Responsibilities are things you are expected to do',
      'Rights include life, education, speech, and fair hearing',
      'Responsibilities include obeying laws, paying taxes, respecting others',
      'Rights end where the rights of others begin'
    ],
    keywords: ['rights', 'responsibilities', 'citizen', 'law', 'freedom'],
    sourceRef: 'JSS1 Civic Education, Chapter 2',
    quiz: {
      title: 'Rights & Responsibilities',
      questions: [
        { q: 'Which is a right?', opts: ['Paying taxes', 'Obeying the law', 'Right to education', 'Respecting others'], correct: 2, exp: 'Education is a right.' },
        { q: 'Which is a responsibility?', opts: ['Right to life', 'Right to speech', 'Paying taxes', 'Right to education'], correct: 2, exp: 'Paying taxes is a responsibility.' },
        { q: 'Rights end where:', opts: ['You decide', 'The rights of others begin', 'You are tired', 'You leave school'], correct: 1, exp: 'Rights are limited by others\' rights.' }
      ]
    }
  },
  {
    subject: 'Civic Education', level: 'JSS2', order: 1,
    title: 'The Rule of Law',
    summary: 'Why laws apply equally to everyone.',
    content: `<p>The <strong>rule of law</strong> means everyone is subject to the law — including government officials, judges, and the president.</p>
<p>Key principles:</p>
<ul>
<li><strong>Supremacy of the law</strong> — the law is above everyone</li>
<li><strong>Equality before the law</strong> — everyone is treated the same</li>
<li><strong>Individual rights</strong> — the law protects citizens' rights</li>
<li><strong>Due process</strong> — fair procedures must be followed</li>
</ul>
<p>Without the rule of law, we get chaos or tyranny. With it, we get order, justice, and protection.</p>`,
    keyPoints: [
      'The rule of law means everyone is subject to the law',
      'The law applies to government officials too',
      'Equality before the law means everyone is treated the same',
      'Due process means fair procedures',
      'The rule of law protects rights and prevents tyranny'
    ],
    keywords: ['rule of law', 'justice', 'equality', 'due process', 'government'],
    sourceRef: 'JSS2 Civic Education, Chapter 3',
    quiz: {
      title: 'The Rule of Law',
      questions: [
        { q: 'The rule of law means:', opts: ['Only citizens obey laws', 'Everyone including officials is subject to the law', 'The military makes laws', 'The president is above the law'], correct: 1, exp: 'Everyone is subject to the law.' },
        { q: 'Equality before the law means:', opts: ['Everyone has the same job', 'Everyone is treated the same by the law', 'Only the rich matter', 'Only lawyers can judge'], correct: 1, exp: 'The law treats everyone equally.' },
        { q: 'Due process means:', opts: ['Speeding up trials', 'Fair legal procedures', 'Ignoring evidence', 'Skipping the judge'], correct: 1, exp: 'Due process = fair procedures.' }
      ]
    }
  },
  {
    subject: 'Civic Education', level: 'JSS3', order: 1,
    title: 'Democracy and Elections',
    summary: 'How democratic governments are chosen and held accountable.',
    content: `<p><strong>Democracy</strong> is government by the people. Citizens vote for their leaders.</p>
<p>Key features of democracy:</p>
<ul>
<li><strong>Free and fair elections</strong> — citizens choose leaders without coercion</li>
<li><strong>Universal suffrage</strong> — all adult citizens can vote</li>
<li><strong>Multiple parties</strong> — more than one political party exists</li>
<li><strong>Rule of law</strong> — everyone is subject to the law</li>
<li><strong>Protection of rights</strong> — citizens' rights are guaranteed</li>
</ul>
<p>Elections give citizens the power to <em>choose</em> their leaders and to <em>remove</em> them peacefully.</p>`,
    keyPoints: [
      'Democracy is government by the people',
      'Free and fair elections are essential',
      'Universal suffrage means all adults can vote',
      'Multiple political parties must exist',
      'Elections allow citizens to remove leaders peacefully'
    ],
    keywords: ['democracy', 'election', 'voting', 'suffrage', 'political parties'],
    sourceRef: 'JSS3 Civic Education, Chapter 5',
    quiz: {
      title: 'Democracy & Elections',
      questions: [
        { q: 'Democracy means:', opts: ['Rule by one person', 'Government by the people', 'Rule by the army', 'Rule by the rich'], correct: 1, exp: 'Democracy = people power.' },
        { q: 'Universal suffrage means:', opts: ['Only men can vote', 'All adult citizens can vote', 'Only rich people vote', 'Voting is optional'], correct: 1, exp: 'All adults have the right to vote.' },
        { q: 'In a democracy, leaders can be removed by:', opts: ['Assassination', 'Elections', 'Military coup', 'A single official'], correct: 1, exp: 'Elections allow peaceful removal.' }
      ]
    }
  },
  {
    subject: 'Civic Education', level: 'SS1', order: 1,
    title: 'Human Rights and the Constitution',
    summary: 'The rights guaranteed by the Nigerian Constitution.',
    content: `<p>The <strong>Nigerian Constitution</strong> guarantees fundamental human rights to all citizens. These include:</p>
<ul>
<li>Right to life</li>
<li>Right to dignity of the human person</li>
<li>Right to personal liberty</li>
<li>Right to fair hearing</li>
<li>Right to freedom of thought, conscience, and religion</li>
<li>Right to freedom of expression and the press</li>
<li>Right to peaceful assembly and association</li>
<li>Right to freedom of movement</li>
</ul>
<p>These rights are not absolute — they can be limited by law in the public interest (e.g., during emergencies).</p>`,
    keyPoints: [
      'The Constitution guarantees fundamental human rights',
      'Rights include life, dignity, liberty, and fair hearing',
      'Freedom of religion, expression, and movement are protected',
      'Rights are not absolute — they can be limited by law',
      'Limitations must be reasonable and justifiable'
    ],
    keywords: ['human rights', 'constitution', 'freedom', 'liberty', 'fundamental rights'],
    sourceRef: 'SS1 Civic Education, Chapter 4',
    quiz: {
      title: 'Human Rights & Constitution',
      questions: [
        { q: 'Which is NOT a fundamental right?', opts: ['Right to life', 'Right to education for all', 'Right to own property without limit', 'Right to dignity'], correct: 2, exp: 'Property rights have limits.' },
        { q: 'Constitutional rights can be limited:', opts: ['Whenever the government wants', 'In the public interest by law', 'Only in wartime', 'Never'], correct: 1, exp: 'Limitations must be for public interest.' },
        { q: 'Freedom of religion is a:', opts: ['Privilege', 'Fundamental right', 'Responsibility', 'Law'], correct: 1, exp: 'It is protected in the Constitution.' }
      ]
    }
  },
  {
    subject: 'Civic Education', level: 'SS2', order: 1,
    title: 'Corruption and Accountability',
    summary: 'The effects of corruption and the role of accountability.',
    content: `<p><strong>Corruption</strong> is the abuse of public office for personal gain — bribery, embezzlement, nepotism, fraud.</p>
<p><strong>Effects of corruption:</strong></p>
<ul>
<li>Wasted public resources</li>
<li>Poor infrastructure and services</li>
<li>Loss of public trust</li>
<li>Hindered development</li>
<li>Unfair access to opportunities</li>
</ul>
<p><strong>Accountability</strong> means public officials must explain their actions and be answerable to citizens. Mechanisms include:</p>
<ul>
<li>EFCC and ICPC (anti-corruption agencies)</li>
<li>Free press and investigative journalism</li>
<li>Independent judiciary</li>
<li>Active civil society</li>
<li>Citizen vigilance and reporting</li>
</ul>`,
    keyPoints: [
      'Corruption is abuse of public office for personal gain',
      'It wastes resources and hinders development',
      'Accountability means officials must explain their actions',
      'EFCC and ICPC are Nigerian anti-corruption agencies',
      'Free press and citizen vigilance fight corruption'
    ],
    keywords: ['corruption', 'accountability', 'efcc', 'icpc', 'transparency'],
    sourceRef: 'SS2 Civic Education, Chapter 6',
    quiz: {
      title: 'Corruption & Accountability',
      questions: [
        { q: 'Corruption is:', opts: ['Doing your job well', 'Abusing public office for personal gain', 'A political party', 'A government agency'], correct: 1, exp: 'Corruption = abuse of public office.' },
        { q: 'Which is an anti-corruption agency in Nigeria?', opts: ['NAFDAC', 'EFCC', 'NCC', 'NNPC'], correct: 1, exp: 'EFCC = Economic and Financial Crimes Commission.' },
        { q: 'Accountability means:', opts: ['Hiding information', 'Officials must explain their actions', 'Ignoring the public', 'Keeping money private'], correct: 1, exp: 'Accountability = answerability to citizens.' }
      ]
    }
  },
  {
    subject: 'Civic Education', level: 'SS3', order: 1,
    title: 'National Values and Citizenship',
    summary: 'The core values of a good citizen.',
    content: `<p><strong>National values</strong> are the shared beliefs and ideals that shape a country's character. For Nigeria, they include:</p>
<ul>
<li><strong>Integrity</strong> — honesty and strong moral principles</li>
<li><strong>Patriotism</strong> — love and loyalty to one's country</li>
<li><strong>Discipline</strong> — self-control and following rules</li>
<li><strong>Tolerance</strong> — accepting differences in ethnicity, religion, opinion</li>
<li><strong>Cooperation</strong> — working together for common goals</li>
</ul>
<p>A good citizen:</p>
<ul>
<li>Respects the law and the rights of others</li>
<li>Contributes to community development</li>
<li>Pays taxes</li>
<li>Votes in elections</li>
<li>Protects public property and the environment</li>
</ul>`,
    keyPoints: [
      'National values include integrity, patriotism, discipline, tolerance, cooperation',
      'Integrity means honesty and strong moral principles',
      'Patriotism means love for one\'s country',
      'Good citizens obey laws, pay taxes, and vote',
      'Good citizens contribute to community development'
    ],
    keywords: ['national values', 'citizenship', 'integrity', 'patriotism', 'discipline'],
    sourceRef: 'SS3 Civic Education, Chapter 7',
    quiz: {
      title: 'National Values & Citizenship',
      questions: [
        { q: 'Which is NOT a national value?', opts: ['Integrity', 'Patriotism', 'Corruption', 'Tolerance'], correct: 2, exp: 'Corruption is against national values.' },
        { q: 'Patriotism means:', opts: ['Hatred of one\'s country', 'Love and loyalty to one\'s country', 'Ignoring laws', 'Working abroad'], correct: 1, exp: 'Patriotism = love of country.' },
        { q: 'A good citizen does NOT:', opts: ['Obey laws', 'Pay taxes', 'Avoid voting', 'Contribute to community'], correct: 2, exp: 'Voting is a citizen\'s duty.' }
      ]
    }
  }
];

// ============================================================
// AI cache templates
// ============================================================
function buildAIContent(action, lesson) {
  const kp = lesson.keyPoints || [];
  const title = lesson.title;
  const src = lesson.sourceRef ? `\n\n_Source: ${lesson.sourceRef}_` : '';
  switch (action) {
    case 'explain_simply':
      return `**${title} — Simply Explained**\n\n` + kp.map((p, i) => `${i + 1}. ${p}`).join('\n') + src;
    case 'give_examples':
      return `**Examples from the lesson**\n\n` + kp.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join('\n') + src;
    case 'practice_questions':
      return `**Practice — ${title}**\n\n` + kp.slice(0, 4).map((p, i) => `${i + 1}. Explain in your own words: ${p}`).join('\n') + src;
    case 'summarize':
      return `**Key takeaways — ${title}**\n\n` + kp.map((p, i) => `${i + 1}. ${p}`).join('\n') + src;
    default:
      return '';
  }
}

// ============================================================
// Seed
// ============================================================
async function seed() {
  await connectDB();
  logger.info('Starting full curriculum seed…');
  const now = Date.now();

  // Clean existing demo data
  const demoSubjects = SUBJECTS.map((s) => s.name);
  const existing = await Subject.find({ name: { $in: demoSubjects } }).select('_id');
  const demoSubjectIds = existing.map((s) => s._id);

  if (demoSubjectIds.length > 0) {
    const demoLessons = await Lesson.find({ subjectId: { $in: demoSubjectIds } }).select('_id');
    const demoLessonIds = demoLessons.map((l) => l._id);
    await AICache.deleteMany({ lessonId: { $in: demoLessonIds } });
    await Quiz.deleteMany({ subjectId: { $in: demoSubjectIds } });
    await LearningPack.deleteMany({ subjectId: { $in: demoSubjectIds } });
    await Lesson.deleteMany({ subjectId: { $in: demoSubjectIds } });
    await Subject.deleteMany({ _id: { $in: demoSubjectIds } });
  }
  await Attempt.deleteMany({ clientId: /^seed_/ });
  await Feedback.deleteMany({ adminNote: 'seed-data' });
  logger.info('Cleared old demo data');

  // Create subjects
  const subjectMap = {};
  for (const s of SUBJECTS) {
    const doc = await Subject.findOneAndUpdate(
      { name: s.name },
      {
        $set: {
          name: s.name,
          curriculum: 'Nigerian',
          levels: s.levels,
          description: s.description,
          icon: s.icon,
          color: s.color,
          isActive: true
        },
        $setOnInsert: { slug: slugify(s.name), lessonCount: 0 }
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    subjectMap[s.name] = doc;
  }
  logger.info(`Seeded ${Object.keys(subjectMap).length} subjects`);

  // Create lessons + AI cache + quizzes
  const lessonMap = {};   // `${subject}-${level}` → lesson doc
  const quizMap = {};     // same key → quiz doc
  let aiCount = 0;

  for (const item of CONTENT) {
    const subject = subjectMap[item.subject];
    if (!subject) {
      logger.warn(`Subject not found: ${item.subject}`);
      continue;
    }

    const lesson = await Lesson.create({
      subjectId: subject._id,
      title: item.title,
      summary: item.summary,
      content: item.content,
      level: item.level,
      curriculum: 'Nigerian',
      contentType: 'verified_curriculum',
      language: 'en',
      order: item.order || 0,
      estimatedMinutes: 10,
      keyPoints: item.keyPoints,
      keywords: item.keywords,
      sourceRef: item.sourceRef,
      isPublished: true,
      slug: slugify(item.title)
    });
    lessonMap[`${item.subject}-${item.level}`] = lesson;

    // AI cache — 4 actions
    for (const action of ['explain_simply', 'give_examples', 'practice_questions', 'summarize']) {
      await AICache.create({
        lessonId: lesson._id,
        action,
        learningDifficulty: 'beginner',
        language: 'en',
        content: buildAIContent(action, item),
        provider: 'template',
        groundedIn: item.sourceRef,
        confidence: 'high',
        isVerified: true,
        lessonVersion: lesson.version
      });
      aiCount++;
    }

    // Quiz
    if (item.quiz) {
      const quiz = await Quiz.create({
        title: item.quiz.title,
        subjectId: subject._id,
        lessonId: lesson._id,
        level: item.level,
        contentType: 'teacher_approved',
        passingScore: 70,
        isPublished: true,
        questions: item.quiz.questions.map(q => ({
          questionText: q.q,
          options: q.opts,
          correctIndex: q.correct,
          explanation: q.exp,
          difficulty: 'medium'
        }))
      });
      quizMap[`${item.subject}-${item.level}`] = quiz;
    }
  }

  logger.info(`Seeded ${Object.keys(lessonMap).length} lessons, ${aiCount} AI cache entries, ${Object.keys(quizMap).length} quizzes`);

  // Update lesson counts per subject
  for (const name of Object.keys(subjectMap)) {
    const count = await Lesson.countDocuments({ subjectId: subjectMap[name]._id });
    await Subject.updateOne({ _id: subjectMap[name]._id }, { $set: { lessonCount: count } });
  }

  // Build one pack per lesson
  let packCount = 0;
  for (const [key, lesson] of Object.entries(lessonMap)) {
    const quiz = quizMap[key];
    const subject = subjectMap[lesson.subjectId ? Object.keys(subjectMap).find(k => subjectMap[k]._id.equals(lesson.subjectId)) : key.split('-')[0]];
    const subjectDoc = await Subject.findById(lesson.subjectId).lean();
    if (!subjectDoc) continue;

    const packSlug = `${lesson.level.toLowerCase()}-${subjectDoc.slug}-${slugify(lesson.title).slice(0, 30)}`;
    const preview = {
      lessonCount: 1,
      quizCount: quiz ? 1 : 0,
      totalQuestions: quiz ? quiz.questions.length : 0,
      estimatedMinutes: lesson.estimatedMinutes || 10
    };
    const sizeBytes = Buffer.byteLength(JSON.stringify(preview), 'utf8') + 2000;
    const contentHash = crypto.createHash('sha256').update(JSON.stringify(preview)).digest('hex');

    const pack = await LearningPack.findOneAndUpdate(
      { slug: packSlug },
      {
        $set: {
          name: `${lesson.level} ${subjectDoc.name} — ${lesson.title}`,
          description: lesson.summary,
          subjectId: lesson.subjectId,
          level: lesson.level,
          curriculum: 'Nigerian',
          language: 'en',
          lessonIds: [lesson._id],
          quizIds: quiz ? [quiz._id] : [],
          lessonCount: 1,
          quizCount: quiz ? 1 : 0,
          estimatedMinutes: lesson.estimatedMinutes || 10,
          sizeBytes,
          contentHash,
          checksum: contentHash,
          isPublished: true,
          offlineReady: true
        },
        $setOnInsert: { slug: packSlug, version: 1 }
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    await Lesson.updateOne({ _id: lesson._id }, { $addToSet: { packIds: pack._id } });
    packCount++;
  }

  logger.info(`Seeded ${packCount} learning packs`);

  // Sample attempts for dashboard demonstration
  const firstQuiz = Object.values(quizMap)[0];
  if (firstQuiz) {
    for (let i = 0; i < 3; i++) {
      const ts = new Date(now - i * 86400000);
      await Attempt.findOneAndUpdate(
        { clientId: `seed_${firstQuiz._id}_${i}` },
        {
          $set: {
            anonymousId: 'anon_demo_seed_user',
            quizId: firstQuiz._id,
            lessonId: firstQuiz.lessonId,
            answers: firstQuiz.questions.map((_, idx) => ({
              questionIndex: idx,
              selectedIndex: idx % 2 === 0 ? 0 : 1,
              isCorrect: idx % 2 === 0
            })),
            score: Math.ceil(firstQuiz.questions.length / 2),
            total: firstQuiz.questions.length,
            percent: 50,
            clientTimestamp: ts,
            syncedAt: ts,
            weakTopicHints: ['medium']
          },
          $setOnInsert: { clientId: `seed_${firstQuiz._id}_${i}` }
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
    }
    logger.info('Seeded 3 sample attempts');
  }

  // Summary
  const counts = await Promise.all([
    Subject.countDocuments(),
    Lesson.countDocuments(),
    Quiz.countDocuments(),
    LearningPack.countDocuments(),
    AICache.countDocuments()
  ]);
  logger.info('=== Seed complete ===');
  logger.info(`Subjects:  ${counts[0]}`);
  logger.info(`Lessons:   ${counts[1]}`);
  logger.info(`Quizzes:   ${counts[2]}`);
  logger.info(`Packs:     ${counts[3]}`);
  logger.info(`AI cache:  ${counts[4]}`);
}

seed()
  .then(async () => { await disconnectDB(); process.exit(0); })
  .catch(async (err) => {
    logger.error('Seed failed:', err.message);
    if (err.stack) logger.error(err.stack);
    await disconnectDB();
    process.exit(1);
  });