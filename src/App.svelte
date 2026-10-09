<script lang="ts">
  import CTestApp from './lib/CTestApp.svelte'
  import BuildSentenceApp from './lib/BuildSentenceApp.svelte'

  let activeTab = $state<'c-test' | 'build-sentence'>('c-test')
</script>

<div class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col justify-between selection:bg-indigo-500/20 selection:text-indigo-600 dark:selection:text-indigo-400">
  <!-- Global Top Navigation Switcher -->
  <nav class="sticky top-0 z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80">
    <div class="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-xs font-black tracking-wider uppercase text-indigo-600 dark:text-indigo-400">
          English Prep Suite
        </span>
      </div>

      <!-- Segmented Control -->
      <div class="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200/60 dark:border-slate-800/60">
        <button
          onclick={() => (activeTab = 'c-test')}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer {activeTab === 'c-test' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
        >
          <span>🧩</span>
          <span>Complete the Words (C-Test)</span>
        </button>
        <button
          onclick={() => (activeTab = 'build-sentence')}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer {activeTab === 'build-sentence' ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
        >
          <span>✍️</span>
          <span>Build a Sentence (Writing)</span>
        </button>
      </div>
    </div>
  </nav>

  <!-- Main View -->
  <main class="flex-1">
    {#if activeTab === 'c-test'}
      <CTestApp />
    {:else}
      <BuildSentenceApp />
    {/if}
  </main>
</div>
