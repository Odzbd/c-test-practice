/**
 * Curated In-Memory Academic English C-Test Fallback Passages
 * 100% Serverless, Zero-Network, Zero-Tracking certified reading passages.
 * Used when offline, during network latency, or if Wikipedia returns short stubs.
 */

export interface FallbackArticle {
  title: string
  pageUrl?: string
  extract: string
}

export const FALLBACK_PASSAGES: FallbackArticle[] = [
  {
    title: 'Solar System',
    pageUrl: 'https://simple.wikipedia.org/wiki/Solar_System',
    extract:
      'The solar system consists of the Sun and the astronomical objects bound to it by gravity. ' +
      'Of the planets that orbit the Sun directly, the largest four are the giant planets, being substantially more massive than the terrestrial planets. ' +
      'The two largest planets, Jupiter and Saturn, are gas giants, being composed mainly of hydrogen and helium. ' +
      'The two outermost planets, Uranus and Neptune, are ice giants, being composed mostly of volatile substances.',
  },
  {
    title: 'Photosynthesis',
    pageUrl: 'https://simple.wikipedia.org/wiki/Photosynthesis',
    extract:
      'Photosynthesis is a process used by plants and other organisms to convert light energy into chemical energy. ' +
      'This chemical energy is stored in carbohydrate molecules, such as sugars and starches, which are synthesized from carbon dioxide and water. ' +
      'Most plants, algae, and cyanobacteria perform photosynthesis to produce organic compounds and oxygen. ' +
      'Photosynthesis is largely responsible for producing and maintaining the oxygen content of the Earth atmosphere.',
  },
  {
    title: 'Great Barrier Reef',
    pageUrl: 'https://simple.wikipedia.org/wiki/Great_Barrier_Reef',
    extract:
      'The Great Barrier Reef is the world largest coral reef system composed of over three thousand individual reefs. ' +
      'The reef is located in the Coral Sea, off the coast of Queensland, Australia, covering a vast maritime area. ' +
      'A large part of the reef is protected by the marine park, which helps to limit the impact of human environmental pressures. ' +
      'Climate change and rising ocean temperatures represent significant challenges to the long-term survival of vibrant marine ecosystems.',
  },
  {
    title: 'Renewable Energy',
    pageUrl: 'https://simple.wikipedia.org/wiki/Renewable_energy',
    extract:
      'Renewable energy is energy that is collected from renewable resources that are naturally replenished on a human timescale. ' +
      'It includes sources such as sunlight, wind, rain, tides, waves, and geothermal heat from deep subterranean layers. ' +
      'Renewable energy often provides energy in four important areas: electricity generation, air and water heating, transportation, and rural energy services. ' +
      'Rapid technological improvements have significantly decreased the cost of solar panels and modern wind turbines worldwide.',
  },
  {
    title: 'Tectonic Plates',
    pageUrl: 'https://simple.wikipedia.org/wiki/Plate_tectonics',
    extract:
      'Plate tectonics is a scientific theory that describes the large-scale motions of seven large plates forming the Earth lithosphere. ' +
      'Where plates meet, their relative motion determines the type of boundary: convergent, divergent, or transform. ' +
      'Earthquakes, volcanic activity, mountain building, and oceanic trench formation occur along these dynamic tectonic boundaries. ' +
      'The movement of tectonic plates typically ranges from one to ten centimeters per calendar year.',
  },
  {
    title: 'Honeybee Communication',
    pageUrl: 'https://simple.wikipedia.org/wiki/Honey_bee',
    extract:
      'Honeybees are social flying insects known for their construction of perennial colonial nests from wax. ' +
      'Foraging bees communicate information about the direction and distance to resource patches through intricate waggle dances. ' +
      'Environmental variables such as solar position, olfactory cues, and landscape memory guide worker bees during long navigation flights. ' +
      'Healthy colonies maintain precise temperature and humidity balances inside the hive throughout cold winter seasons.',
  },
  {
    title: 'Hubble Space Telescope',
    pageUrl: 'https://simple.wikipedia.org/wiki/Hubble_Space_Telescope',
    extract:
      'The Hubble Space Telescope is a large space telescope that was launched into low Earth orbit in 1990. ' +
      'Hubble position outside the distortion of Earth atmosphere allows it to take extremely sharp images with almost no background light. ' +
      'Many Hubble observations have led to breakthroughs in astrophysics, such as determining the rate of expansion of the universe. ' +
      'Astronomers from all over the world compete for observing time with this celebrated scientific instrument.',
  },
  {
    title: 'Glaciers',
    pageUrl: 'https://simple.wikipedia.org/wiki/Glacier',
    extract:
      'A glacier is a persistent body of dense ice that is constantly moving under its own gravity. ' +
      'A glacier forms where the accumulation of snow exceeds its ablation over many years, often centuries. ' +
      'Glaciers slowly deform and flow due to internal stresses caused by their enormous weight, creating crevasses and moraines. ' +
      'Glacial ice is the largest reservoir of fresh water on Earth, holding valuable climate history within deep ancient layers.',
  },
]
