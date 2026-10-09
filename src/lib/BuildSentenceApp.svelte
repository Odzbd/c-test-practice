<script lang="ts">
  import { onMount } from 'svelte'
  import confetti from 'canvas-confetti'
  import {
    fetchBuildSentenceBatch,
    evaluateSentenceAnswer,
    type SentenceQuestion,
    type SentenceChunk,
  } from './sentenceBuilder'

  // Exam configuration
  const EXAM_TOTAL_QUESTIONS = 10
  const EXAM_TOTAL_SECONDS = 7 * 60 // 7 minutes = 420 seconds

  // State
  let mode = $state<'exam' | 'practice'>('exam')
  let examPhase = $state<'intro' | 'active' | 'results'>('intro')

  let questions = $state<SentenceQuestion[]>([])
  let currentIndex = $state(0)
  let loading = $state(true)
  let error = $state<string | null>(null)

  // Current question interaction
  let placedChunks = $state<SentenceChunk[]>([])
  let availableChunks = $state<SentenceChunk[]>([])

  // Practice mode feedback state
  let practiceSubmitted = $state(false)
  let practiceIsCorrect = $state(false)

  // Exam recording state
  interface QuestionResult {
    question: SentenceQuestion
    userChunks: SentenceChunk[]
    isCorrect: boolean
  }
  let examResults = $state<QuestionResult[]>([])

  // Timer
  let timeLeft = $state(EXAM_TOTAL_SECONDS)
  let timerInterval: ReturnType<typeof setInterval> | null = null
  let elapsedSeconds = $state(0)

  const currentQuestion = $derived(questions[currentIndex])
  const examProgressPercent = $derived(
    mode === 'exam' && questions.length > 0
      ? Math.round(((currentIndex + (examPhase === 'results' ? 1 : 0)) / EXAM_TOTAL_QUESTIONS) * 100)
      : 0
  )

  const totalScore = $derived(examResults.filter(r => r.isCorrect).length)

  onMount(() => {
    loadQuestions()
    return () => {
      stopTimer()
    }
  })

  async function loadQuestions() {
    loading = true
    error = null
    try {
      const batch = await fetchBuildSentenceBatch(EXAM_TOTAL_QUESTIONS)
      questions = batch
      currentIndex = 0
      examResults = []
      initCurrentQuestion()
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load sentence questions.'
    } finally {
      loading = false
    }
  }

  function initCurrentQuestion() {
    if (!currentQuestion) return
    placedChunks = []
    availableChunks = [...currentQuestion.chunks]
    practiceSubmitted = false
    practiceIsCorrect = false
  }

  function startExam() {
    examPhase = 'active'
    currentIndex = 0
    examResults = []
    timeLeft = EXAM_TOTAL_SECONDS
    elapsedSeconds = 0
    initCurrentQuestion()
    startTimer()
  }

  function startTimer() {
    stopTimer()
    timerInterval = setInterval(() => {
      if (mode === 'exam') {
        if (timeLeft > 0) {
          timeLeft--
          elapsedSeconds++
        } else {
          // Time's up! Finish exam automatically
          finishExam()
        }
      } else {
        elapsedSeconds++
      }
    }, 1000)
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  function handleSelectChunk(chunk: SentenceChunk) {
    if (practiceSubmitted) return
    availableChunks = availableChunks.filter(c => c.id !== chunk.id)
    placedChunks = [...placedChunks, chunk]
  }

  function handleRemoveChunk(chunk: SentenceChunk) {
    if (practiceSubmitted) return
    placedChunks = placedChunks.filter(c => c.id !== chunk.id)
    availableChunks = [...availableChunks, chunk]
  }

  function handleUndo() {
    if (placedChunks.length === 0 || practiceSubmitted) return
    const last = placedChunks[placedChunks.length - 1]
    placedChunks = placedChunks.slice(0, -1)
    availableChunks = [...availableChunks, last]
  }

  function handleReset() {
    if (practiceSubmitted) return
    initCurrentQuestion()
  }

  function submitCurrentQuestion() {
    if (!currentQuestion) return

    const userTexts = placedChunks.map(c => c.text)
    const evalResult = evaluateSentenceAnswer(
      userTexts,
      currentQuestion.correctOrder
    )

    if (mode === 'exam') {
      examResults.push({
        question: currentQuestion,
        userChunks: [...placedChunks],
        isCorrect: evalResult.isCorrect,
      })

      if (currentIndex + 1 < EXAM_TOTAL_QUESTIONS) {
        currentIndex++
        initCurrentQuestion()
      } else {
        finishExam()
      }
    } else {
      // Practice mode: show instant feedback
      practiceSubmitted = true
      practiceIsCorrect = evalResult.isCorrect
    }
  }

  function handlePracticeNext() {
    if (currentIndex + 1 < questions.length) {
      currentIndex++
      initCurrentQuestion()
    } else {
      loadQuestions()
    }
  }

  function finishExam() {
    stopTimer()
    examPhase = 'results'

    // If any remaining questions were unanswered due to timeout, mark them
    while (examResults.length < EXAM_TOTAL_QUESTIONS && questions[examResults.length]) {
      const q = questions[examResults.length]
      examResults.push({
        question: q,
        userChunks: [],
        isCorrect: false,
      })
    }

    if (totalScore >= 7) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        })
      } catch {
        // Fallback gracefully
      }
    }
  }

  function switchMode(newMode: 'exam' | 'practice') {
    if (mode === newMode) return
    stopTimer()
    mode = newMode
    if (newMode === 'exam') {
      examPhase = 'intro'
    } else {
      examPhase = 'active'
      startTimer()
    }
    initCurrentQuestion()
  }

  function formatTime(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  function speakSentence(text: string) {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-US'
      u.rate = 0.95
      window.speechSynthesis.speak(u)
    }
  }
</script>

<div class="max-w-4xl mx-auto px-4 py-8">
  <!-- Top Bar: Header & Controls -->
  <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>
        </svg>
      </div>
      <div>
        <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          Build a Sentence
          <span class="text-xs px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
            TOEFL Writing
          </span>
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Reorder scrambled phrase chunks to construct grammatically sound academic sentences
        </p>
      </div>
    </div>

    <!-- Mode Selector & Timer Display -->
    <div class="flex items-center gap-2">
      <div class="inline-flex rounded-lg bg-slate-200/80 dark:bg-slate-800 p-1 text-xs font-semibold">
        <button
          onclick={() => switchMode('exam')}
          class="px-3 py-1.5 rounded-md transition-all cursor-pointer {mode === 'exam' ? 'bg-violet-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
        >
          Exam (10 Qs • 7m)
        </button>
        <button
          onclick={() => switchMode('practice')}
          class="px-3 py-1.5 rounded-md transition-all cursor-pointer {mode === 'practice' ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
        >
          Practice Mode
        </button>
      </div>

      <!-- Live Timer Badge -->
      {#if mode === 'exam' && examPhase === 'active'}
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono font-bold text-xs {timeLeft <= 60 ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900 animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2"/></svg>
          <span>{formatTime(timeLeft)}</span>
        </div>
      {:else if mode === 'practice'}
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-600 dark:text-slate-400">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2"/></svg>
          <span>{formatTime(elapsedSeconds)}</span>
        </div>
      {/if}
    </div>
  </header>

  <!-- Loading State -->
  {#if loading}
    <div class="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <svg class="w-8 h-8 text-violet-600 dark:text-violet-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      <p class="text-sm font-medium text-slate-600 dark:text-slate-300">
        Ingesting discourse pairs from Simple English Wikipedia...
      </p>
    </div>
  {:else if error}
    <div class="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-center space-y-3">
      <svg class="w-8 h-8 text-rose-600 dark:text-rose-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" stroke-width="2"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01"/>
      </svg>
      <p class="text-sm text-rose-700 dark:text-rose-300">{error}</p>
      <button
        onclick={loadQuestions}
        class="px-4 py-2 text-sm font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors"
      >
        Retry Fetch
      </button>
    </div>
  {:else if mode === 'exam' && examPhase === 'intro'}
    <!-- EXAM INTRO SCREEN -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 text-center shadow-xs">
      <div class="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800/80 flex items-center justify-center text-violet-600 dark:text-violet-400 mx-auto mb-6">
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
      </div>

      <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
        Ready for the Timed Writing Simulation?
      </h2>
      <p class="text-slate-600 dark:text-slate-300 max-w-lg mx-auto text-sm sm:text-base mb-6 leading-relaxed">
        Test your command of English syntax, discourse relations, and word order across
        <strong>10 real-world academic sentences</strong> within <strong>7 minutes (07:00)</strong>.
      </p>

      <!-- Exam Rules Card -->
      <div class="max-w-md mx-auto grid grid-cols-2 gap-3 text-left mb-8 text-xs sm:text-sm">
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
          <span class="text-slate-500 dark:text-slate-400 block text-xs">Total Questions</span>
          <span class="font-bold text-slate-800 dark:text-slate-100 text-base">10 Sentences</span>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
          <span class="text-slate-500 dark:text-slate-400 block text-xs">Time Limit</span>
          <span class="font-bold text-violet-600 dark:text-violet-400 text-base">7:00 Minutes</span>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
          <span class="text-slate-500 dark:text-slate-400 block text-xs">Scoring System</span>
          <span class="font-bold text-slate-800 dark:text-slate-100 text-base">Binary (1 or 0)</span>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
          <span class="text-slate-500 dark:text-slate-400 block text-xs">Pacing</span>
          <span class="font-bold text-slate-800 dark:text-slate-100 text-base">~42 sec / item</span>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onclick={startExam}
          class="w-full sm:w-auto px-8 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-base shadow-lg shadow-violet-500/25 transition-all transform hover:-translate-y-0.5 cursor-pointer"
        >
          Start Exam (7:00 Timer)
        </button>
        <button
          onclick={() => switchMode('practice')}
          class="w-full sm:w-auto px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Try Free Practice First
        </button>
      </div>
    </div>
  {:else if mode === 'exam' && examPhase === 'results'}
    <!-- EXAM RESULTS SCREEN -->
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 shadow-xs space-y-8">
      <div class="text-center space-y-3">
        <div class="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center {totalScore >= 7 ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 21h8m-4-4v4M5 3h14a2 2 0 012 2v2a5 5 0 01-5 5h-8a5 5 0 01-5-5V5a2 2 0 012-2zM5 5H3a2 2 0 00-2 2v1a4 4 0 004 4h0m14-7h2a2 2 0 012 2v1a4 4 0 01-4 4h0"/>
          </svg>
        </div>
        <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
          Exam Session Complete!
        </h2>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          Completed in {formatTime(elapsedSeconds)} • Official ETS Psychometric Rubric
        </p>

        <!-- Score Badge -->
        <div class="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 mt-2">
          <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">Overall Score:</span>
          <span class="text-2xl font-black {totalScore >= 8 ? 'text-emerald-600 dark:text-emerald-400' : totalScore >= 6 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}">
            {totalScore} / {EXAM_TOTAL_QUESTIONS}
          </span>
          <span class="text-xs px-2.5 py-1 rounded-full font-bold {totalScore >= 8 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : totalScore >= 6 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}">
            {Math.round((totalScore / EXAM_TOTAL_QUESTIONS) * 100)}%
          </span>
        </div>
      </div>

      <!-- Question Review List -->
      <div class="space-y-4">
        <h3 class="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
          Item-by-Item Diagnostic Review:
        </h3>
        <div class="space-y-3">
          {#each examResults as item, idx}
            <div class="p-4 rounded-xl border {item.isCorrect ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60' : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'}">
              <div class="flex items-center justify-between gap-2 mb-2">
                <span class="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Question {idx + 1} • {item.question.title}
                </span>
                <span class="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full {item.isCorrect ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300'}">
                  {#if item.isCorrect}
                    <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"/></svg>
                    <span>Correct (+1)</span>
                  {:else}
                    <svg class="w-3.5 h-3.5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 9l-6 6m0-6l6 6"/></svg>
                    <span>Incorrect (0)</span>
                  {/if}
                </span>
              </div>

              <!-- Context prompt -->
              <p class="text-xs text-slate-600 dark:text-slate-400 italic mb-2">
                Context: "{item.question.context}"
              </p>

              <!-- User's Answer -->
              <div class="text-xs sm:text-sm font-medium mb-1">
                <span class="text-slate-500 dark:text-slate-400">Your Answer: </span>
                <span class={item.isCorrect ? 'text-emerald-700 dark:text-emerald-300 font-semibold' : 'text-rose-700 dark:text-rose-300 line-through'}>
                  {item.userChunks.map(c => c.text).join(' ') || '(No answer provided)'}
                </span>
              </div>

              <!-- Target Answer if incorrect -->
              {#if !item.isCorrect}
                <div class="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  <span class="text-slate-500 dark:text-slate-400 font-normal">Target: </span>
                  {item.question.targetSentence}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-center gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        <button
          onclick={loadQuestions}
          class="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm shadow-md transition-colors cursor-pointer"
        >
          New Exam (Randomize)
        </button>
        <button
          onclick={() => switchMode('practice')}
          class="px-6 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Switch to Practice Mode
        </button>
      </div>
    </div>
  {:else if currentQuestion}
    <!-- ACTIVE QUESTION WORKSPACE (Exam or Practice) -->
    <div class="space-y-6">
      <!-- Progress Bar (Exam mode) -->
      {#if mode === 'exam'}
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Question {currentIndex + 1} of {EXAM_TOTAL_QUESTIONS}</span>
            <span>{examProgressPercent}% Completed</span>
          </div>
          <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full transition-all duration-300"
              style="width: {examProgressPercent}%"
            ></div>
          </div>
        </div>
      {/if}

      <!-- Context / Background Card -->
      <div class="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
            Context / Situation:
          </span>
          {#if currentQuestion.wikiUrl}
            <a
              href={currentQuestion.wikiUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
              title="View source article on Simple English Wikipedia"
            >
              <span>{currentQuestion.title}</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </a>
          {/if}
        </div>
        <p class="text-base sm:text-lg font-medium text-slate-800 dark:text-slate-100 leading-relaxed italic">
          "{currentQuestion.context}"
        </p>
      </div>

      <!-- Target Construct Tray (Where selected chunks are assembled) -->
      <div class="p-5 sm:p-6 rounded-2xl bg-slate-100/70 dark:bg-slate-900/60 border-2 border-dashed border-slate-300 dark:border-slate-700 min-h-[140px] flex flex-col justify-between transition-colors">
        <div>
          <div class="flex items-center justify-between gap-2 mb-3">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Constructed Sentence (Tap chunk to remove):
            </span>
            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
              <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Sentence ends with:</span>
              <span class="font-mono font-black text-sm text-violet-600 dark:text-violet-400">{currentQuestion.endingPunctuation}</span>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 min-h-[44px]">
            {#if placedChunks.length === 0}
              <span class="text-xs sm:text-sm text-slate-400 dark:text-slate-500 italic select-none py-2">
                Tap or click word chunks below to assemble the sentence in correct grammatical order...
              </span>
            {:else}
              {#each placedChunks as chunk, idx (chunk.id)}
                <button
                  type="button"
                  onclick={() => handleRemoveChunk(chunk)}
                  class="group inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 dark:bg-violet-600 text-white font-semibold text-sm sm:text-base shadow-xs hover:bg-rose-600 dark:hover:bg-rose-600 transition-all cursor-pointer transform hover:scale-[0.98]"
                  title="Click to remove from sentence"
                >
                  <span class="text-[11px] opacity-75 font-mono">{idx + 1}.</span>
                  <span>{chunk.text}</span>
                  <span class="text-xs opacity-60 group-hover:opacity-100 ml-0.5">✕</span>
                </button>
              {/each}

              <!-- Fixed Ending Punctuation Slot on the far right -->
              <span
                class="inline-flex items-center justify-center min-w-[34px] h-[40px] px-3 rounded-xl bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-black text-lg border border-slate-300 dark:border-slate-700 select-none shadow-2xs"
                title={`Fixed ending punctuation: ${currentQuestion.endingPunctuation}`}
              >
                {currentQuestion.endingPunctuation}
              </span>
            {/if}
          </div>
        </div>

        <!-- Audio pronunciation of user's current sentence -->
        {#if placedChunks.length > 0}
          <div class="flex items-center justify-between pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
            <span class="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {placedChunks.length} of {currentQuestion.chunks.length} chunks placed
            </span>
            <button
              type="button"
              onclick={() => speakSentence(placedChunks.map(c => c.text).join(' '))}
              class="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5L6 9H2v6h4l5 4V5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
              <span>Listen to sequence</span>
            </button>
          </div>
        {/if}
      </div>

      <!-- Word Bank (Available chunks to pick from) -->
      <div class="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Word & Phrase Bank:
          </span>
          <span class="text-xs text-slate-400">
            {availableChunks.length} chunks remaining
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2.5 min-h-[50px]">
          {#if availableChunks.length === 0}
            <span class="text-xs text-slate-400 italic">
              All chunks have been placed! Click "Submit" to grade your answer.
            </span>
          {:else}
            {#each availableChunks as chunk (chunk.id)}
              <button
                type="button"
                onclick={() => handleSelectChunk(chunk)}
                class="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-violet-100 dark:hover:bg-violet-950/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:text-violet-700 dark:hover:text-violet-300 font-medium text-sm sm:text-base transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer shadow-2xs"
              >
                {chunk.text}
              </button>
            {/each}
          {/if}
        </div>
      </div>

      <!-- Practice Mode Result Feedback -->
      {#if mode === 'practice' && practiceSubmitted}
        <div class="p-5 rounded-2xl border {practiceIsCorrect ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'} space-y-3">
          <div class="flex items-center gap-2 font-bold text-sm sm:text-base {practiceIsCorrect ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}">
            {#if practiceIsCorrect}
              <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"/></svg>
              <span>Correct syntax resolution! (+1 point)</span>
            {:else}
              <svg class="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 9l-6 6m0-6l6 6"/></svg>
              <span>Syntactic or word order mismatch.</span>
            {/if}
          </div>

          {#if !practiceIsCorrect}
            <div class="text-sm space-y-1">
              <span class="text-xs text-slate-500 dark:text-slate-400 block font-bold uppercase tracking-wider">
                Target Sentence:
              </span>
              <p class="font-semibold text-slate-900 dark:text-slate-100">
                {currentQuestion.targetSentence}
              </p>
            </div>
          {/if}

          <div class="flex items-center gap-2 pt-2">
            <button
              onclick={() => speakSentence(currentQuestion.targetSentence)}
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5L6 9H2v6h4l5 4V5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
              <span>Listen to native sentence</span>
            </button>
          </div>
        </div>
      {/if}

      <!-- Bottom Actions Toolbar -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={handleUndo}
            disabled={placedChunks.length === 0 || practiceSubmitted}
            class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14L4 9l5-5"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 9h10.5a5.5 5.5 0 015.5 5.5v0a5.5 5.5 0 01-5.5 5.5H11"/></svg>
            <span>Undo</span>
          </button>
          <button
            type="button"
            onclick={handleReset}
            disabled={placedChunks.length === 0 || practiceSubmitted}
            class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3v5h5"/></svg>
            <span>Reset</span>
          </button>
        </div>

        <div class="flex items-center gap-3">
          {#if mode === 'practice' && practiceSubmitted}
            <button
              type="button"
              onclick={handlePracticeNext}
              class="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm shadow-md transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Next Sentence</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
            </button>
          {:else}
            <button
              type="button"
              onclick={submitCurrentQuestion}
              disabled={placedChunks.length === 0}
              class="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-sm shadow-md shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {#if mode === 'exam'}
                <span>{currentIndex + 1 === EXAM_TOTAL_QUESTIONS ? 'Submit Exam' : 'Next Question'}</span>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
              {:else}
                <span>Check Answer</span>
              {/if}
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
