# English "Complete the Words" (C-Test) Practice App

A minimalist, high-performance, single-page web app for practicing the **English "Complete the Words" (C-Test)** task. 

- **100% Serverless & Zero-Tracking:** Runs entirely in browser memory (RAM).
- **Dynamic Real-World Passages:** Direct ingestion from Simple English Wikipedia API with parallel batching and fallback bank.
- **Strict Psychometric Truncation Algorithm:** First sentence intact, alternating word deletion starting in Sentence 2, exact $ceil(L/2)$ prefix / $floor(L/2)$ target, capped at exactly 10 blanks.
- **Mobile First UX:** Virtual keyboard retention (no dismiss/flicker on iOS/Android), auto-advancing inputs, underline dash slots, and instant side-by-side grading.

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

## 🛠️ Core Architecture & Deliverables

### 1. `cTestParser.ts` (`src/lib/cTestParser.ts`)
Standalone, zero-dependency TypeScript parser and ingestion engine:
- **API Endpoint:** Fetches directly from `https://simple.wikipedia.org/api/rest_v1/page/random/summary`.
- **Text Sanitization (`sanitizeText`):** Strips IPA phonetic notations `(/ˈwɪk.i/)`, bracketed citations `[1]`, notes `[note 1]`, empty parens, and normalizes whitespace.
- **Strict Validation Gate (`validatePassage`):**
  - Minimum 3 distinct sentences.
  - Total word count between 60 and 130 words.
  - Minimum 20 eligible alphabetic words after Sentence 1.
- **Parallel Batch Ingestion (`fetchAndParseCTest`):** Fetches 3 articles concurrently to resolve valid passages in <300ms.
- **Psychometric Tokenizer (`tokenizePassage`):**
  - Keeps Sentence 1 100% intact.
  - Truncates every 2nd eligible alphabetic word (`length > 1`) starting from Sentence 2 onward.
  - Truncation formula: Prefix = `Math.ceil(L / 2)`, Blank Target = `Math.floor(L / 2)`.
  - Anti-referencing rules: excludes Proper Nouns, article title words, and look-back words.
  - Terminates truncation immediately once exactly 10 unique blanks are created.

### 2. `CTestApp.svelte` (`src/lib/CTestApp.svelte`)
High-performance Svelte 5 reactive component:
- **Mobile Keyboard Retention:** Seamless DOM focus hopping across the 10 blanks without triggering virtual keyboard dismiss or viewport bounce on iOS Safari and Android Chrome.
- **Input Configuration:** `autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="text"` with exact `maxlength`.
- **Underline Dash Slots:** Displays individual character slots (`_ _ _`) with active cursor pulse.
- **Strict English Keystroke Filter:** Rejects non-English characters at keydown and keeps DOM input values in sync.
- **Exam & Practice Modes:** Toggle between untimed Practice Mode and standard 2:30 timed Exam Simulation.
- **Psychometric Diagnostic Breakdown:** Categorizes errors (Spelling Near-Miss, Incomplete, Lexical Mismatch) using Levenshtein distance.
- **Interactive Lexical Breakdown:** Inspect word prefixes and suffixes after grading.
- **Theme & Accessibility:**
  - Full Light / Dark mode toggle.
  - Full keyboard accessibility and ARIA labels.

---

## 🌐 Static Deployment Guide

Because the app is 100% static, client-side, and serverless, it can be deployed to any static host.

### Deploy to Cloudflare Pages
1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2. Select your repository.
3. Configure the build settings:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node.js Version:** `20` or `22` (set environment variable `NODE_VERSION=22` if needed)
4. Click **Save and Deploy**.

### Deploy to GitHub Pages
1. In your GitHub repository, go to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Push to your `main` or `master` branch. The included workflow `.github/workflows/deploy.yml` will automatically run tests, build the static site, and deploy it to GitHub Pages.

---

## 🧪 Testing

The test suite covers:
- Sanitization of bracketed references `[1]` and IPA guides `(/.../)`.
- Sentence boundary detection handling abbreviations (`Dr.`, `Mr.`, `U.S.`).
- Word qualification rules (non-alphabetic tokens and single letters ignored).
- Prefix and target truncation formulas (`Math.ceil(L/2)` / `Math.floor(L/2)`).
- Strict 10-blank cap and mutual uniqueness.
- Parallel batch ingestion and fallback loading.

```bash
npm test
```
