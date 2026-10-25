import { Detection } from '../types';

export interface SynonymCluster {
  canonical: string;
  synonyms: string[];
  description?: string;
}

export const SYNONYM_CLUSTERS: SynonymCluster[] = [
  {
    canonical: 'cell phone',
    synonyms: [
      'cell phone',
      'cellphone',
      'cell-phone',
      'mobile phone',
      'mobilephone',
      'mobile',
      'smartphone',
      'smart phone',
      'phone',
      'handphone',
      'cellular phone',
      'cellular',
      'telephone',
      'iphone',
      'android',
      'handset',
      'smart device',
    ],
    description: 'Smartphones, mobile phones, and cellular handsets',
  },
  {
    canonical: 'glasses',
    synonyms: [
      'glasses',
      'eyeglasses',
      'eye glasses',
      'spectacles',
      'specs',
      'reading glasses',
      'sunglasses',
      'sun glasses',
      'eyewear',
      'shades',
      'goggles',
      'frames',
    ],
    description: 'Eyeglasses, spectacles, and sunglasses',
  },
  {
    canonical: 'door',
    synonyms: [
      'door',
      'closed door',
      'open door',
      'doorway',
      'room door',
      'wooden door',
      'glass door',
      'entrance',
      'exit door',
      'exit',
      'gate',
      'entryway',
    ],
    description: 'Doors, doorways, and room entryways',
  },
  {
    canonical: 'door handle',
    synonyms: [
      'door handle',
      'door knob',
      'doorknob',
      'handle',
      'door latch',
      'latch',
      'lock',
      'door lock',
      'lever',
      'door lever',
      'deadbolt',
    ],
    description: 'Door handles, latches, and doorknobs',
  },
  {
    canonical: 'ladder',
    synonyms: [
      'ladder',
      'step ladder',
      'stepladder',
      'folding ladder',
      'aluminium ladder',
      'aluminum ladder',
      'step stool',
      'extension ladder',
      'steps',
    ],
    description: 'Ladders, step ladders, and folding aluminium ladders',
  },
  {
    canonical: 'umbrella',
    synonyms: [
      'umbrella',
      'parasol',
      'rain umbrella',
      'sun umbrella',
    ],
    description: 'Umbrellas, rain parasols, and sun umbrellas',
  },
  {
    canonical: 'window',
    synonyms: [
      'window',
      'grilled window',
      'window grill',
      'glass window',
      'window pane',
      'ventilator',
      'curtain',
      'window blinds',
      'blinds',
      'window frame',
    ],
    description: 'Windows, glass panes, grills, and blinds',
  },
  {
    canonical: 'ceiling fan',
    synonyms: [
      'ceiling fan',
      'fan',
      'table fan',
      'overhead fan',
      'standing fan',
      'exhaust fan',
      'pedestal fan',
      'room fan',
      'electric fan',
    ],
    description: 'Ceiling fans, table fans, and ventilation fans',
  },
  {
    canonical: 'light',
    synonyms: [
      'light',
      'tube light',
      'tubelight',
      'bulb',
      'light bulb',
      'ceiling light',
      'lamp',
      'table lamp',
      'lighting fixture',
      'led light',
      'fluorescent light',
      'tube',
      'illumination',
      'chandelier',
    ],
    description: 'Ceiling lights, tube lights, and lamps',
  },
  {
    canonical: 'switchboard',
    synonyms: [
      'switchboard',
      'switch board',
      'switch',
      'light switch',
      'wall switch',
      'socket',
      'power socket',
      'plug',
      'electrical outlet',
      'power outlet',
      'wall socket',
      'board',
    ],
    description: 'Wall switches, switchboards, and power outlets',
  },
  {
    canonical: 'bottle',
    synonyms: [
      'bottle',
      'water bottle',
      'waterbottle',
      'flask',
      'thermos',
      'drink bottle',
      'sipper',
      'mineral water',
      'beverage bottle',
    ],
    description: 'Water bottles, flasks, and drink containers',
  },
  {
    canonical: 'cup',
    synonyms: [
      'cup',
      'mug',
      'coffee cup',
      'coffee mug',
      'tea cup',
      'teacup',
      'tumbler',
      'glass',
      'drinking glass',
      'tea mug',
    ],
    description: 'Cups, mugs, and drinking tumblers',
  },
  {
    canonical: 'snack packet',
    synonyms: [
      'snack packet',
      'cookie packet',
      'biscuit packet',
      'packet',
      'chips packet',
      'cookies',
      'biscuits',
      'snack',
      'food packet',
      'wrapper',
      'cookie',
      'snack bag',
      'chips',
    ],
    description: 'Packets of biscuits, cookies, chips, or food',
  },
  {
    canonical: 'laptop',
    synonyms: [
      'laptop',
      'notebook',
      'computer',
      'pc',
      'macbook',
      'chromebook',
      'laptop computer',
      'desktop',
    ],
    description: 'Laptops, notebooks, and computers',
  },
  {
    canonical: 'chair',
    synonyms: [
      'chair',
      'office chair',
      'armchair',
      'desk chair',
      'seat',
      'stool',
      'bench',
      'wheelchair',
    ],
    description: 'Chairs, armchairs, and seating',
  },
  {
    canonical: 'dining table',
    synonyms: [
      'dining table',
      'table',
      'desk',
      'study desk',
      'office desk',
      'work table',
      'counter',
      'workbench',
      'workspace',
      'side table',
    ],
    description: 'Desks, study tables, and dining tables',
  },
  {
    canonical: 'person',
    synonyms: [
      'person',
      'human',
      'man',
      'woman',
      'girl',
      'boy',
      'guy',
      'lady',
      'individual',
      'student',
      'teacher',
      'child',
      'kid',
      'face',
      'people',
    ],
    description: 'People, individuals, gestures, and activities',
  },
  {
    canonical: 'backpack',
    synonyms: [
      'backpack',
      'bag',
      'school bag',
      'knapsack',
      'rucksack',
      'book bag',
      'bookbag',
      'pack',
      'haversack',
    ],
    description: 'Backpacks and school bags',
  },
  {
    canonical: 'handbag',
    synonyms: [
      'handbag',
      'purse',
      'tote',
      'tote bag',
      'shoulder bag',
      'clutch',
    ],
    description: 'Handbags, purses, and totes',
  },
  {
    canonical: 'wallet',
    synonyms: [
      'wallet',
      'billfold',
      'cardholder',
      'card holder',
      'money clip',
    ],
    description: 'Wallets and cardholders',
  },
  {
    canonical: 'keys',
    synonyms: [
      'keys',
      'key',
      'car keys',
      'keychain',
      'house keys',
      'key ring',
      'key fob',
    ],
    description: 'Keys, keychains, and house/car keys',
  },
  {
    canonical: 'book',
    synonyms: [
      'book',
      'textbook',
      'notebook',
      'novel',
      'diary',
      'journal',
      'manual',
      'notepad',
      'binder',
    ],
    description: 'Books, notebooks, and reading materials',
  },
  {
    canonical: 'pen',
    synonyms: [
      'pen',
      'pencil',
      'marker',
      'ballpoint',
      'highlighter',
      'stylus',
      'writing pen',
    ],
    description: 'Pens, pencils, and markers',
  },
  {
    canonical: 'shoes',
    synonyms: [
      'shoes',
      'slippers',
      'sneakers',
      'sandals',
      'boots',
      'footwear',
      'flip flops',
      'heels',
      'shoe',
    ],
    description: 'Shoes, slippers, and footwear',
  },
  {
    canonical: 'clothes',
    synonyms: [
      'clothes',
      'clothing',
      'shirt',
      't-shirt',
      'tshirt',
      'dress',
      'pants',
      'trousers',
      'jeans',
      'jacket',
      'garment',
      'laundry',
      'sweater',
      'hoodie',
    ],
    description: 'Clothing, shirts, pants, and garments',
  },
  {
    canonical: 'tv',
    synonyms: [
      'tv',
      'television',
      'screen',
      'monitor',
      'display',
      'smart tv',
    ],
    description: 'TVs, televisions, and monitors',
  },
  {
    canonical: 'remote',
    synonyms: [
      'remote',
      'tv remote',
      'remote control',
      'controller',
      'clicker',
    ],
    description: 'Remote controls and controllers',
  },
  {
    canonical: 'clock',
    synonyms: [
      'clock',
      'wall clock',
      'watch',
      'wristwatch',
      'timepiece',
      'alarm clock',
    ],
    description: 'Clocks, watches, and timepieces',
  },
  {
    canonical: 'couch',
    synonyms: [
      'couch',
      'sofa',
      'settee',
      'loveseat',
      'lounge',
    ],
    description: 'Couches and sofas',
  },
  {
    canonical: 'bed',
    synonyms: [
      'bed',
      'cot',
      'mattress',
      'bunk bed',
    ],
    description: 'Beds and cots',
  },
  {
    canonical: 'sink',
    synonyms: [
      'sink',
      'washbasin',
      'basin',
      'kitchen sink',
      'bathroom sink',
      'wash basin',
      'tap',
      'faucet',
    ],
    description: 'Sinks, washbasins, and taps',
  },
  {
    canonical: 'trash can',
    synonyms: [
      'trash can',
      'dustbin',
      'garbage bin',
      'waste basket',
      'wastebasket',
      'rubbish bin',
      'bin',
      'trashcan',
    ],
    description: 'Trash cans, dustbins, and waste baskets',
  },
  {
    canonical: 'mirror',
    synonyms: [
      'mirror',
      'looking glass',
      'dressing mirror',
      'wall mirror',
    ],
    description: 'Mirrors and looking glasses',
  },
  {
    canonical: 'wall',
    synonyms: [
      'wall',
      'room wall',
      'partition',
    ],
    description: 'Walls and partitions',
  },
];

/**
 * Normalizes user queries by removing filler phrases, punctuation, and extraneous whitespace.
 */
export function cleanSearchQuery(query: string): string {
  if (!query) return '';
  let clean = query.trim().toLowerCase();
  
  // Remove voice/search filler phrases
  clean = clean.replace(/^(?:find|locate|search for|where is|look for|show me|detect)\s+/i, '');
  clean = clean.replace(/\b(?:my|the|a|an|any|please)\b/gi, ' ');
  
  // Replace hyphens and punctuation with spaces
  clean = clean.replace(/[-_]/g, ' ');
  clean = clean.replace(/[^\w\s]/g, '');
  
  // Condense whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  
  return clean;
}

/**
 * Finds the canonical cluster for a query string.
 */
export function findSynonymCluster(rawQuery: string): SynonymCluster | null {
  const clean = cleanSearchQuery(rawQuery);
  if (!clean) return null;

  // Direct match with canonical
  for (const cluster of SYNONYM_CLUSTERS) {
    if (cluster.canonical === clean) return cluster;
  }

  // Exact match within synonyms
  for (const cluster of SYNONYM_CLUSTERS) {
    if (cluster.synonyms.includes(clean)) return cluster;
  }

  // Handle pluralization (e.g., 'cellphones' -> 'cellphone', 'bottles' -> 'bottle')
  if (clean.endsWith('s') && !clean.endsWith('ss')) {
    const singular = clean.slice(0, -1);
    for (const cluster of SYNONYM_CLUSTERS) {
      if (cluster.canonical === singular || cluster.synonyms.includes(singular)) {
        return cluster;
      }
    }
  }

  // Substring or token overlap
  const queryTokens = clean.split(' ').filter(Boolean);
  for (const cluster of SYNONYM_CLUSTERS) {
    for (const syn of cluster.synonyms) {
      const synTokens = syn.split(' ');
      // If all query tokens are present in the synonym or vice versa
      if (queryTokens.every((t) => syn.includes(t)) || synTokens.every((t) => clean.includes(t))) {
        return cluster;
      }
    }
  }

  return null;
}

/**
 * Tests whether a detection's label or activity details match the target search query.
 * Leverages direct string match, token containment, cluster synonyms, and activity descriptions.
 */
export function isDetectionMatch(
  detection: Detection,
  rawQuery: string
): boolean {
  const cleanQuery = cleanSearchQuery(rawQuery);
  if (!cleanQuery) return false;

  const label = (detection.label || '').toLowerCase().trim();
  const cleanLabel = label.replace(/[-_]/g, ' ').replace(/[^\w\s]/g, '');
  const details = (detection.activityOrDetails || '').toLowerCase();

  // 1. Direct label containment
  if (cleanLabel.includes(cleanQuery) || cleanQuery.includes(cleanLabel)) {
    return true;
  }

  // 2. Direct details containment
  if (details.includes(cleanQuery)) {
    return true;
  }

  // 3. Cluster synonym resolution
  const queryCluster = findSynonymCluster(cleanQuery);
  const labelCluster = findSynonymCluster(cleanLabel);

  if (queryCluster) {
    // Check if label belongs to query cluster
    if (queryCluster.synonyms.some((syn) => cleanLabel.includes(syn) || syn.includes(cleanLabel))) {
      return true;
    }
    // Check if details mention any synonym in the query cluster
    if (queryCluster.synonyms.some((syn) => details.includes(syn))) {
      return true;
    }
  }

  if (labelCluster && queryCluster && labelCluster.canonical === queryCluster.canonical) {
    return true;
  }

  // 4. Token overlap (e.g. "cell phone" matches "cellphone", "mobile phone" matches "mobile")
  const qTokens = cleanQuery.split(' ').filter(Boolean);
  const lTokens = cleanLabel.split(' ').filter(Boolean);
  if (qTokens.length > 0 && lTokens.length > 0) {
    const overlap = qTokens.filter((qt) => lTokens.some((lt) => lt.includes(qt) || qt.includes(lt)));
    if (overlap.length >= Math.min(qTokens.length, lTokens.length)) {
      return true;
    }
  }

  return false;
}

export interface MatchFilterResult {
  matches: Detection[];
  subThresholdCandidates: Detection[];
  allMatchingCandidates: Detection[];
  hasSubThresholdCandidates: boolean;
}

/**
 * Filters detections against a search query and dynamically splits them into
 * qualifying matches and sub-threshold candidates, ensuring valid detections are never silently discarded.
 */
export function filterDetectionsWithSensitivity(
  allDetections: Detection[],
  rawQuery: string,
  minConfidence: number
): MatchFilterResult {
  const allMatchingCandidates: Detection[] = [];
  const matches: Detection[] = [];
  const subThresholdCandidates: Detection[] = [];

  for (const det of allDetections) {
    if (isDetectionMatch(det, rawQuery)) {
      allMatchingCandidates.push(det);
      if (det.confidence >= minConfidence) {
        matches.push(det);
      } else {
        subThresholdCandidates.push(det);
      }
    }
  }

  // Sort matches by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);
  subThresholdCandidates.sort((a, b) => b.confidence - a.confidence);
  allMatchingCandidates.sort((a, b) => b.confidence - a.confidence);

  return {
    matches,
    subThresholdCandidates,
    allMatchingCandidates,
    hasSubThresholdCandidates: subThresholdCandidates.length > 0,
  };
}
