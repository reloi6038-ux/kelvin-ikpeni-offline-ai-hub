# Kelvin Ikpeni Offline AI Learning Hub

**Quality learning should not depend on your internet connection.**

An offline-first, AI-assisted learning platform for students in underserved communities — where internet is expensive, devices are basic, and connectivity is unreliable.

Built for the challenge: **"AI for Zero-Bandwidth & Localized Learning"** under the theme **"AI for the Next Generation: Reimagining How Students Learn, Work & Grow"**.

---

## The Problem

- A single hour-long video lesson can cost more than a day's transport.
- Connectivity drops mid-lesson.
- Low-RAM Android phones choke on heavy apps.
- Generic AI answers don't match local curricula.

**The result:** students stop learning when the internet stops working.

## The Solution

1. **Download once, learn forever** — complete packs (lessons + quizzes + AI explanations) under 500 KB.
2. **Real offline AI tutor** — pre-generated curriculum-grounded answers plus a rule-based fallback that never hallucinates.
3. **Works on any device** — plain HTML/CSS/JS, no framework, no external fonts, no images in the critical path.
4. **Syncs when connected** — quiz attempts queue locally and sync idempotently when the network returns.
5. **Grounded, verified, honest** — every AI response shows its source: curriculum notes vs AI-generated.

---

## Quick Start

### Prerequisites

- Node.js 18+ (uses native `fetch`)
- MongoDB (local or [MongoDB Atlas](https://cloud.mongodb.com) free tier)
- A modern browser (Chrome, Firefox, Safari, Edge)

### Install & Run

```bash
git clone <your-repo>
cd "Kelvin Ikpeni Offline AI Learning Hub"
npm install
cp .env.example .env
# Edit .env — set MONGODB_URI and generate an ADMIN_API_KEY
npm run seed
npm run dev
```
