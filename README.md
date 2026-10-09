# English Test Practice Suite (C-Test & Build a Sentence)

A minimalist, high-performance, single-page web app for mastering academic English assessments (found in **TOEFL iBT / TOEFL Essentials**, Duolingo English Test, and university entrance exams):
1. **Reading / Lexical Mastery:** English "Complete the Words" (C-Test) Task
2. **Writing / Syntax Mastery:** TOEFL-Style "Build a Sentence" Task (10 Questions • 7 Minutes)

- **100% Serverless & Zero-Tracking:** Runs entirely in browser memory (RAM) with no backend or account required.
- **Infinite Dynamic Ingestion:** Streams real-world academic articles directly from Simple English Wikipedia (250,000+ articles) with background pre-fetching for instant (0ms) passage transitions.
- **Zero-Repeat Session Guarantee:** Level 1 in-memory tracking ensures you never encounter the same article twice in a single session.
- **Strict Psychometric Truncation Engine:** Sentence 1 kept 100% intact as a context anchor; alternating word truncation starts in Sentence 2; exact $\lceil L/2 \rceil$ prefix / $\lfloor L/2 \rfloor$ target; capped at exactly 10 unique blanks.
- **Timed Writing Simulation (Build a Sentence):** 10 consecutive discourse-paired questions from authentic academic text within a strict 7-minute (07:00) countdown, with interactive phrase chunks and binary scoring.
- **Smart Mobile & Desktop UX:** Virtual keyboard retention (no flicker on iOS Safari/Android Chrome), `enterkeyhint` smart navigation, underline dash slots, and instant side-by-side grading.
- **Interactive Dictionary & Phonetics Inspector:** Click any word in the passage to inspect contextual definitions, IPA pronunciation guides, synonyms, and CEFR language proficiency levels.

---

## 🚀 Quick Start

### 1. Installation
```bash
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```

### 3. Run Automated Unit Tests (Vitest)
```bash
npm test
```

### 4. Build for Production
```bash
npm run build
```
The optimized static bundle is emitted to the `dist/` directory.

---

## 🛠️ Core Architecture & Modules

### 1. C-Test Ingestion & Psychometric Engine (`src/lib/cTestParser.ts`)
Zero-dependency TypeScript engine implementing official C-Test psychometric construction rules:
- **Dynamic Wikipedia Feed:** Queries `https://simple.wikipedia.org/api/rest_v1/page/random/summary` across concurrent workers for ultra-fast resolution (<300ms).
- **Zero-Repeat Session Filter:** Memory-based `sessionSeenTitles = new Set<string>()` automatically rejects previously completed articles in 0ms.
- **Text Sanitization (`sanitizeText`):** Strips bracketed citations (`[1]`, `[note a]`), IPA guide strings (`(/.../)`), and normalizes spacing.
- **Strict Validation Gate (`validatePassage`):** Minimum 3 distinct sentences, 60–130 words, and at least 20 eligible alphabetic words after Sentence 1.
- **Psychometric Tokenizer (`tokenizePassage`):** Sentence 1 intact; truncates every 2nd eligible word starting from Sentence 2 ($\lceil L/2 \rceil$ prefix, $\lfloor L/2 \rfloor$ blank); capped at **exactly 10 blanks**.

### 2. Sentence Builder Engine (`src/lib/sentenceBuilder.ts`)
Discourse-paired syntax construction engine for TOEFL-style sentence building:
- **Discourse Pair Extraction:** Extracts consecutive sentence pairs `(Sentence 1 = Context, Sentence 2 = Target)` from Simple English Wikipedia.
- **Syntactic Chunking (`chunkSentence`):** Groups target sentences into 4–7 coherent phrase/word chunks based on grammatical boundaries (prepositions, conjunctions, verb phrases).
- **Guaranteed Shuffling (`shuffleChunks`):** Fisher-Yates shuffle guaranteeing the initial chunk presentation differs from the target order.
- **Binary Machine Scoring:** Evaluates user-arranged chunks against target syntax (1 point for complete accuracy, 0 otherwise).
- **Offline Academic Fallback Bank:** Preloaded with curated academic sentence pairs for instant 0ms offline capability.

### 3. Lexical & Phonetics Engine (`src/lib/dictionaryService.ts`)
CORS-safe linguistic engine providing offline and real-time dictionary capabilities:
- **CMU ARPAbet-to-IPA Decoding (`arpaToIPA`):** Full phonetic conversion engine mapping ARPAbet phoneme sequences (`IH1 Z` → `/ɪz/`, `D ER0 EH1 K T S` → `/dərˈɛkts/`) with primary (`ˈ`) and secondary (`ˌ`) stress marks.
- **Built-in Curated Lexicon:** High-speed in-memory dictionary for high-frequency function and academic words.
- **CEFR Level Estimator (`estimateCEFRLevel`):** Classifies vocabulary from A1 (Beginner) to C2 (Proficient) using morphological suffix analysis and lexical complexity rules.
- **Datamuse Academic Integration:** Asynchronously queries part-of-speech, definitions, and academic synonyms with in-memory caching.
- **Prototype-Safe Design:** Uses `Map` data structures and `.at()` indexing to eliminate prototype pollution vectors.

### 4. Reactive UI Components (`src/lib/CTestApp.svelte` & `src/lib/BuildSentenceApp.svelte`)
Modern Svelte 5 reactive single-page application with responsive dark/light modes:
- **Global Top Navigation (`src/App.svelte`):** Seamless switcher between `[ 🧩 Complete the Words (C-Test) ]` and `[ ✍️ Build a Sentence (Writing) ]`.
- **C-Test Practice:** Smart Enter flow (`enterkeyhint="next"`/`"done"`), mobile keyboard retention, underline dash slots, and diagnostic error categorizations.
- **Build a Sentence Writing:**
  - **Timed Exam Simulation:** 10 questions with a global 7-minute (420s) countdown timer starting upon user confirmation.
  - **Interactive Chip Tray:** Tap to place and remove phrase chunks, reset, undo, and native speech synthesis playback.
  - **Comprehensive Result Screen:** Total score, elapsed time, confetti on high scores, and item-by-item diagnostic review.
  - **Free Practice Mode:** Untimed sentence-by-sentence training with instant feedback and reference answers.

---

## 🌐 Static Deployment Guide

Because the app is 100% static, client-side, and serverless, it can be deployed to any static hosting provider.

### Deploy to Cloudflare Pages
1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2. Select your repository.
3. Configure build settings:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node.js Version:** `20` or `22` (set environment variable `NODE_VERSION=22` if needed)
4. Click **Save and Deploy**.

### Deploy to GitHub Pages
1. In your GitHub repository, navigate to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Push to your `main` branch. The automated GitHub Actions workflow will test, build, and deploy the application.

### Deploy to Vercel / Netlify
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

---

## 🧪 Testing

The automated test suite runs via Vitest with 100% coverage across parser, tokenizer, dictionary, sentence builder, and security components:

```bash
npm test
```

Test coverage (36 tests) includes:
- Reference sanitization (`[1]`, notes, IPA tags).
- Sentence splitting with abbreviation handling (`Dr.`, `Mr.`, `U.S.`).
- ETS truncation formula and proper noun preservation.
- Level 1 Zero-Repeat Session filter.
- Dynamic concurrent ingestion and abort signal handling.
- Sentence pair validation and chunking rules.
- Fisher-Yates chunk shuffling and binary scoring evaluation.
- CMU ARPAbet to IPA phonetic conversions and stress assignment.
- Prototype pollution safety and graceful network fallback.
