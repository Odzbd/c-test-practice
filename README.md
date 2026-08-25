# English "Complete the Words" (C-Test) Practice App

A minimalist, high-performance, single-page web app for mastering the **English "Complete the Words" (C-Test)** task (found in TOEFL iBT, Duolingo English Test, and academic language assessments).

- **100% Serverless & Zero-Tracking:** Runs entirely in browser memory (RAM) with no backend or account required.
- **Infinite Dynamic Ingestion:** Streams real-world academic articles directly from Simple English Wikipedia (250,000+ articles) with background pre-fetching for instant (0ms) passage transitions.
- **Zero-Repeat Session Guarantee:** Level 1 in-memory tracking ensures you never encounter the same article twice in a single session.
- **Strict Psychometric Truncation Engine:** Sentence 1 kept 100% intact as a context anchor; alternating word truncation starts in Sentence 2; exact $\lceil L/2 \rceil$ prefix / $\lfloor L/2 \rfloor$ target; capped at exactly 10 unique blanks.
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

### 1. Ingestion & Psychometric Engine (`src/lib/cTestParser.ts`)
Zero-dependency TypeScript engine implementing official C-Test psychometric construction rules:
- **Dynamic Wikipedia Feed:** Queries `https://simple.wikipedia.org/api/rest_v1/page/random/summary` across concurrent workers for ultra-fast resolution (<300ms).
- **Zero-Repeat Session Filter:** Memory-based `sessionSeenTitles = new Set<string>()` automatically rejects previously completed articles in 0ms.
- **Text Sanitization (`sanitizeText`):** Strips bracketed citations (`[1]`, `[note a]`), IPA guide strings (`(/.../)`), and normalizes spacing.
- **Strict Validation Gate (`validatePassage`):**
  - Minimum 3 distinct sentences.
  - Word count bounded between 60 and 130 words.
  - Minimum 20 eligible alphabetic words available after Sentence 1.
- **Psychometric Tokenizer (`tokenizePassage`):**
  - Sentence 1 is preserved 100% intact as the context anchor.
  - Truncates every 2nd eligible word starting from Sentence 2.
  - Truncation formula: Prefix = `Math.ceil(L / 2)`, Blank Target = `Math.floor(L / 2)`.
  - Anti-cheat & quality filters: excludes Proper Nouns, article title words, duplicate blanks, and look-back words.
  - Capped at **exactly 10 blanks**.

### 2. Lexical & Phonetics Engine (`src/lib/dictionaryService.ts`)
CORS-safe linguistic engine providing offline and real-time dictionary capabilities:
- **CMU ARPAbet-to-IPA Decoding (`arpaToIPA`):** Full phonetic conversion engine mapping ARPAbet phoneme sequences (`IH1 Z` → `/ɪz/`, `D ER0 EH1 K T S` → `/dərˈɛkts/`) with primary (`ˈ`) and secondary (`ˌ`) stress marks.
- **Built-in Curated Lexicon:** High-speed in-memory dictionary for high-frequency function and academic words.
- **CEFR Level Estimator (`estimateCEFRLevel`):** Classifies vocabulary from A1 (Beginner) to C2 (Proficient) using morphological suffix analysis and lexical complexity rules.
- **Datamuse Academic Integration:** Asynchronously queries part-of-speech, definitions, and academic synonyms with in-memory caching.
- **Prototype-Safe Design:** Uses `Map` data structures and `.at()` indexing to eliminate prototype pollution vectors.

### 3. Reactive UI Component (`src/lib/CTestApp.svelte`)
Modern Svelte 5 single-page application with responsive dark/light modes:
- **Smart Enter Flow:**
  - Blanks 1–9 (`enterkeyhint="next"`): Pressing Enter automatically advances cursor focus to the next blank.
  - Blank 10 (`enterkeyhint="done"`): Pressing Enter submits and grades the test.
  - Backspace on an empty blank automatically returns focus to the preceding input.
- **Mobile Keyboard Retention:** Focus hopping maintains active virtual keyboard focus without closing or flickering on mobile viewports.
- **Underline Dash Slots:** Renders individual character slots with live pulsing cursor indicators.
- **Exam vs. Practice Modes:** Switch between untimed practice and 2:30 countdown timed simulation.
- **Diagnostic Performance Analytics:** Categorizes mistakes (Flawless, Spelling Near-Miss, Incomplete, Lexical Mismatch) using Levenshtein distance calculations.
- **Interactive Word Inspector:** Modal overlay displaying word definitions, phonetic pronunciations, CEFR tags, and synonyms for any clicked word or correction badge.

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

The automated test suite runs via Vitest with 100% coverage across parser, tokenizer, dictionary, phonetics, and security components:

```bash
npm test
```

Test coverage includes:
- Reference sanitization (`[1]`, notes, IPA tags).
- Sentence splitting with abbreviation handling (`Dr.`, `Mr.`, `U.S.`).
- ETS truncation formula and proper noun preservation.
- Level 1 Zero-Repeat Session filter.
- Dynamic concurrent ingestion and abort signal handling.
- CMU ARPAbet to IPA phonetic conversions and stress assignment.
- Prototype pollution safety and graceful network fallback.
