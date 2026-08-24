/**
 * English "Complete the Words" (C-Test) Parser & Ingestion Engine
 * 
 * Strict C-Test Rules & High-Performance Architecture:
 * 1. 1st sentence is 100% intact to provide full context.
 * 2. Starting sentence 2 onward, evaluate words sequentially and truncate every 2nd eligible word.
 * 3. Only purely alphabetic words (/^[a-zA-Z]+$/) with length > 1 qualify for counting & truncation.
 * 4. Truncation formula: Prefix = Math.ceil(L / 2), Blank target = Math.floor(L / 2).
 * 5. Exactly 10 blanks generated. Subsequent text remains 100% intact.
 * 6. NO DUPLICATES & NO LOOK-BACK REFERENCES:
 *    - Never truncate words that already appeared in Sentence 1 or earlier text (prevents copying from context).
 *    - Never truncate Proper Nouns (capitalized words inside sentences, e.g. "Redfoo", "London").
 *    - Never truncate words from the article title.
 *    - All 10 blanks must be mutually unique.
 * 7. Fast Parallel Ingestion & Curated Fallback:
 *    - Uses parallel batch fetching (3 concurrent requests) to find valid passages in <300ms.
 *    - Seamlessly falls back to curated in-memory passages if Wikipedia is slow or fails.
 */

import { FALLBACK_PASSAGES } from './fallbackPassages'

export interface BlankToken {
  type: 'blank'
  id: string
  blankIndex: number
  prefix: string
  target: string
  fullWord: string
  expectedLength: number
}

export interface TextToken {
  type: 'text'
  content: string
}

export type CTestToken = TextToken | BlankToken

export interface CTestPassage {
  title: string
  pageUrl?: string
  rawExtract: string
  sanitizedText: string
  sentenceCount: number
  totalWordCount: number
  tokens: CTestToken[]
  blanks: BlankToken[]
  isFallback?: boolean
}

export interface WikipediaSummaryResponse {
  title: string
  extract: string
  description?: string
  content_urls?: {
    desktop?: {
      page: string
    }
  }
}

/**
 * Common abbreviations that do not end a sentence
 */
export const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc',
  'eg', 'ie', 'no', 'vol', 'dept', 'approx', 'est', 'jan', 'feb',
  'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'inc', 'ltd', 'corp', 'co', 'univ', 'rep', 'sen', 'gov', 'gen', 'col',
  'u.s', 'u.k', 'e.u', 'u.n', 'u.s.a', 'd.c', 'b.c', 'a.d', 'a.m', 'p.m'
])

/**
 * Sanitizes Wikipedia extract text:
 * - Removes pronunciation guides, e.g. (/ˈwɪk.i/) or (IPA: ...)
 * - Removes bracketed citations / notations, e.g. [1], [a], [note 1]
 * - Removes empty parentheses/brackets leftover from stripping
 * - Normalizes excessive whitespace
 */
export function sanitizeText(raw: string): string {
  if (!raw) return ''

  let text = raw

  // 1. Remove bracketed citations: [1], [12], [a], [note 1], [citation needed], etc.
  text = text.replace(/\[\s*(?:\d+|[a-zA-Z]|note\s+\d+|citation\s+needed|edit)\s*\]/gi, '')

  // 2. Remove pronunciation guides: (/.../), (IPA: ...), (listen), (pronounced ...)
  text = text.replace(/\(\s*\/[^)]+\/\s*\)/g, '')
  text = text.replace(/\(\s*(?:IPA:?|listen|pronounced)[^)]*\)/gi, '')
  // General phonetic transcription patterns inside parens containing IPA characters
  text = text.replace(/\(\s*[^)]*[əɪʊʌɑæɔpbtdkgfvθðszʃʒhmnŋlrjwˈˌː][^)]*\)/g, '')

  // 3. Remove any empty leftover parentheses or brackets
  text = text.replace(/\(\s*\)/g, '')
  text = text.replace(/\[\s*\]/g, '')

  // 4. Normalize spaces around punctuation
  text = text.replace(/\s+([.,!?;:])/g, '$1')

  // 5. Normalize whitespace to single spaces and trim
  text = text.replace(/\s+/g, ' ').trim()

  return text
}

/**
 * Splits text into distinct sentences, taking into account common abbreviations and initials.
 */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const sentences: string[] = []
  const delimiterRegex = /([.!?]+)(?:\s+|$)/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = delimiterRegex.exec(trimmed)) !== null) {
    const delimiter = match.at(1) || ''
    const delimiterIndex = match.index
    const candidateEnd = delimiterIndex + delimiter.length
    const candidateSentence = trimmed.slice(lastIndex, candidateEnd).trim()

    const words = candidateSentence.split(/\s+/)
    const lastWord = words.at(-1)?.toLowerCase().replace(/[()"'[\]]/g, '') || ''
    const cleanLastWord = lastWord.replace(/[.!?]+$/, '')

    const isKnownAbbr = ABBREVIATIONS.has(cleanLastWord)
    const isSingleInitial = /^[a-z]$/i.test(cleanLastWord)
    const isMultiDotAbbr = /^([a-z]\.){2,}$/i.test(lastWord)
    const isDecimal = /\d+\.\d*$/.test(candidateSentence)

    if ((isKnownAbbr || isSingleInitial || isMultiDotAbbr || isDecimal) && delimiterRegex.lastIndex < trimmed.length) {
      continue
    }

    if (candidateSentence.length > 0) {
      sentences.push(candidateSentence)
      lastIndex = delimiterRegex.lastIndex
    }
  }

  if (lastIndex < trimmed.length) {
    const trailing = trimmed.slice(lastIndex).trim()
    if (trailing.length > 0) {
      const lastSentence = sentences.at(-1)
      if (sentences.length > 0 && lastSentence && !/[.!?]$/.test(lastSentence)) {
        const updated = lastSentence + ' ' + trailing
        sentences.splice(sentences.length - 1, 1, updated)
      } else {
        sentences.push(trailing)
      }
    }
  }

  return sentences.filter(s => s.length > 0)
}

/**
 * Counts total words in a text (splitting on whitespace).
 */
export function countWords(text: string): number {
  if (!text || !text.trim()) return 0
  return text.trim().split(/\s+/).length
}

/**
 * Checks if a token is a purely alphabetic word eligible for C-Test counting.
 * Single letter words (like "a", "I") are ignored to prevent trivial 1-char puzzles.
 */
export function isEligibleWord(token: string): boolean {
  return /^[a-zA-Z]+$/.test(token) && token.length > 1
}

/**
 * Validates whether a text passage meets all strict C-Test constraints:
 * - At least 3 distinct sentences.
 * - Total word count between 60 and 130 words.
 * - Produces exactly 10 unique, non-referential blanks.
 */
export function validatePassage(text: string, title?: string): { valid: boolean; reason?: string; sentenceCount: number; totalWords: number } {
  const sanitized = sanitizeText(text)
  const sentences = splitSentences(sanitized)
  const sentenceCount = sentences.length
  const totalWords = countWords(sanitized)

  if (sentenceCount < 3) {
    return {
      valid: false,
      reason: `Insufficient sentences: found ${sentenceCount}, required >= 3`,
      sentenceCount,
      totalWords,
    }
  }

  if (totalWords < 60 || totalWords > 130) {
    return {
      valid: false,
      reason: `Word count out of range: ${totalWords} words (required: 60-130)`,
      sentenceCount,
      totalWords,
    }
  }

  const { blanks } = tokenizePassage(sanitized, title)
  if (blanks.length < 10) {
    return {
      valid: false,
      reason: `Generated only ${blanks.length} unique non-referential blanks, required 10`,
      sentenceCount,
      totalWords,
    }
  }

  return {
    valid: true,
    sentenceCount,
    totalWords,
  }
}

/**
 * Tokenizes a sanitized passage according to standard English C-Test truncation rules:
 * - Sentence 1 is 100% intact.
 * - From Sentence 2 onward, every 2nd purely alphabetic word (length > 1) is truncated.
 * - Truncation: prefix = Math.ceil(L / 2), target = Math.floor(L / 2).
 * - Psychometric & Anti-Referencing Rules:
 *   1. Words that appeared in Sentence 1 or earlier text cannot be truncated (prevents look-back copying).
 *   2. Proper nouns (capitalized inside a sentence, like "Redfoo", "London") are excluded.
 *   3. Words in the article title are excluded.
 *   4. All 10 blanks are mutually unique.
 * - Caps at exactly 10 blanks; subsequent text remains 100% intact.
 */
export function tokenizePassage(sanitizedText: string, title?: string): { tokens: CTestToken[]; blanks: BlankToken[] } {
  const sentences = splitSentences(sanitizedText)
  if (sentences.length === 0) {
    return { tokens: [], blanks: [] }
  }

  const firstSentence = sentences.at(0) || ''
  const firstSentenceEndIndex = sanitizedText.indexOf(firstSentence) + firstSentence.length
  const s1Part = sanitizedText.slice(0, firstSentenceEndIndex)
  const remainingPart = sanitizedText.slice(firstSentenceEndIndex)

  const tokens: CTestToken[] = []
  const blanks: BlankToken[] = []

  const precedingWords = new Set<string>()
  const seenBlankWords = new Set<string>()

  // Words to avoid from title
  const titleWords = new Set<string>()
  if (title) {
    const rawTitleWords = title.toLowerCase().split(/[^a-zA-Z]+/).filter(Boolean)
    for (const tw of rawTitleWords) {
      if (tw.length > 1) {
        titleWords.add(tw)
      }
    }
  }

  // Populate preceding words from Sentence 1
  const s1Words = s1Part.toLowerCase().split(/[^a-zA-Z]+/).filter(Boolean)
  for (const w of s1Words) {
    if (w.length > 1) {
      precedingWords.add(w)
    }
  }

  // Sentence 1 is 100% intact
  tokens.push({
    type: 'text',
    content: s1Part,
  })

  // Tokenize the remaining part
  const remainingTokens = remainingPart.split(/([a-zA-Z]+)/).filter(Boolean)

  let alphabeticWordCounter = 0
  let isStartOfSentence = true

  for (const rawToken of remainingTokens) {
    if (!/^[a-zA-Z]+$/.test(rawToken)) {
      if (/[.!?]/.test(rawToken)) {
        isStartOfSentence = true
      }
      const lastToken = tokens.at(-1)
      if (lastToken && lastToken.type === 'text') {
        lastToken.content += rawToken
      } else {
        tokens.push({ type: 'text', content: rawToken })
      }
      continue
    }

    const lowerWord = rawToken.toLowerCase()
    const isCapitalized = /^[A-Z]/.test(rawToken)
    const isProperNoun = isCapitalized && !isStartOfSentence
    const isInTitle = titleWords.has(lowerWord)
    const hasAppearedBefore = precedingWords.has(lowerWord)
    const isAlreadyBlank = seenBlankWords.has(lowerWord)

    const qualifiesForTruncation =
      isEligibleWord(rawToken) &&
      !isProperNoun &&
      !isInTitle &&
      !hasAppearedBefore &&
      !isAlreadyBlank &&
      blanks.length < 10

    if (isEligibleWord(rawToken) && blanks.length < 10) {
      alphabeticWordCounter++

      if (alphabeticWordCounter % 2 === 0 && qualifiesForTruncation) {
        const wordLen = rawToken.length
        const prefixLen = Math.ceil(wordLen / 2)
        const targetLen = Math.floor(wordLen / 2)

        const prefix = rawToken.slice(0, prefixLen)
        const target = rawToken.slice(prefixLen)

        const blankToken: BlankToken = {
          type: 'blank',
          id: `blank-${blanks.length}`,
          blankIndex: blanks.length,
          prefix,
          target,
          fullWord: rawToken,
          expectedLength: targetLen,
        }

        seenBlankWords.add(lowerWord)
        precedingWords.add(lowerWord)
        blanks.push(blankToken)
        tokens.push(blankToken)
        isStartOfSentence = false
        continue
      }
    }

    precedingWords.add(lowerWord)
    isStartOfSentence = false

    const lastToken = tokens.at(-1)
    if (lastToken && lastToken.type === 'text') {
      lastToken.content += rawToken
    } else {
      tokens.push({
        type: 'text',
        content: rawToken,
      })
    }
  }

  return { tokens, blanks }
}

/**
 * Returns a randomized, pre-certified C-Test passage from the in-memory fallback bank.
 */
export function getFallbackCTestPassage(): CTestPassage {
  const randomIndex = Math.floor(Math.random() * FALLBACK_PASSAGES.length)
  const item = FALLBACK_PASSAGES.at(randomIndex) || FALLBACK_PASSAGES[0]
  const sanitized = sanitizeText(item.extract)
  const validation = validatePassage(sanitized, item.title)
  const { tokens, blanks } = tokenizePassage(sanitized, item.title)

  return {
    title: item.title,
    pageUrl: item.pageUrl,
    rawExtract: item.extract,
    sanitizedText: sanitized,
    sentenceCount: validation.sentenceCount,
    totalWordCount: validation.totalWords,
    tokens,
    blanks,
    isFallback: true,
  }
}

/**
 * Fetches a single random summary from Simple English Wikipedia API.
 */
export async function fetchWikipediaPassage(signal?: AbortSignal): Promise<WikipediaSummaryResponse> {
  const endpoint = 'https://simple.wikipedia.org/api/rest_v1/page/random/summary'
  const response = await fetch(endpoint, {
    headers: {
      'Accept': 'application/json',
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Wikipedia API request failed with status: ${response.status} ${response.statusText}`)
  }

  const data: WikipediaSummaryResponse = await response.json()
  return data
}

/**
 * Fetches a concurrent batch of random summaries in parallel for maximum speed.
 */
export async function fetchWikipediaBatch(batchSize = 3, signal?: AbortSignal): Promise<WikipediaSummaryResponse[]> {
  const fetchPromises = Array.from({ length: batchSize }, () =>
    fetchWikipediaPassage(signal).catch(() => null)
  )
  const results = await Promise.all(fetchPromises)
  return results.filter((r): r is WikipediaSummaryResponse => r !== null && Boolean(r.extract))
}

export interface FetchOptions {
  maxBatches?: number
  batchSize?: number
  signal?: AbortSignal
  onRetry?: (attempt: number, reason: string) => void
  allowFallback?: boolean
}

/**
 * Fetches and parses a valid C-Test passage using Parallel Batch Ingestion.
 * If Wikipedia is slow or yields no valid candidate after maxBatches,
 * seamlessly falls back to the in-memory certified passage bank.
 */
export async function fetchAndParseCTest(options: FetchOptions = {}): Promise<CTestPassage> {
  const { maxBatches = 3, batchSize = 3, signal, onRetry, allowFallback = true } = options
  let lastErrorReason = 'No valid passage found in batch.'
  let totalCandidatesEvaluated = 0

  for (let batch = 1; batch <= maxBatches; batch++) {
    if (signal?.aborted) {
      throw new DOMException('Passage fetch aborted', 'AbortError')
    }

    try {
      const summaries = await fetchWikipediaBatch(batchSize, signal)
      totalCandidatesEvaluated += summaries.length

      for (const summary of summaries) {
        const sanitized = sanitizeText(summary.extract || '')
        const validation = validatePassage(sanitized, summary.title)

        if (validation.valid) {
          const { tokens, blanks } = tokenizePassage(sanitized, summary.title)

          if (blanks.length === 10) {
            return {
              title: summary.title,
              pageUrl: summary.content_urls?.desktop?.page,
              rawExtract: summary.extract,
              sanitizedText: sanitized,
              sentenceCount: validation.sentenceCount,
              totalWordCount: validation.totalWords,
              tokens,
              blanks,
              isFallback: false,
            }
          }
        } else {
          lastErrorReason = validation.reason || 'Failed validation constraints'
        }
      }

      onRetry?.(batch, `Batch ${batch}/${maxBatches} evaluated (${totalCandidatesEvaluated} candidates): ${lastErrorReason}`)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err
      }
      lastErrorReason = err instanceof Error ? err.message : String(err)
      onRetry?.(batch, lastErrorReason)
    }
  }

  // Gracefully return from in-memory certified bank if Wikipedia is exhausted or unreachable
  if (allowFallback) {
    return getFallbackCTestPassage()
  }

  throw new Error(`Could not find a valid C-Test passage after ${maxBatches} batches. Last reason: ${lastErrorReason}`)
}
