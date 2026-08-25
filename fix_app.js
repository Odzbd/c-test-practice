const fs = require('fs');
let code = fs.readFileSync('src/lib/CTestApp.svelte', 'utf8');

// 1. Fix prefetch
const badPrefetch = `    try {
      const next = await fetchAndParseCTest({
        maxBatches: 5,
        batchSize: 3,
      })
        passageBuffer.push(next)
      }
    } catch {`;

const goodPrefetch = `    try {
      const next = await fetchAndParseCTest({
        maxBatches: 5,
        batchSize: 3,
      })
      if (next && !passageBuffer.some(p => p.title === next.title)) {
        passageBuffer.push(next)
      }
    } catch {`;

code = code.replace(badPrefetch, goodPrefetch);

// 2. Fix badge
code = code.replace(/<span class="px-2\.5 py-1 text-xs font-semibold rounded-md \{[\s\S]*?'Wikipedia Live Topic'\s*<\/span>/m, `<span class="px-2.5 py-1 text-xs font-semibold rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40">
            Wikipedia Live Topic
          </span>`);

fs.writeFileSync('src/lib/CTestApp.svelte', code);
fs.unlinkSync('fix_app.js');
