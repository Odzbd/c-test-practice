/**
 * Sentence Builder Engine (TOEFL-Style Writing: Build a Sentence)
 *
 * Sourced dynamically from Simple English Wikipedia discourse pairs:
 * - Sentence 1: Context / Prompt sentence (establishes discourse setting)
 * - Sentence 2: Target Sentence (broken into 4–7 grammatical chunks)
 * - Chunks are shuffled to form a syntax puzzle
 * - Machine-scored binary: 1 point for exact syntactic match, 0 otherwise
 */

import { sanitizeText, splitSentences, ABBREVIATIONS } from './cTestParser'

export interface SentenceChunk {
  id: string
  text: string
}

export interface SentenceQuestion {
  id: string
  title: string
  context: string
  targetSentence: string
  chunks: SentenceChunk[]
  correctOrder: string[]
  wikiUrl?: string
}

export interface SentencePairValidation {
  valid: boolean
  reason?: string
}

const PREPOSITIONS_AND_CONJUNCTIONS = new Set([
  'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to',
  'from', 'up', 'down', 'over', 'under', 'again', 'further', 'then', 'once',
  'and', 'but', 'or', 'nor', 'so', 'yet', 'because', 'although', 'while',
  'since', 'unless', 'until', 'where', 'when', 'which', 'that', 'who', 'whom',
])

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
 * Intelligently chunks a target sentence into 4–7 coherent phrase/word chunks.
 */
export function chunkSentence(sentence: string): string[] {
  const words = sentence.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  if (words.length <= 4) return words

  const chunks: string[] = []
  let currentChunk: string[] = []

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const cleanLower = word.toLowerCase().replace(/^[("']|[)"'.,!?]+$/g, '')

    // Check natural boundary points (prepositions, conjunctions, punctuation)
    const isBoundary =
      currentChunk.length >= 2 &&
      (PREPOSITIONS_AND_CONJUNCTIONS.has(cleanLower) || /[,;:]$/.test(words[i - 1]))

    // If chunk is getting long (3 words) or we hit a natural boundary, push it
    if ((isBoundary || currentChunk.length >= 3) && i < words.length - 1) {
      chunks.push(currentChunk.join(' '))
      currentChunk = [word]
    } else {
      currentChunk.push(word)
    }
  }

  if (currentChunk.length > 0) {
    // If last chunk is just 1 word and previous chunk exists, consider merging if previous isn't too long
    if (currentChunk.length === 1 && chunks.length > 0 && chunks[chunks.length - 1].split(' ').length <= 2) {
      const prev = chunks.pop()!
      chunks.push(`${prev} ${currentChunk[0]}`)
    } else {
      chunks.push(currentChunk.join(' '))
    }
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
  const originalChunks = chunkSentence(target)
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
  correctOrder: string[],
  targetSentence: string
): { isCorrect: boolean; normalizedUser: string; normalizedTarget: string } {
  const userText = userChunks.join(' ').trim()
  const targetText = targetSentence.trim()

  const normalizedUser = userText.replace(/\s+/g, ' ').toLowerCase()
  const normalizedTarget = targetText.replace(/\s+/g, ' ').toLowerCase()

  const isCorrect = normalizedUser === normalizedTarget
  return {
    isCorrect,
    normalizedUser,
    normalizedTarget,
  }
}

// Fallback high-quality academic question bank for instant offline access or network issues
export const FALLBACK_SENTENCE_QUESTIONS: Omit<SentenceQuestion, 'chunks'>[] = [
  {
    id: 'fb-1',
    title: 'Photosynthesis',
    context: 'Plants absorb sunlight through chlorophyll pigments inside their green leaves.',
    targetSentence: 'This light energy is used to convert water and carbon dioxide into sugars.',
    correctOrder: ['This light energy', 'is used to convert', 'water and carbon dioxide', 'into sugars.'],
  },
  {
    id: 'fb-2',
    title: 'Solar System',
    context: 'The Solar System formed approximately 4.6 billion years ago from a giant molecular cloud.',
    targetSentence: 'Most of the remaining mass collapsed into planets and other orbiting bodies.',
    correctOrder: ['Most of', 'the remaining mass', 'collapsed into planets', 'and other orbiting bodies.'],
  },
  {
    id: 'fb-3',
    title: 'Atmosphere',
    context: 'Earth has a thick layer of gases held in place by gravitational force.',
    targetSentence: 'It protects living organisms by absorbing ultraviolet solar radiation.',
    correctOrder: ['It protects', 'living organisms', 'by absorbing', 'ultraviolet solar radiation.'],
  },
  {
    id: 'fb-4',
    title: 'Ecosystems',
    context: 'Tropical rainforests receive high amounts of rainfall throughout the entire year.',
    targetSentence: 'They contain a high percentage of all known plant and animal species.',
    correctOrder: ['They contain', 'a high percentage of', 'all known plant', 'and animal species.'],
  },
  {
    id: 'fb-5',
    title: 'Gravity',
    context: 'Gravity is a fundamental interaction that causes mutual attraction between all things with mass.',
    targetSentence: 'It gives weight to physical objects on Earth and guides ocean tides.',
    correctOrder: ['It gives weight', 'to physical objects', 'on Earth and', 'guides ocean tides.'],
  },
  {
    id: 'fb-6',
    title: 'Deep Ocean',
    context: 'The oceanic abyss receives virtually no sunlight even during the brightest daytime.',
    targetSentence: 'Creatures in this zone depend on organic material falling from the surface.',
    correctOrder: ['Creatures in this zone', 'depend on organic material', 'falling from', 'the surface.'],
  },
  {
    id: 'fb-7',
    title: 'Electricity',
    context: 'Electric charge is the physical property of matter that causes it to experience force.',
    targetSentence: 'Moving electrical charges generate magnetic fields around conductive wires.',
    correctOrder: ['Moving electrical charges', 'generate magnetic fields', 'around conductive wires.'],
  },
  {
    id: 'fb-8',
    title: 'Plate Tectonics',
    context: 'The outer shell of Earth is divided into several rigid moving tectonic plates.',
    targetSentence: 'Their collisions generate intense earthquakes along volcanic mountain ranges.',
    correctOrder: ['Their collisions generate', 'intense earthquakes along', 'volcanic mountain ranges.'],
  },
  {
    id: 'fb-9',
    title: 'Renewable Energy',
    context: 'Modern wind turbines generate clean electricity using aerodynamic propeller blades.',
    targetSentence: 'They provide power without producing greenhouse gas emissions.',
    correctOrder: ['They provide power', 'without producing', 'greenhouse gas emissions.'],
  },
  {
    id: 'fb-10',
    title: 'DNA and Genetics',
    context: 'Deoxyribonucleic acid carries the genetic instructions used in the growth of organisms.',
    targetSentence: 'Most DNA molecules consist of two biopolymer strands coiled around each other.',
    correctOrder: ['Most DNA molecules', 'consist of two', 'biopolymer strands', 'coiled around each other.'],
  },
  {
    id: 'fb-11',
    title: 'Antarctica',
    context: 'Antarctica is the southernmost continent and contains the geographic South Pole.',
    targetSentence: 'It is the coldest, driest, and windiest continent on Earth.',
    correctOrder: ['It is the coldest,', 'driest, and windiest', 'continent on Earth.'],
  },
  {
    id: 'fb-12',
    title: 'Microscopes',
    context: 'Optical microscopes use visible light and lenses to magnify tiny biological specimens.',
    targetSentence: 'They allow scientists to observe cellular structures with great detail.',
    correctOrder: ['They allow scientists', 'to observe cellular structures', 'with great detail.'],
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
    const needed = targetCount - questions.length
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
