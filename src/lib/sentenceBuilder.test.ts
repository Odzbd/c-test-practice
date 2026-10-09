import { describe, it, expect, vi } from 'vitest'
import {
  validateSentencePair,
  chunkSentence,
  shuffleChunks,
  formatChunkCase,
  createSentenceQuestion,
  extractSentencePairsFromText,
  evaluateSentenceAnswer,
  fetchBuildSentenceBatch,
  FALLBACK_SENTENCE_QUESTIONS,
} from './sentenceBuilder'

describe('sentenceBuilder - Chunk Casing & Punctuation Rules', () => {
  it('formats all words to lowercase except pronoun "I" and contractions', () => {
    expect(formatChunkCase('They contain')).toBe('they contain')
    expect(formatChunkCase('The Solar System')).toBe('the solar system')
    expect(formatChunkCase('I think')).toBe('I think')
    expect(formatChunkCase('Because I was')).toBe('because I was')
    expect(formatChunkCase("I'm going")).toBe("I'm going")
    expect(formatChunkCase("I've seen")).toBe("I've seen")
  })

  it('chunks a 10-word sentence into exactly 5 chunks without punctuation', () => {
    const sentence = 'They contain a high percentage of all known plant species.'
    const chunks = chunkSentence(sentence, 5)
    expect(chunks).toHaveLength(5)

    // No chunk should end with punctuation or contain period
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/[.!?]$/)
      expect(chunk).not.toMatch(/[,;:]$/)
    }

    // Joined words reconstitute the words without punctuation
    expect(chunks.join(' ')).toBe('they contain a high percentage of all known plant species')
  })

  it('keeps "I" capitalized inside chunks', () => {
    const sentence = 'I believe that we can solve this complex scientific puzzle.'
    const chunks = chunkSentence(sentence, 5)
    expect(chunks).toHaveLength(5)
    expect(chunks[0]).toContain('I')
  })
})

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

describe('sentenceBuilder - Shuffling & Question Creation', () => {
  it('shuffles chunks so the order differs from original', () => {
    const chunks = ['they contain', 'a high percentage', 'of all known', 'plant and', 'animal species']
    const shuffled = shuffleChunks(chunks)
    expect(shuffled).toHaveLength(chunks.length)
    expect([...shuffled].sort()).toEqual([...chunks].sort())
  })

  it('creates SentenceQuestion object with endingPunctuation extracted', () => {
    const context = 'The oceanic abyss receives virtually no sunlight even at noon.'
    const target = 'Creatures in this zone depend on organic material from above.'
    const q = createSentenceQuestion(context, target, 'Deep Ocean')

    expect(q.title).toBe('Deep Ocean')
    expect(q.context).toBe(context)
    expect(q.targetSentence).toBe(target)
    expect(q.endingPunctuation).toBe('.')
    expect(q.chunks).toHaveLength(5)
  })

  it('extracts question mark when target is a question', () => {
    const context = 'Many students wonder about the history of the solar system.'
    const target = 'How did all the major planets form in space?'
    const q = createSentenceQuestion(context, target, 'Solar System')

    expect(q.endingPunctuation).toBe('?')
  })
})

describe('sentenceBuilder - Evaluation & Scoring', () => {
  it('correctly scores an exact match as true', () => {
    const userChunks = ['they provide', 'power without', 'producing greenhouse', 'gas', 'emissions']
    const correctOrder = ['they provide', 'power without', 'producing greenhouse', 'gas', 'emissions']

    const evalResult = evaluateSentenceAnswer(userChunks, correctOrder)
    expect(evalResult.isCorrect).toBe(true)
  })

  it('scores an out-of-order sequence as false (binary scoring)', () => {
    const userChunks = ['power without', 'they provide', 'producing greenhouse', 'gas', 'emissions']
    const correctOrder = ['they provide', 'power without', 'producing greenhouse', 'gas', 'emissions']

    const evalResult = evaluateSentenceAnswer(userChunks, correctOrder)
    expect(evalResult.isCorrect).toBe(false)
  })
})

describe('sentenceBuilder - Wikipedia Text Parsing & Fallback Batch', () => {
  it('extracts sentence pairs from Wikipedia extract text with ~5 chunks each', () => {
    const rawText =
      'The Solar System formed around 4.6 billion years ago from a molecular cloud. ' +
      'Most of the remaining mass collapsed into planets and other orbiting bodies. ' +
      'Nuclear fusion in the central core started producing stellar light and heat. ' +
      'Rocky terrestrial planets formed closer to the central star than gas giants.'

    const pairs = extractSentencePairsFromText(rawText, 'Solar System')
    expect(pairs.length).toBeGreaterThanOrEqual(1)
    expect(pairs[0].context).toContain('Solar System formed')
    expect(pairs[0].endingPunctuation).toBe('.')
    expect(pairs[0].chunks).toHaveLength(5)
  })

  it('provides full 10-question batch using fallback bank when fetch fails', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline')) as any

    const batch = await fetchBuildSentenceBatch(10)
    expect(batch).toHaveLength(10)
    expect(FALLBACK_SENTENCE_QUESTIONS.map(f => f.title)).toContain(batch[0].title)
    expect(batch[0].endingPunctuation).toBe('.')

    globalThis.fetch = originalFetch
  })
})
