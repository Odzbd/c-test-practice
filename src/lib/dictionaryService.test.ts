import { describe, it, expect, vi } from 'vitest'
import {
  estimateCEFRLevel,
  getBaseStem,
  arpaToIPA,
  fetchWordDefinition,
} from './dictionaryService'

describe('dictionaryService - CEFR Classification & Lemmatization', () => {
  it('correctly stems inflected words (lets -> let, orbits -> orbit, studied -> study)', () => {
    expect(getBaseStem('lets')).toBe('let')
    expect(getBaseStem('orbits')).toBe('orbit')
    expect(getBaseStem('studied')).toBe('studi')
    expect(getBaseStem('particles')).toBe('particle')
  })

  it('accurately converts CMU ARPAbet strings to authentic IPA', () => {
    expect(arpaToIPA('IH1 Z')).toBe('/ɪz/')
    expect(arpaToIPA('D ER0 EH1 K T S')).toBe('/dərˈɛkts/')
    expect(arpaToIPA('D UW1')).toBe('/duː/')
    expect(arpaToIPA('W EH1 N')).toBe('/wɛn/')
  })

  it('classifies CEFR difficulty levels accurately', () => {
    expect(estimateCEFRLevel('the').level).toBe('A1')
    expect(estimateCEFRLevel('system').level).toBe('A1')
    expect(estimateCEFRLevel('simple').level).toBe('A2')
    expect(estimateCEFRLevel('atmosphere').level).toBe('B2')
    expect(estimateCEFRLevel('photosynthesis').level).toBe('C1')
  })
})

describe('dictionaryService - Datamuse & Built-in Lexicon Integration', () => {
  it('resolves core function words (is, directs, do, in) with accurate IPA phonetics', async () => {
    const isEntry = await fetchWordDefinition('is')
    expect(isEntry.word).toBe('is')
    expect(isEntry.phonetic).toBe('/ɪz/')
    expect(isEntry.meanings[0].pos).toBe('v.')

    const directsEntry = await fetchWordDefinition('directs')
    expect(directsEntry.word).toBe('directs')
    expect(directsEntry.phonetic).toBe('/dərˈɛkts/')
    expect(directsEntry.meanings[0].pos).toBe('v.')

    const doEntry = await fetchWordDefinition('do')
    expect(doEntry.word).toBe('do')
    expect(doEntry.phonetic).toBe('/duː/')
    expect(doEntry.meanings[0].pos).toBe('v.')

    const inEntry = await fetchWordDefinition('in')
    expect(inEntry.word).toBe('in')
    expect(inEntry.phonetic).toBe('/ɪn/')
    expect(inEntry.meanings[0].pos).toBe('prep.')
  })

  it('fetches and formats Datamuse API response with POS, ARPAbet IPA, and synonyms', async () => {
    const mockDefResponse = [
      {
        word: 'velocity',
        tags: ['pron:V AH0 L AA1 S AH0 T IY0'],
        defs: ['n\tThe speed of an object in a given direction.'],
      },
    ]
    const mockSynResponse = [
      { word: 'speed' },
      { word: 'pace' },
      { word: 'swiftness' },
    ]

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('rel_syn')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSynResponse,
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockDefResponse,
      })
    }) as any

    const entry = await fetchWordDefinition('velocity')

    expect(entry.word).toBe('velocity')
    expect(entry.meanings[0].pos).toBe('n.')
    expect(entry.phonetic).toBe('/vəˈlɑːsəti/')
    expect(entry.definition).toContain('speed of an object')
    expect(entry.synonyms).toContain('speed')

    // Cached retrieval should return immediately without refetching
    const fetchCountBefore = (globalThis.fetch as any).mock.calls.length
    const cachedEntry = await fetchWordDefinition('velocity')
    expect((globalThis.fetch as any).mock.calls.length).toBe(fetchCountBefore)
    expect(cachedEntry.word).toBe('velocity')

    globalThis.fetch = originalFetch
  })

  it('provides graceful fallback when network error occurs', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network disconnected')) as any

    const fallback = await fetchWordDefinition('unknownrareword')

    expect(fallback.word).toBe('unknownrareword')
    expect(fallback.phonetic).toBe('/unknownrareword/')
    expect(fallback.definition).toBeTruthy()

    globalThis.fetch = originalFetch
  })

  it('safely handles prototype property names without prototype pollution or crashes', async () => {
    // arpaToIPA on prototype property name
    expect(arpaToIPA('toString')).toBe('/tostring/')
    expect(arpaToIPA('valueOf')).toBe('/valueof/')
    expect(arpaToIPA('constructor')).toBe('/constructor/')

    // fetchWordDefinition on prototype property names
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as any

    const entry = await fetchWordDefinition('toString')
    expect(entry.word).toBe('tostring')
    expect(typeof entry.definition).toBe('string')

    globalThis.fetch = originalFetch
  })
})
