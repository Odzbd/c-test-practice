<script lang="ts">
  import { onMount, tick } from 'svelte'
  import {
    fetchAndParseCTest,
    type CTestPassage,
    type BlankToken,
  } from './cTestParser'
  import confetti from 'canvas-confetti'

  let darkMode = $state(false)
  let passage = $state<CTestPassage | null>(null)
  let loading = $state(true)
  let retryAttempt = $state(0)
  let retryMessage = $state('')
  let errorMessage = $state<string | null>(null)

  // Modes: 'practice' (relaxed count-up) vs 'exam' (strict 2:30 countdown per ETS standard)
  let timerMode = $state<'practice' | 'exam'>('practice')
  const EXAM_TIME_LIMIT = 150 // 2 minutes 30 seconds

  // Interaction & Grading State
  let userAnswers = $state<string[]>(Array(10).fill(''))
  let isGraded = $state(false)
  let score = $state(0)
  let elapsedSeconds = $state(0)
  let timerInterval: ReturnType<typeof setInterval> | null = null
  let activeBlankIndex = $state<number | null>(null)

  // Diagnostic Error Analysis
  interface DiagnosticItem {
    blankIndex: number
    word: string
    prefix: string
    target: string
    userAnswer: string
    status: 'correct' | 'near-miss' | 'incomplete' | 'incorrect'
    explanation: string
  }
  let diagnostics = $state<DiagnosticItem[]>([])
  let selectedGlossaryWord = $state<{ word: string; prefix?: string; target?: string; fullWord?: string; explanation?: string } | null>(null)

  // Session Statistics (Kept in Browser RAM only)
  let sessionStats = $state({
    passagesCompleted: 0,
    totalCorrectBlanks: 0,
    totalBlanksAttempted: 0,
    bestStreak: 0,
    currentStreak: 0,
  })

  // Input references for seamless keyboard focus flow
  let inputRefs: (HTMLInputElement | null)[] = $state([])

  // Modal info state
  let showHelpModal = $state(false)

  // Timer controls
  function startTimer() {
    stopTimer()
    elapsedSeconds = 0
    timerInterval = setInterval(() => {
      if (!isGraded && !loading) {
        elapsedSeconds++
        if (timerMode === 'exam' && elapsedSeconds >= EXAM_TIME_LIMIT) {
          gradePassage()
        }
      }
    }, 1000)
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Levenshtein distance for spelling / inflection diagnostics
  function getLevenshteinDistance(a: string, b: string): number {
    const an = a.length
    const bn = b.length
    if (an === 0) return bn
    if (bn === 0) return an
    const matrix = Array.from({ length: bn + 1 }, () => Array(an + 1).fill(0))
    for (let i = 0; i <= an; i++) matrix[0][i] = i
    for (let j = 0; j <= bn; j++) matrix[j][0] = j
    for (let j = 1; j <= bn; j++) {
      for (let i = 1; i <= an; i++) {
        if (b.charAt(j - 1) === a.charAt(i - 1)) {
          matrix[j][i] = matrix[j - 1][i - 1]
        } else {
          matrix[j][i] = Math.min(
            matrix[j - 1][i - 1] + 1,
            matrix[j][i - 1] + 1,
            matrix[j - 1][i] + 1
          )
        }
      }
    }
    return matrix[bn][an]
  }

  // In-memory pre-fetching queue for 0ms instant passage transitions
  const BUFFER_TARGET_SIZE = 3
  let passageBuffer: CTestPassage[] = []
  let isPrefetching = false

  async function prefetchNextPassages() {
    if (isPrefetching || passageBuffer.length >= BUFFER_TARGET_SIZE) return
    isPrefetching = true
    try {
      const next = await fetchAndParseCTest({
        maxBatches: 5,
        batchSize: 3,
      })
      if (next && !passageBuffer.some(p => p.title === next.title) && passage?.title !== next.title) {
        passageBuffer.push(next)
      }
    } catch {
      // Background prefetch errors are safely ignored
    } finally {
      isPrefetching = false
      if (passageBuffer.length < BUFFER_TARGET_SIZE) {
        setTimeout(prefetchNextPassages, 1000)
      }
    }
  }

  async function loadPassage() {
    stopTimer()
    errorMessage = null
    retryAttempt = 0
    retryMessage = ''
    isGraded = false
    activeBlankIndex = 0
    userAnswers = Array(10).fill('')
    diagnostics = []
    selectedGlossaryWord = null

    // 1. Instant load from pre-fetch queue if available
    if (passageBuffer.length > 0) {
      passage = passageBuffer.shift()!
      loading = false
      startTimer()
      await tick()
      if (inputRefs[0]) {
        inputRefs[0]?.focus()
      }
      prefetchNextPassages()
      return
    }

    // 2. Real-time continuous fetch from Wikipedia if buffer is empty
    loading = true
    try {
      const result = await fetchAndParseCTest({
        maxBatches: Infinity,
        batchSize: 3,
        onRetry: (batch, _reason, totalEvaluated) => {
          retryAttempt = batch
          retryMessage = `Searching Simple English Wikipedia (Batch ${batch}, ${totalEvaluated} articles evaluated)...`
        },
      })
      passage = result
      loading = false
      startTimer()

      await tick()
      if (inputRefs[0]) {
        inputRefs[0]?.focus()
      }
      prefetchNextPassages()
    } catch (err) {
      loading = false
      errorMessage = err instanceof Error ? err.message : 'Failed to load a suitable Wikipedia passage.'
    }
  }

  function handleInput(index: number, e: Event) {
    if (!passage || isGraded) return
    const input = e.target as HTMLInputElement
    const targetLength = passage.blanks[index].expectedLength

    let val = input.value.replace(/[^a-zA-Z]/g, '').toLowerCase()
    if (val.length > targetLength) {
      val = val.slice(0, targetLength)
    }

    input.value = val
    userAnswers[index] = val

    if (val.length >= targetLength && index < 9) {
      inputRefs[index + 1]?.focus()
    }
  }

  // Handle Backspace, navigation keys, and reject non-English printable keystrokes
  function handleKeyDown(index: number, e: KeyboardEvent) {
    if (isGraded) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        loadPassage()
      }
      return
    }

    // Block non-English printable characters immediately at keystroke level
    if (e.key.length === 1 && !/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      return
    }

    if (e.key === 'Backspace') {
      const currentVal = userAnswers[index]
      if (!currentVal && index > 0) {
        e.preventDefault()
        inputRefs[index - 1]?.focus()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      gradePassage()
    } else if (e.key === 'ArrowRight') {
      const input = inputRefs[index]
      if (input && input.selectionStart === input.value.length && index < 9) {
        inputRefs[index + 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft') {
      const input = inputRefs[index]
      if (input && input.selectionStart === 0 && index > 0) {
        inputRefs[index - 1]?.focus()
      }
    }
  }

  // Grade the test with Psychometric Diagnostic Analysis
  function gradePassage() {
    if (!passage || isGraded) return
    stopTimer()
    activeBlankIndex = null

    let correctCount = 0
    const diagList: DiagnosticItem[] = []

    passage.blanks.forEach((blank, idx) => {
      const answer = (userAnswers[idx] || '').trim().toLowerCase()
      const target = blank.target.toLowerCase()
      const isExactMatch = answer === target
      const dist = getLevenshteinDistance(answer, target)

      let status: 'correct' | 'near-miss' | 'incomplete' | 'incorrect' = 'incorrect'
      let explanation = ''

      if (isExactMatch) {
        correctCount++
        status = 'correct'
        explanation = 'Flawless accurate lexical resolution.'
      } else if (dist === 1) {
        status = 'near-miss'
        explanation = answer.length === target.length
          ? `Spelling near-miss: typed "${answer}" instead of "${target}".`
          : `Suffix/inflection variation (1 letter difference). Target: "${target}".`
      } else if (answer.length === 0 || answer.length < target.length) {
        status = 'incomplete'
        explanation = `Incomplete response (${answer.length}/${target.length} characters). Target: "${target}".`
      } else {
        status = 'incorrect'
        explanation = `Lexical mismatch. Full target word: "${blank.fullWord}".`
      }

      diagList.push({
        blankIndex: idx,
        word: blank.fullWord,
        prefix: blank.prefix,
        target: blank.target,
        userAnswer: answer,
        status,
        explanation,
      })
    })

    score = correctCount
    diagnostics = diagList
    isGraded = true

    // Update RAM session stats
    sessionStats.passagesCompleted++
    sessionStats.totalCorrectBlanks += correctCount
    sessionStats.totalBlanksAttempted += 10

    if (correctCount >= 8) {
      sessionStats.currentStreak++
      if (sessionStats.currentStreak > sessionStats.bestStreak) {
        sessionStats.bestStreak = sessionStats.currentStreak
      }
    } else {
      sessionStats.currentStreak = 0
    }

    if (correctCount === 10) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'],
        })
      } catch {
        // Confetti fallback
      }
    }
  }

  function isBlankCorrect(index: number): boolean {
    if (!passage || !isGraded) return false
    const answer = (userAnswers[index] || '').trim().toLowerCase()
    return answer === passage.blanks[index].target.toLowerCase()
  }

  function getPerformanceRating(score: number): { title: string; color: string; badge: string } {
    if (score === 10) return { title: 'Mastery (ETS 30/30 Level)', color: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' }
    if (score >= 8) return { title: 'Advanced (ETS 26-29 Level)', color: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400' }
    if (score >= 6) return { title: 'Proficient (ETS 20-25 Level)', color: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400' }
    return { title: 'Developing / Needs Practice', color: 'text-rose-600 dark:text-rose-400', badge: 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400' }
  }

  function toggleTheme() {
    darkMode = !darkMode
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  function openGlossary(blank: BlankToken) {
    if (!isGraded) return
    selectedGlossaryWord = {
      word: blank.fullWord,
      prefix: blank.prefix,
      target: blank.target,
      fullWord: blank.fullWord,
      explanation: `Prefix preserved: "${blank.prefix}" • Target suffix: "${blank.target}" (${blank.expectedLength} letters)`,
    }
  }

  onMount(() => {
    // Default to clean Light Theme
    darkMode = false
    document.documentElement.classList.remove('dark')

    loadPassage()

    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (isGraded) {
          loadPassage()
        } else {
          gradePassage()
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKey)
    return () => {
      stopTimer()
      window.removeEventListener('keydown', handleGlobalKey)
    }
  })
</script>

<div class="w-full max-w-4xl mx-auto px-4 py-6 sm:py-10 flex flex-col gap-6">
  
  <!-- Header Bar -->
  <header class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-md shadow-indigo-500/20">
        C
      </div>
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          English C-Test Master
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 font-medium">
          Complete the Words • Psychometric Diagnostics & Instant Grading
        </p>
      </div>
    </div>

    <!-- Right Controls (Timer Mode, Help, Theme) -->
    <div class="flex items-center gap-2">
      <!-- Practice vs Exam Mode Toggle -->
      <div class="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold">
        <button
          onclick={() => { timerMode = 'practice'; startTimer(); }}
          class="px-2.5 py-1 rounded-md transition-all {timerMode === 'practice' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-600 dark:text-slate-400'}"
          title="Practice Mode: Untimed learning"
        >
          Practice
        </button>
        <button
          onclick={() => { timerMode = 'exam'; startTimer(); }}
          class="px-2.5 py-1 rounded-md transition-all {timerMode === 'exam' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}"
          title="Exam Mode: 2:30 timed countdown"
        >
          Exam (2:30)
        </button>
      </div>

      <button
        onclick={() => showHelpModal = true}
        aria-label="C-Test Rules and Instructions"
        class="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        title="Rules & Shortcuts"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <path stroke-width="2" d="M12 16v-4m0-4h.01"/>
        </svg>
      </button>

      <button
        onclick={toggleTheme}
        aria-label="Toggle Dark Mode"
        class="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        title="Toggle Theme"
      >
        {#if darkMode}
          <!-- Sun icon -->
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4" stroke-width="2"/>
            <path stroke-width="2" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
          </svg>
        {:else}
          <!-- Moon icon -->
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
          </svg>
        {/if}
      </button>
    </div>
  </header>

  <!-- Live Exam Metrics Bar & Pacing Bar -->
  <div class="flex flex-col gap-2">
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 shadow-xs">
      <div class="flex flex-col">
        <div class="flex items-center justify-between">
          <span class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">
            {timerMode === 'exam' ? 'Time Remaining' : 'Time Elapsed'}
          </span>
          {#if timerMode === 'exam'}
            <span class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">ETS 2:30</span>
          {/if}
        </div>
        <span class="font-mono text-lg sm:text-xl font-bold {
          timerMode === 'exam' && (EXAM_TIME_LIMIT - elapsedSeconds) <= 30
            ? 'text-rose-600 animate-pulse'
            : 'text-slate-800 dark:text-slate-200'
        }">
          {timerMode === 'exam' ? formatTime(Math.max(0, EXAM_TIME_LIMIT - elapsedSeconds)) : formatTime(elapsedSeconds)}
        </span>
      </div>
      <div class="flex flex-col">
        <span class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">Blanks Completed</span>
        <span class="font-mono text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400">
          {userAnswers.filter(a => a.trim().length > 0).length} / 10
        </span>
      </div>
      <div class="flex flex-col">
        <span class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">Passages Solved</span>
        <span class="font-mono text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-200">
          {sessionStats.passagesCompleted}
        </span>
      </div>
      <div class="flex flex-col">
        <span class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">Accuracy Streak</span>
        <span class="font-mono text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">
          {sessionStats.currentStreak} 🔥
        </span>
      </div>
    </div>

    <!-- Exam Mode Countdown Progress Bar -->
    {#if timerMode === 'exam' && !isGraded}
      {@const progressPct = Math.max(0, Math.min(100, ((EXAM_TIME_LIMIT - elapsedSeconds) / EXAM_TIME_LIMIT) * 100))}
      <div class="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
        <div
          class="h-full transition-all duration-1000 {
            progressPct > 40
              ? 'bg-indigo-600'
              : progressPct > 20
                ? 'bg-amber-500'
                : 'bg-rose-500'
          }"
          style="width: {progressPct}%;"
        ></div>
      </div>
    {/if}
  </div>

  <!-- Main Passage Card -->
  <main class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-6 relative overflow-hidden min-h-[360px]">
    
    {#if loading}
      <!-- Skeleton Loading State with Parallel Ingestion Indicator -->
      <div class="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div class="w-12 h-12 border-4 border-indigo-200 dark:border-indigo-950 border-t-indigo-600 rounded-full animate-spin"></div>
        <div class="space-y-1">
          <p class="text-base font-semibold text-slate-800 dark:text-slate-200">
            Ingesting & Filtering Passage...
          </p>
          {#if retryAttempt > 0}
            <p class="text-xs font-mono text-amber-600 dark:text-amber-400">
              Parallel Batch {retryAttempt}/3: {retryMessage}
            </p>
          {:else}
            <p class="text-xs text-slate-400">
              Validating ETS criteria, deduplicating blanks, and filtering proper nouns
            </p>
          {/if}
        </div>
      </div>

    {:else if errorMessage}
      <!-- Error / Fallback State -->
      <div class="flex flex-col items-center justify-center py-12 gap-4 text-center">
        <div class="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
        <div class="space-y-1 max-w-md">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">Passage Acquisition Notice</h3>
          <p class="text-sm text-slate-600 dark:text-slate-400">{errorMessage}</p>
        </div>
        <button
          onclick={loadPassage}
          class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm shadow-md transition-colors cursor-pointer"
        >
          Try Next Passage
        </button>
      </div>

    {:else if passage}
      <!-- Passage Article Metadata -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-1 text-xs font-semibold rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40">
            Wikipedia Live Topic
          </span>
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">
            {passage.title}
          </h2>
          {#if passage.pageUrl}
            <a
              href={passage.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-flex items-center gap-1"
              title="View original article"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
            </a>
          {/if}
        </div>

        <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
          <span>{passage.totalWordCount} words</span>
          <span>•</span>
          <span>{passage.sentenceCount} sentences</span>
          <span>•</span>
          <span class="font-semibold text-indigo-600 dark:text-indigo-400">10 blanks</span>
        </div>
      </div>

      <!-- Passage Text with Inline Blanks and Underline Dashes -->
      <div class="leading-loose sm:leading-loose text-base sm:text-lg font-normal text-slate-800 dark:text-slate-200 select-text">
        {#each passage.tokens as token}
          {#if token.type === 'text'}
            <span>{token.content}</span>
          {:else if token.type === 'blank'}
            {@const isCorrect = isBlankCorrect(token.blankIndex)}
            {@const currentAnswer = userAnswers[token.blankIndex] || ''}
            {@const isFocused = activeBlankIndex === token.blankIndex}
            
            <span class="inline-flex items-baseline mx-0.5 my-1 align-baseline select-none">
              <!-- Prefix segment (intact half) -->
              {#if isGraded}
                <button
                  type="button"
                  onclick={() => openGlossary(token)}
                  class="font-mono font-bold text-slate-900 dark:text-slate-100 bg-slate-200/90 dark:bg-slate-800/90 px-1.5 py-0.5 rounded-l text-sm sm:text-base border-y border-l border-slate-300 dark:border-slate-700 cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-700"
                  title="Click to view lexical breakdown"
                >
                  {token.prefix}
                </button>
              {:else}
                <span
                  class="font-mono font-bold text-slate-900 dark:text-slate-100 bg-slate-200/90 dark:bg-slate-800/90 px-1.5 py-0.5 rounded-l text-sm sm:text-base border-y border-l border-slate-300 dark:border-slate-700"
                >
                  {token.prefix}
                </span>
              {/if}
              
              <!-- Blank Input Box with Underline Dash Slots -->
              <span
                class="relative inline-flex items-center px-1.5 py-0.5 rounded-r border-y border-r transition-all duration-150 {
                  isGraded
                    ? isCorrect
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-500'
                      : 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-500'
                    : isFocused
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/30 border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'bg-slate-100/60 dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-slate-400'
                }"
              >
                <!-- Native input positioned invisibly on top -->
                <input
                  bind:this={inputRefs[token.blankIndex]}
                  type="text"
                  value={currentAnswer}
                  onfocus={() => activeBlankIndex = token.blankIndex}
                  onblur={() => { if (activeBlankIndex === token.blankIndex) activeBlankIndex = null }}
                  oninput={(e) => handleInput(token.blankIndex, e)}
                  onkeydown={(e) => handleKeyDown(token.blankIndex, e)}
                  maxlength={token.expectedLength}
                  autocapitalize="none"
                  autocomplete="off"
                  autocorrect="off"
                  spellcheck="false"
                  inputmode="text"
                  disabled={isGraded}
                  aria-label={`Blank ${token.blankIndex + 1} of 10, word begins with ${token.prefix}, requires ${token.expectedLength} letters`}
                  class="absolute inset-0 w-full h-full opacity-0 cursor-text z-10"
                />

                <!-- Underline Dash Slots Display -->
                <div class="flex items-center gap-1 font-mono text-sm sm:text-base font-bold select-none pointer-events-none">
                  {#each Array(token.expectedLength) as _, charIdx}
                    {@const char = currentAnswer[charIdx] || ''}
                    {@const isCurrentCharTarget = isFocused && !isGraded && currentAnswer.length === charIdx}
                    
                    <span
                      class="inline-flex flex-col items-center justify-center min-w-[0.95ch] transition-colors duration-150 {
                        isGraded
                          ? isCorrect
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-rose-700 dark:text-rose-300'
                          : isFocused
                            ? 'text-indigo-600 dark:text-indigo-300'
                            : 'text-slate-800 dark:text-slate-200'
                      }"
                    >
                      <!-- Character or Active Cursor indicator -->
                      <span class="h-5 sm:h-6 flex items-center justify-center font-bold lowercase">
                        {#if char}
                          {char}
                        {:else if isCurrentCharTarget}
                          <span class="inline-block w-0.5 h-3.5 bg-indigo-600 dark:bg-indigo-400 animate-pulse"></span>
                        {:else}
                          <span class="opacity-0">_</span>
                        {/if}
                      </span>
                      <!-- The Underline Dash -->
                      <span
                        class="w-full h-0.5 rounded-full transition-colors duration-150 {
                          isGraded
                            ? isCorrect
                              ? 'bg-emerald-500 dark:bg-emerald-400'
                              : 'bg-rose-500 dark:bg-rose-400'
                            : isCurrentCharTarget
                              ? 'bg-indigo-600 dark:bg-indigo-400 h-[2.5px]'
                              : char
                                ? 'bg-slate-700 dark:bg-slate-300'
                                : 'bg-slate-400/80 dark:bg-slate-600'
                        }"
                      ></span>
                    </span>
                  {/each}
                </div>
              </span>

              <!-- Immediate side-by-side correction badge when graded -->
              {#if isGraded && !isCorrect}
                <button
                  type="button"
                  onclick={() => openGlossary(token)}
                  class="inline-flex items-center ml-1 px-1.5 py-0.5 text-xs font-mono font-bold rounded bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 select-all cursor-pointer hover:bg-rose-200 dark:hover:bg-rose-900/80"
                  title={`Click to analyze: Target was "${token.target}" (${token.fullWord})`}
                >
                  → {token.target.toLowerCase()}
                </button>
              {/if}
            </span>
          {/if}
        {/each}
      </div>

      <!-- Action Buttons & Grading Banner -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-6 border-t border-slate-200 dark:border-slate-800 mt-2">
        {#if !isGraded}
          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span class="hidden sm:inline">Tip: Press</span>
            <kbd class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[11px]">Enter</kbd>
            <span>to submit •</span>
            <kbd class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[11px]">Backspace</kbd>
            <span>to go back</span>
          </div>

          <div class="flex items-center gap-3">
            <button
              onclick={loadPassage}
              class="flex-1 sm:flex-initial px-4 py-2.5 text-sm font-semibold rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
            >
              Skip Passage
            </button>
            <button
              onclick={gradePassage}
              class="flex-1 sm:flex-initial px-6 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition-all active:scale-[0.98] cursor-pointer"
            >
              Check Answers
            </button>
          </div>

        {:else}
          <!-- Performance Banner with Scoring & Diagnostics -->
          {@const rating = getPerformanceRating(score)}
          <div class="flex flex-col gap-4 w-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="w-14 h-14 rounded-xl flex items-center justify-center font-mono text-xl font-extrabold {
                  score >= 8 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }">
                  {score}/10
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-base font-bold text-slate-900 dark:text-white">Score: {score * 10}%</span>
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full border {rating.badge}">
                      {rating.title}
                    </span>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Completed in {formatTime(elapsedSeconds)} ({Math.round(elapsedSeconds / 10)}s / blank avg) • Click any word for lexical breakdown
                  </p>
                </div>
              </div>

              <button
                onclick={loadPassage}
                class="px-6 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Next Passage</span>
                <span class="font-mono text-xs opacity-80">(Enter)</span>
              </button>
            </div>

            <!-- Cognitive Scaffolding: Diagnostic Error Breakdown Table -->
            <div class="border-t border-slate-200 dark:border-slate-800/80 pt-3">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                Psychometric Diagnostic Breakdown
              </h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {#each diagnostics as item}
                  <div class="flex items-start justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                    <div>
                      <div class="flex items-center gap-1.5 font-mono">
                        <span class="font-bold text-slate-900 dark:text-white">{item.prefix}<strong>{item.target}</strong></span>
                        {#if item.status === 'correct'}
                          <span class="text-emerald-600 dark:text-emerald-400 font-semibold">✓</span>
                        {:else}
                          <span class="text-rose-500 line-through">{item.prefix}{item.userAnswer || '___'}</span>
                        {/if}
                      </div>
                      <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{item.explanation}</p>
                    </div>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 {
                      item.status === 'correct'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : item.status === 'near-miss'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                    }">
                      {item.status}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}

  </main>

  <!-- Interactive Lexical Glossary Modal (When clicking words after test) -->
  {#if selectedGlossaryWord}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in duration-150">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <span class="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold">Lexical Breakdown</span>
            <h3 class="text-xl font-mono font-extrabold text-slate-900 dark:text-white">
              {selectedGlossaryWord.fullWord || selectedGlossaryWord.word}
            </h3>
          </div>
          <button
            onclick={() => selectedGlossaryWord = null}
            class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div class="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          {#if selectedGlossaryWord.prefix && selectedGlossaryWord.target}
            <div class="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-xs space-y-1">
              <div class="flex justify-between">
                <span class="text-slate-400">Intact Prefix (ceil L/2):</span>
                <span class="font-bold text-slate-900 dark:text-white">{selectedGlossaryWord.prefix}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">Target Blank (floor L/2):</span>
                <span class="font-bold text-indigo-600 dark:text-indigo-400">{selectedGlossaryWord.target}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">Total Word Length:</span>
                <span>{(selectedGlossaryWord.prefix + selectedGlossaryWord.target).length} letters</span>
              </div>
            </div>
          {/if}

          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {selectedGlossaryWord.explanation || 'Analyzed according to standard C-Test psychometric morphology rules.'}
          </p>
        </div>

        <div class="flex justify-end pt-2">
          <button
            onclick={() => selectedGlossaryWord = null}
            class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ETS C-Test Explanation Modal -->
  {#if showHelpModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in duration-150">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">C-Test Rules & Information</h3>
          <button
            onclick={() => showHelpModal = false}
            class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div class="text-sm text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
          <p>
            The <strong>English "Complete the Words" (C-Test)</strong> evaluates lexical proficiency, reading comprehension, and syntactic context.
          </p>
          <ul class="list-disc list-inside space-y-1.5 pl-1 text-xs">
            <li><strong>Sentence 1</strong> is 100% intact to establish full context.</li>
            <li>Starting in <strong>Sentence 2</strong>, every 2nd word is truncated.</li>
            <li><strong>First half</strong> (<code class="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">ceil(L/2)</code>) is given.</li>
            <li><strong>Second half</strong> (<code class="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">floor(L/2)</code>) has exact underline dash slots (<span class="font-mono">_ _ _</span>).</li>
            <li><strong>Exam Mode (2:30)</strong> simulates official ETS timing constraints.</li>
            <li>Exactly <strong>10 unique blanks</strong> per passage are evaluated.</li>
          </ul>

          <div class="bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
            <span class="font-bold text-slate-900 dark:text-white">Keyboard Navigation:</span>
            <div class="grid grid-cols-2 gap-2 mt-2 font-mono">
              <div><kbd class="bg-white dark:bg-slate-900 px-1.5 py-0.5 border rounded">Auto</kbd> Jump to next blank</div>
              <div><kbd class="bg-white dark:bg-slate-900 px-1.5 py-0.5 border rounded">Backspace</kbd> Focus previous blank</div>
              <div><kbd class="bg-white dark:bg-slate-900 px-1.5 py-0.5 border rounded">Enter</kbd> Submit / Next</div>
              <div><kbd class="bg-white dark:bg-slate-900 px-1.5 py-0.5 border rounded">Cmd/Ctrl + Enter</kbd> Submit</div>
            </div>
          </div>
        </div>

        <div class="flex justify-end pt-2">
          <button
            onclick={() => showHelpModal = false}
            class="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Footer Info & ETS Disclaimer -->
  <footer class="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 dark:text-slate-500 gap-2 border-t border-slate-200 dark:border-slate-800/60 pt-4">
    <p>100% Serverless • No Database • Zero Tracking • Browser RAM Only</p>
    <p>Passages dynamically sourced from Simple English Wikipedia & Certified Bank</p>
  </footer>

</div>
