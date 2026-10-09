import { describe, it, expect, vi } from 'vitest'
import {
  validateSentencePair,
  chunkSentence,
  shuffleChunks,
  createSentenceQuestion,
  extractSentencePairsFromText,
  evaluateSentenceAnswer,
  fetchBuildSentenceBatch,
  FALLBACK_SENTENCE_QUESTIONS,
} from './sentenceBuilder'

describe('sentenceBuilder - Sentence Pair Validation', () => {
  it('validates good academic sentence pairs within length constraints', () => {
    const context = 'Photosynthesis is a biological process used by plants to convert light energy into sugars.'
    const target = 'Most plants and algae perform this crucial chemical reaction.'
    const result = validateSentencePair(context, target)
    expect(result.valid).toBe(true)
  })

  it('rejects pairs where context is too short (< 5 words)', () => {
    const context = 'Plants grow.'
    const target = 'Most plants and algae perform this crucial chemical reaction.'
    const result = validateSentencePair(context, target)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Context sentence length')
  })

  it('rejects pairs where target is too short (< 7 words)', () => {
    const context = 'Photosynthesis is an important biological process.'
    const target = 'It makes sugar.'
    const result = validateSentencePair(context, target)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('Target sentence length')
  })

  it('rejects target sentences without terminating punctuation', () => {
    const context = 'Photosynthesis is an important biological process.'
    const target = 'Most plants and algae perform this reaction'
    const result = validateSentencePair(context, target)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('does not end with punctuation')
  })
})

describe('sentenceBuilder - Sentence Chunking & Shuffling', () => {
  it('chunks a 10-word sentence into 4–6 coherent chunks', () => {
    const sentence = 'They contain a high percentage of all known plant species.'
    const chunks = chunkSentence(sentence)
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    expect(chunks.length).toBeLessThanOrEqual(7)
    // Joined chunks must reconstitute the original sentence exactly
    expect(chunks.join(' ')).toBe(sentence)
  })

  it('shuffles chunks so the order differs from original', () => {
    const chunks = ['They contain', 'a high percentage of', 'all known plant', 'species.']
    const shuffled = shuffleChunks(chunks)
    expect(shuffled).toHaveLength(chunks.length)
    // Check elements match
    expect([...shuffled].sort()).toEqual([...chunks].sort())
  })

  it('creates SentenceQuestion object with correctly structured chunks', () => {
    const context = 'The oceanic abyss receives virtually no sunlight even at noon.'
    const target = 'Creatures in this zone depend on organic material.'
    const q = createSentenceQuestion(context, target, 'Deep Ocean')

    expect(q.title).toBe('Deep Ocean')
    expect(q.context).toBe(context)
    expect(q.targetSentence).toBe(target)
    expect(q.chunks.length).toBeGreaterThanOrEqual(2)
    expect(q.correctOrder.join(' ')).toBe(target)
  })
})

describe('sentenceBuilder - Evaluation & Scoring', () => {
  it('correctly scores an exact match as true', () => {
    const targetSentence = 'They provide clean power without producing greenhouse gas emissions.'
    const userChunks = ['They provide', 'clean power', 'without producing', 'greenhouse gas emissions.']
    const correctOrder = ['They provide', 'clean power', 'without producing', 'greenhouse gas emissions.']

    const evalResult = evaluateSentenceAnswer(userChunks, correctOrder, targetSentence)
    expect(evalResult.isCorrect).toBe(true)
  })

  it('scores an out-of-order sequence as false (binary scoring)', () => {
    const targetSentence = 'They provide clean power without producing greenhouse gas emissions.'
    const userChunks = ['clean power', 'They provide', 'without producing', 'greenhouse gas emissions.']
    const correctOrder = ['They provide', 'clean power', 'without producing', 'greenhouse gas emissions.']

    const evalResult = evaluateSentenceAnswer(userChunks, correctOrder, targetSentence)
    expect(evalResult.isCorrect).toBe(false)
  })
})

describe('sentenceBuilder - Wikipedia Text Parsing & Fallback Batch', () => {
  it('extracts sentence pairs from Wikipedia extract text', () => {
    const rawText =
      'The Solar System formed around 4.6 billion years ago from a molecular cloud. ' +
      'Most of the remaining mass collapsed into planets and other orbiting bodies. ' +
      'Nuclear fusion in the central core started producing stellar light and heat. ' +
      'Rocky terrestrial planets formed closer to the central star than gas giants.'

    const pairs = extractSentencePairsFromText(rawText, 'Solar System')
    expect(pairs.length).toBeGreaterThanOrEqual(1)
    expect(pairs[0].context).toContain('Solar System formed')
    expect(pairs[0].targetSentence).toContain('remaining mass collapsed')
  })

  it('provides full 10-question batch using fallback bank when fetch fails', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline')) as any

    const batch = await fetchBuildSentenceBatch(10)
    expect(batch).toHaveLength(10)
    expect(FALLBACK_SENTENCE_QUESTIONS.map(f => f.title)).toContain(batch[0].title)

    globalThis.fetch = originalFetch
  })
})
