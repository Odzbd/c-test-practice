import { describe, it, expect, vi } from 'vitest'
import {
  sanitizeText,
  splitSentences,
  isEligibleWord,
  validatePassage,
  tokenizePassage,
  countWords,
  fetchAndParseCTest,
} from './cTestParser'

describe('cTestParser - Text Sanitization', () => {
  it('strips bracketed citations and notes', () => {
    const raw = 'The Eiffel Tower [1] is located in Paris [note 2]. It was built in 1889 [a].'
    const sanitized = sanitizeText(raw)
    expect(sanitized).toBe('The Eiffel Tower is located in Paris. It was built in 1889.')
  })

  it('strips IPA pronunciation guides and phonetic transcriptions', () => {
    const raw = 'The word Wikipedia (/ˌwɪkɪˈpiːdiə/ WIK-ih-PEE-dee-ə) is a multilingual encyclopedia.'
    const sanitized = sanitizeText(raw)
    expect(sanitized).toBe('The word Wikipedia is a multilingual encyclopedia.')
  })

  it('removes leftover empty parentheses and normalizes spaces', () => {
    const raw = 'Bangkok ( ) is the capital    city   of Thailand (IPA: [kruŋ tʰeːp]).'
    const sanitized = sanitizeText(raw)
    expect(sanitized).toBe('Bangkok is the capital city of Thailand.')
  })
})

describe('cTestParser - Sentence Splitting', () => {
  it('correctly splits regular sentences', () => {
    const text = 'First sentence is here. Second sentence follows! Is this the third one? Yes, it is.'
    const sentences = splitSentences(text)
    expect(sentences).toHaveLength(4)
    expect(sentences[0]).toBe('First sentence is here.')
    expect(sentences[1]).toBe('Second sentence follows!')
    expect(sentences[2]).toBe('Is this the third one?')
    expect(sentences[3]).toBe('Yes, it is.')
  })

  it('does not split on abbreviations like Dr., Mr., U.S.', () => {
    const text = 'Dr. Smith visited the U.S. last year. He met Mr. Johnson at the conference.'
    const sentences = splitSentences(text)
    expect(sentences).toHaveLength(2)
    expect(sentences[0]).toBe('Dr. Smith visited the U.S. last year.')
    expect(sentences[1]).toBe('He met Mr. Johnson at the conference.')
  })
})

describe('cTestParser - Word Eligibility & Truncation Rules', () => {
  it('identifies eligible alphabetic words (length > 1)', () => {
    expect(isEligibleWord('hello')).toBe(true)
    expect(isEligibleWord('is')).toBe(true)
    expect(isEligibleWord('world')).toBe(true)

    // Non-eligible
    expect(isEligibleWord('a')).toBe(false) // length <= 1
    expect(isEligibleWord('I')).toBe(false) // length <= 1
    expect(isEligibleWord('1924')).toBe(false) // numbers
    expect(isEligibleWord('100%')).toBe(false)
    expect(isEligibleWord('well-known')).toBe(false) // hyphen
    expect(isEligibleWord('...')).toBe(false)
  })

  it('applies exact ETS truncation formula: ceil(L/2) prefix, floor(L/2) target', () => {
    const s1 = 'The cat sat on the mat.'
    const s2 = 'It was a very nice sunny afternoon in springtime with many friendly people walking outside together and smiling brightly.'
    const passage = `${s1} ${s2}`

    const { tokens, blanks } = tokenizePassage(passage)

    expect(tokens[0].type).toBe('text')
    if (tokens[0].type === 'text') {
      expect(tokens[0].content).toContain(s1)
    }

    expect(blanks[0].fullWord).toBe('was')
    expect(blanks[0].prefix).toBe('wa')
    expect(blanks[0].target).toBe('s')

    expect(blanks[1].fullWord).toBe('nice')
    expect(blanks[1].prefix).toBe('ni')
    expect(blanks[1].target).toBe('ce')

    expect(blanks[2].fullWord).toBe('afternoon')
    expect(blanks[2].prefix).toBe('after')
    expect(blanks[2].target).toBe('noon')
  })

  it('never truncates proper nouns or words in the article title (e.g. Redfoo, Paris)', () => {
    const title = 'Redfoo'
    const s1 = 'Stefan Kendal Gordy, known by his stage name Redfoo, is an American musician and rapper.'
    const s2 = 'He created party rock music with Redfoo performing around London and Paris during high summer.'
    const s3 = 'The musical tracks received worldwide recognition across several modern radio stations.'
    const passage = `${s1} ${s2} ${s3}`

    const { blanks } = tokenizePassage(passage, title)
    const blankWords = blanks.map(b => b.fullWord.toLowerCase())

    expect(blankWords).not.toContain('redfoo')
    expect(blankWords).not.toContain('london')
    expect(blankWords).not.toContain('paris')
  })

  it('never truncates words that appeared in Sentence 1 (prevents look-back copying)', () => {
    const s1 = 'Water and oxygen are essential resources for biology.'
    const s2 = 'Animals consume water daily while oxygen circulates through living tissues to sustain healthy metabolic cellular processes.'
    const s3 = 'Without sufficient nourishment creatures rapidly experience extreme physical exhaustion and decay.'
    const passage = `${s1} ${s2} ${s3}`

    const { blanks } = tokenizePassage(passage)
    const blankWords = blanks.map(b => b.fullWord.toLowerCase())

    expect(blankWords).not.toContain('water')
    expect(blankWords).not.toContain('oxygen')
  })

  it('ensures no duplicate blank words are generated (all blanks are mutually unique)', () => {
    const s1 = 'Planets orbit massive stars throughout deep space.'
    const s2 = 'Every planet follows elliptical gravitational trajectories across expansive solar systems.'
    const s3 = 'Astronomers observe distant cosmic galaxies using powerful ground telescopes and orbital satellites.'
    const passage = `${s1} ${s2} ${s3}`

    const { blanks } = tokenizePassage(passage)
    const blankWords = blanks.map(b => b.fullWord.toLowerCase())
    const uniqueBlankWords = new Set(blankWords)

    expect(uniqueBlankWords.size).toBe(blankWords.length)
  })

  it('stops truncating at exactly 10 blanks', () => {
    const s1 = 'This is the first sentence that must stay completely intact.'
    const longWords = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega extra bonus words for test'
    const fullText = `${s1} ${longWords}. Another final sentence is here.`

    const { blanks, tokens } = tokenizePassage(fullText)

    expect(blanks).toHaveLength(10)
    const blankTokens = tokens.filter(t => t.type === 'blank')
    expect(blankTokens).toHaveLength(10)
  })
})

describe('cTestParser - Passage Validation', () => {
  it('rejects passages with fewer than 3 sentences', () => {
    const text = 'First sentence here. Second sentence is here.'
    const res = validatePassage(text)
    expect(res.valid).toBe(false)
    expect(res.reason).toContain('Insufficient sentences')
  })

  it('rejects passages with total words < 60', () => {
    const text = 'Sentence one is very short. Sentence two is also short. Sentence three is the last short sentence.'
    const res = validatePassage(text)
    expect(res.valid).toBe(false)
    expect(res.reason).toContain('Word count out of range')
  })

  it('validates passages satisfying all ETS criteria', () => {
    const title = 'Solar System'
    const passage =
      'The solar system consists of the Sun and the astronomical objects bound to it by gravity. ' +
      'Of the planets that orbit the Sun directly, the largest four are the giant planets, being substantially more massive than the terrestrial planets. ' +
      'The two largest planets, Jupiter and Saturn, are gas giants, being composed mainly of hydrogen and helium; the two outermost planets, Uranus and Neptune, are ice giants, being composed mostly of volatile substances.'

    const wordCount = countWords(passage)
    expect(wordCount).toBeGreaterThanOrEqual(60)
    expect(wordCount).toBeLessThanOrEqual(130)

    const res = validatePassage(passage, title)
    expect(res.valid).toBe(true)
    expect(res.sentenceCount).toBeGreaterThanOrEqual(3)

    const { blanks } = tokenizePassage(passage, title)
    expect(blanks).toHaveLength(10)
  })
})

describe('cTestParser - Continuous Dynamic Ingestion', () => {
  it('searches Wikipedia batches continuously and resolves the first valid summary', async () => {
    const invalidShortSummary = {
      title: 'Short Stub',
      extract: 'This is too short. It only has two sentences.',
    }

    const validSummary = {
      title: 'Solar System',
      extract:
        'The solar system consists of the Sun and the astronomical objects bound to it by gravity. ' +
        'Of the planets that orbit the Sun directly, the largest four are the giant planets, being substantially more massive than the terrestrial planets. ' +
        'The two largest planets, Jupiter and Saturn, are gas giants, being composed mainly of hydrogen and helium; the two outermost planets, Uranus and Neptune, are ice giants, being composed mostly of volatile substances.',
      content_urls: { desktop: { page: 'https://simple.wikipedia.org/wiki/Solar_System' } },
    }

    let callCount = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount < 4) {
        return {
          ok: true,
          status: 200,
          json: async () => invalidShortSummary,
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => validSummary,
      }
    }) as any

    let reportedAttempts = 0
    let lastEvaluatedCount = 0
    const passage = await fetchAndParseCTest({
      maxBatches: 5,
      batchSize: 3,
      onRetry: (attempt, _reason, totalEvaluated) => {
        reportedAttempts = attempt
        lastEvaluatedCount = totalEvaluated
      },
    })

    expect(passage.title).toBe('Solar System')
    expect(passage.blanks).toHaveLength(10)
    expect(reportedAttempts).toBeGreaterThanOrEqual(1)
    expect(lastEvaluatedCount).toBeGreaterThanOrEqual(3)

    globalThis.fetch = originalFetch
  })

  it('aborts promptly when AbortSignal is triggered', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50))
      return {
        ok: true,
        status: 200,
        json: async () => ({ title: 'Stub', extract: 'Short.' }),
      }
    }) as any

    const controller = new AbortController()
    setTimeout(() => controller.abort(), 20)

    await expect(
      fetchAndParseCTest({
        maxBatches: 10,
        batchSize: 2,
        signal: controller.signal,
      })
    ).rejects.toThrow()

    globalThis.fetch = originalFetch
  })
})
