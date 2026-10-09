/**
 * Sentence Builder Engine (TOEFL-Style Writing: Build a Sentence)
 *
 * Rules:
 * - Word & Phrase Bank: All lowercase except "I" (and contractions like "I'm", "I'll", "I've", "I'd").
 * - Chunks contain NO terminating punctuation (no '.', '?', '!').
 * - Fixed ending punctuation ('.' or '?') is displayed statically at the top-right of the sentence slot.
 * - Targets approximately 5 chunks (~4–6 chunks) per sentence.
 * - Machine-scored binary: 1 point for exact syntactic match, 0 otherwise.
 */

import { sanitizeText, splitSentences } from './cTestParser'

export interface SentenceChunk {
  id: string
  text: string
}

export interface SentenceQuestion {
  id: string
  title: string
  context: string
  targetSentence: string
  endingPunctuation: string
  chunks: SentenceChunk[]
  correctOrder: string[]
  wikiUrl?: string
}

export interface SentencePairValidation {
  valid: boolean
  reason?: string
}

/**
 * Lowercases all words in a chunk except standalone "I" and contractions like "I'm", "I'll", "I've", "I'd".
 */
export function formatChunkCase(text: string): string {
  return text
    .split(/\s+/)
    .map(w => {
      // Keep "I" or "I'm", "I'll", "I've", "I'd"
      if (/^I(['’][a-z]+)?$/i.test(w)) {
        return 'I' + w.slice(1).toLowerCase()
      }
      return w.toLowerCase()
    })
    .join(' ')
}

/**
 * Validates whether two consecutive sentences are well-suited for a Build-a-Sentence question.
 */
export function validateSentencePair(context: string, target: string): SentencePairValidation {
  const contextWords = context.trim().split(/\s+/).filter(Boolean)
  const targetWords = target.trim().split(/\s+/).filter(Boolean)

  if (contextWords.length < 5 || contextWords.length > 30) {
    return {
      valid: false,
      reason: `Context sentence length (${contextWords.length} words) out of ideal range (5–30)`,
    }
  }

  if (targetWords.length < 7 || targetWords.length > 20) {
    return {
      valid: false,
      reason: `Target sentence length (${targetWords.length} words) out of ideal range (7–20)`,
    }
  }

  // Reject sentences with unclosed quotes, brackets, or suspicious symbols
  if (/[{}[\]\\]/.test(target) || /[{}[\\]]/.test(context)) {
    return { valid: false, reason: 'Contains unstripped code/markup brackets' }
  }

  // Ensure target ends with standard sentence punctuation
  if (!/[.!?]$/.test(target.trim())) {
    return { valid: false, reason: 'Target sentence does not end with punctuation' }
  }

  return { valid: true }
}

/**
 * Intelligently chunks a target sentence into approximately 5 chunks (4–6 chunks).
 * Strips all internal and trailing punctuation so no chunk reveals its position or ends with a period.
 * Formats all words to lowercase except "I".
 */
export function chunkSentence(sentence: string, targetChunks = 5): string[] {
  // Strip ending punctuation
  const clean = sentence.replace(/[.!?]+$/, '').trim()
  const rawWords = clean.split(/\s+/).filter(Boolean)
  if (rawWords.length === 0) return []

  // Clean punctuation from each word (except apostrophes in contractions like don't, I'm)
  const words = rawWords.map(w => w.replace(/^[("']|[)"'.,;:!?]+$/g, '').trim()).filter(Boolean)

  if (words.length <= targetChunks) {
    return words.map(w => formatChunkCase(w))
  }

  // Determine number of chunks (between 4 and 6, targeting 5)
  const count = Math.max(4, Math.min(6, targetChunks))
  const baseSize = Math.floor(words.length / count)
  const remainder = words.length % count

  const chunks: string[] = []
  let wordIdx = 0

  for (let i = 0; i < count; i++) {
    const chunkSize = baseSize + (i < remainder ? 1 : 0)
    const slice = words.slice(wordIdx, wordIdx + chunkSize)
    wordIdx += chunkSize
    const chunkText = formatChunkCase(slice.join(' '))
    chunks.push(chunkText)
  }

  return chunks
}

/**
 * Shuffles an array with Fisher-Yates, guaranteeing the shuffled order does not match the original.
 */
export function shuffleChunks<T>(items: T[]): T[] {
  if (items.length <= 1) return [...items]

  let attempts = 0
  let result = [...items]

  while (attempts < 10) {
    result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = result[i]
      result[i] = result[j]
      result[j] = temp
    }

    // Check if at least one item moved
    const isDifferent = result.some((item, idx) => item !== items[idx])
    if (isDifferent) {
      return result
    }
    attempts++
  }

  // Fallback swap if random produced same order
  if (result.length >= 2) {
    const temp = result[0]
    result[0] = result[1]
    result[1] = temp
  }

  return result
}

/**
 * Constructs a single SentenceQuestion from a context and target sentence.
 */
export function createSentenceQuestion(
  context: string,
  target: string,
  title: string,
  wikiUrl?: string,
  id = Math.random().toString(36).slice(2, 9)
): SentenceQuestion {
  const endingMatch = target.trim().match(/[.!?]+$/)
  const endingPunctuation = endingMatch ? endingMatch[0] : '.'

  const originalChunks = chunkSentence(target, 5)
  const shuffledTexts = shuffleChunks(originalChunks)

  const chunks: SentenceChunk[] = shuffledTexts.map((text, idx) => ({
    id: `${id}-chunk-${idx}`,
    text,
  }))

  return {
    id,
    title,
    context: context.trim(),
    targetSentence: target.trim(),
    endingPunctuation,
    chunks,
    correctOrder: originalChunks,
    wikiUrl,
  }
}

/**
 * Parses Wikipedia article text extract into valid consecutive sentence pairs.
 */
export function extractSentencePairsFromText(
  rawText: string,
  title: string,
  wikiUrl?: string
): SentenceQuestion[] {
  const sanitized = sanitizeText(rawText)
  const sentences = splitSentences(sanitized)

  const questions: SentenceQuestion[] = []

  // Check pairs of consecutive sentences (0+1, 2+3, 4+5, etc.)
  for (let i = 0; i < sentences.length - 1; i += 2) {
    const context = sentences[i]
    const target = sentences[i + 1]

    const val = validateSentencePair(context, target)
    if (val.valid) {
      questions.push(
        createSentenceQuestion(context, target, title, wikiUrl, `${title.slice(0, 5)}-${i}`)
      )
    }
  }

  return questions
}

/**
 * Evaluates whether a user's chosen chunk sequence forms the correct sentence.
 */
export function evaluateSentenceAnswer(
  userChunks: string[],
  correctOrder: string[]
): { isCorrect: boolean; normalizedUser: string; normalizedTarget: string } {
  const normalizedUser = userChunks.join(' ').trim().toLowerCase()
  const normalizedTarget = correctOrder.join(' ').trim().toLowerCase()

  const isCorrect = normalizedUser === normalizedTarget
  return {
    isCorrect,
    normalizedUser,
    normalizedTarget,
  }
}

// Fallback high-quality academic question bank (~5 chunks each, lowercase except 'I', no punctuation on chunks)
export const FALLBACK_SENTENCE_QUESTIONS: Omit<SentenceQuestion, 'chunks'>[] = [
  {
    id: 'fb-1',
    title: 'Photosynthesis',
    context: 'Plants absorb sunlight through chlorophyll pigments inside their green leaves.',
    targetSentence: 'This light energy is used to convert water and carbon dioxide into sugars.',
    endingPunctuation: '.',
    correctOrder: ['this light energy', 'is used to', 'convert water and', 'carbon dioxide', 'into sugars'],
  },
  {
    id: 'fb-2',
    title: 'Solar System',
    context: 'The Solar System formed approximately 4.6 billion years ago from a giant molecular cloud.',
    targetSentence: 'Most of the remaining mass collapsed into planets and other orbiting bodies.',
    endingPunctuation: '.',
    correctOrder: ['most of the', 'remaining mass', 'collapsed into', 'planets and other', 'orbiting bodies'],
  },
  {
    id: 'fb-3',
    title: 'Atmosphere',
    context: 'Earth has a thick layer of gases held in place by gravitational force.',
    targetSentence: 'It protects living organisms by absorbing ultraviolet solar radiation.',
    endingPunctuation: '.',
    correctOrder: ['it protects', 'living organisms', 'by absorbing', 'ultraviolet', 'solar radiation'],
  },
  {
    id: 'fb-4',
    title: 'Ecosystems',
    context: 'Tropical rainforests receive high amounts of rainfall throughout the entire year.',
    targetSentence: 'They contain a high percentage of all known plant and animal species.',
    endingPunctuation: '.',
    correctOrder: ['they contain a', 'high percentage', 'of all known', 'plant and', 'animal species'],
  },
  {
    id: 'fb-5',
    title: 'Gravity',
    context: 'Gravity is a fundamental interaction that causes mutual attraction between all things with mass.',
    targetSentence: 'It gives weight to physical objects on Earth and guides ocean tides.',
    endingPunctuation: '.',
    correctOrder: ['it gives weight', 'to physical objects', 'on earth and', 'guides ocean', 'tides'],
  },
  {
    id: 'fb-6',
    title: 'Deep Ocean',
    context: 'The oceanic abyss receives virtually no sunlight even during the brightest daytime.',
    targetSentence: 'Creatures in this zone depend on organic material falling from the surface.',
    endingPunctuation: '.',
    correctOrder: ['creatures in', 'this zone depend', 'on organic material', 'falling from', 'the surface'],
  },
  {
    id: 'fb-7',
    title: 'Electricity',
    context: 'Electric charge is the physical property of matter that causes it to experience force.',
    targetSentence: 'Moving electrical charges generate magnetic fields around conductive wires.',
    endingPunctuation: '.',
    correctOrder: ['moving electrical', 'charges generate', 'magnetic fields', 'around', 'conductive wires'],
  },
  {
    id: 'fb-8',
    title: 'Plate Tectonics',
    context: 'The outer shell of Earth is divided into several rigid moving tectonic plates.',
    targetSentence: 'Their collisions generate intense earthquakes along volcanic mountain ranges.',
    endingPunctuation: '.',
    correctOrder: ['their collisions', 'generate intense', 'earthquakes along', 'volcanic', 'mountain ranges'],
  },
  {
    id: 'fb-9',
    title: 'Renewable Energy',
    context: 'Modern wind turbines generate clean electricity using aerodynamic propeller blades.',
    targetSentence: 'They provide power without producing greenhouse gas emissions.',
    endingPunctuation: '.',
    correctOrder: ['they provide', 'power without', 'producing greenhouse', 'gas', 'emissions'],
  },
  {
    id: 'fb-10',
    title: 'DNA and Genetics',
    context: 'Deoxyribonucleic acid carries the genetic instructions used in the growth of organisms.',
    targetSentence: 'Most DNA molecules consist of two biopolymer strands coiled around each other.',
    endingPunctuation: '.',
    correctOrder: ['most DNA molecules', 'consist of two', 'biopolymer strands', 'coiled around', 'each other'],
  },
  {
    id: 'fb-11',
    title: 'Antarctica',
    context: 'Antarctica is the southernmost continent and contains the geographic South Pole.',
    targetSentence: 'It is the coldest driest and windiest continent on Earth.',
    endingPunctuation: '.',
    correctOrder: ['it is the', 'coldest driest', 'and windiest', 'continent on', 'earth'],
  },
  {
    id: 'fb-12',
    title: 'Microscopes',
    context: 'Optical microscopes use visible light and lenses to magnify tiny biological specimens.',
    targetSentence: 'They allow scientists to observe cellular structures with great detail.',
    endingPunctuation: '.',
    correctOrder: ['they allow', 'scientists to', 'observe cellular', 'structures with', 'great detail'],
  },
]

/**
 * Fetches dynamic sentence questions from Simple English Wikipedia.
 * Falls back seamlessly to curated academic questions if network fails.
 */
export async function fetchBuildSentenceBatch(
  targetCount = 10,
  signal?: AbortSignal
): Promise<SentenceQuestion[]> {
  const questions: SentenceQuestion[] = []
  const maxAttempts = 15
  let attempts = 0

  while (questions.length < targetCount && attempts < maxAttempts) {
    if (signal?.aborted) throw new Error('Sentence fetch aborted')
    attempts++

    try {
      const res = await fetch('https://simple.wikipedia.org/api/rest_v1/page/random/summary', {
        headers: { Accept: 'application/json' },
        signal,
      })

      if (!res.ok) continue
      const data = await res.json()
      if (!data.extract || typeof data.extract !== 'string') continue

      const wikiUrl = data.content_urls?.desktop?.page
      const extracted = extractSentencePairsFromText(data.extract, data.title || 'Wikipedia', wikiUrl)

      for (const q of extracted) {
        if (!questions.some(existing => existing.targetSentence === q.targetSentence)) {
          questions.push(q)
          if (questions.length >= targetCount) break
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err
      }
      // Continue to next attempt or fallback
    }
  }

  // If Wikipedia didn't yield enough within attempts, supplement from offline academic bank
  if (questions.length < targetCount) {
    const shuffledFallbacks = shuffleChunks([...FALLBACK_SENTENCE_QUESTIONS])

    for (const fb of shuffledFallbacks) {
      if (!questions.some(q => q.targetSentence === fb.targetSentence)) {
        const originalChunks = [...fb.correctOrder]
        const shuffled = shuffleChunks([...originalChunks])
        const chunks: SentenceChunk[] = shuffled.map((text, idx) => ({
          id: `${fb.id}-chunk-${idx}`,
          text,
        }))

        questions.push({
          ...fb,
          chunks,
        })

        if (questions.length >= targetCount) break
      }
    }
  }

  return questions.slice(0, targetCount)
}
