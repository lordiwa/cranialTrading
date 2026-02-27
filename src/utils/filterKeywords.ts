// Shared keyword/filter constants used by AdvancedFilterModal (both Scryfall search and collection filter)

interface KeywordOption {
  value: string
  label: string
}

// ============ 1. COMBAT ABILITIES (ordered by frequency) ============
export const combatAbilities: KeywordOption[] = [
  // Tier 1
  { value: 'flying', label: 'Flying' },
  { value: 'trample', label: 'Trample' },
  { value: 'deathtouch', label: 'Deathtouch' },
  { value: 'haste', label: 'Haste' },
  { value: 'lifelink', label: 'Lifelink' },
  { value: 'first strike', label: 'First Strike' },
  // Tier 2
  { value: 'double strike', label: 'Double Strike' },
  { value: 'hexproof', label: 'Hexproof' },
  { value: 'flash', label: 'Flash' },
  { value: 'vigilance', label: 'Vigilance' },
  { value: 'menace', label: 'Menace' },
  { value: 'reach', label: 'Reach' },
  { value: 'ward', label: 'Ward' },
  // Tier 3
  { value: 'indestructible', label: 'Indestructible' },
  { value: 'defender', label: 'Defender' },
  { value: 'protection', label: 'Protection' },
  { value: 'prowess', label: 'Prowess' },
  { value: 'shroud', label: 'Shroud' },
]

// ============ 2. COMMON EFFECTS (subcategories) ============
export const commonEffects = {
  removal: [
    { value: 'destroy', label: 'Destroy' },
    { value: 'exile', label: 'Exile' },
    { value: 'sacrifice', label: 'Sacrifice' },
    { value: 'counter', label: 'Counter' },
    { value: 'return to hand', label: 'Bounce' },
    { value: 'fight', label: 'Fight' },
  ],
  cardAdvantage: [
    { value: 'draw', label: 'Draw' },
    { value: 'scry', label: 'Scry' },
    { value: 'surveil', label: 'Surveil' },
    { value: 'mill', label: 'Mill' },
    { value: 'search your library', label: 'Tutor' },
    { value: 'explore', label: 'Explore' },
    { value: 'discard', label: 'Discard' },
  ],
  tokens: [
    { value: 'treasure token', label: 'Treasure' },
    { value: 'food token', label: 'Food' },
    { value: 'clue token', label: 'Clue' },
    { value: 'blood token', label: 'Blood' },
    { value: 'map token', label: 'Map' },
    { value: 'powerstone token', label: 'Powerstone' },
    { value: 'create a token', label: 'Create Token' },
  ],
  counters: [
    { value: 'proliferate', label: 'Proliferate' },
    { value: '+1/+1 counter', label: '+1/+1' },
    { value: '-1/-1 counter', label: '-1/-1' },
    { value: 'amass', label: 'Amass' },
    { value: 'bolster', label: 'Bolster' },
  ],
  control: [
    { value: 'gain control', label: 'Steal' },
    { value: 'goad', label: 'Goad' },
    { value: 'detain', label: 'Detain' },
    { value: 'tap', label: 'Tap' },
    { value: 'untap', label: 'Untap' },
  ],
}

export const allCommonEffects: KeywordOption[] = [
  ...commonEffects.removal,
  ...commonEffects.cardAdvantage,
  ...commonEffects.tokens,
  ...commonEffects.counters,
  ...commonEffects.control,
]

// ============ 3. TRIGGERS ============
export const triggerKeywords: KeywordOption[] = [
  { value: 'enters the battlefield', label: 'ETB' },
  { value: 'dies', label: 'Dies' },
  { value: 'whenever ~ attacks', label: 'Attack' },
  { value: 'deals combat damage', label: 'Combat Damage' },
  { value: 'when you cast', label: 'Cast' },
  { value: 'whenever you sacrifice', label: 'Sacrifice' },
  { value: 'whenever you gain life', label: 'Lifegain' },
  { value: 'whenever a creature dies', label: 'Creature Dies' },
  { value: 'beginning of your upkeep', label: 'Upkeep' },
  { value: 'beginning of your end step', label: 'End Step' },
  { value: 'leaves the battlefield', label: 'LTB' },
]

// ============ 4. SET MECHANICS ============
export const setMechanics = {
  meta: [
    { value: 'cascade', label: 'Cascade' },
    { value: 'delve', label: 'Delve' },
    { value: 'affinity', label: 'Affinity' },
    { value: 'energy', label: 'Energy' },
    { value: 'convoke', label: 'Convoke' },
    { value: 'storm', label: 'Storm' },
    { value: 'infect', label: 'Infect' },
    { value: 'dredge', label: 'Dredge' },
  ],
  popular: [
    { value: 'flashback', label: 'Flashback' },
    { value: 'cycling', label: 'Cycling' },
    { value: 'kicker', label: 'Kicker' },
    { value: 'evoke', label: 'Evoke' },
    { value: 'unearth', label: 'Unearth' },
    { value: 'madness', label: 'Madness' },
    { value: 'suspend', label: 'Suspend' },
    { value: 'escape', label: 'Escape' },
    { value: 'ninjutsu', label: 'Ninjutsu' },
    { value: 'morph', label: 'Morph' },
  ],
  recent: [
    { value: 'discover', label: 'Discover' },
    { value: 'plot', label: 'Plot' },
    { value: 'offspring', label: 'Offspring' },
    { value: 'disguise', label: 'Disguise' },
    { value: 'bargain', label: 'Bargain' },
    { value: 'impending', label: 'Impending' },
    { value: 'toxic', label: 'Toxic' },
    { value: 'connive', label: 'Connive' },
    { value: 'blitz', label: 'Blitz' },
    { value: 'prototype', label: 'Prototype' },
  ],
  other: [
    { value: 'adapt', label: 'Adapt' },
    { value: 'alliance', label: 'Alliance' },
    { value: 'backup', label: 'Backup' },
    { value: 'casualty', label: 'Casualty' },
    { value: 'channel', label: 'Channel' },
    { value: 'cloak', label: 'Cloak' },
    { value: 'corrupted', label: 'Corrupted' },
    { value: 'domain', label: 'Domain' },
    { value: 'emerge', label: 'Emerge' },
    { value: 'evolve', label: 'Evolve' },
    { value: 'exalted', label: 'Exalted' },
    { value: 'exploit', label: 'Exploit' },
    { value: 'extort', label: 'Extort' },
    { value: 'fabricate', label: 'Fabricate' },
    { value: 'foretell', label: 'Foretell' },
    { value: 'incubate', label: 'Incubate' },
    { value: 'landfall', label: 'Landfall' },
    { value: 'mentor', label: 'Mentor' },
    { value: 'modified', label: 'Modified' },
    { value: 'monstrosity', label: 'Monstrosity' },
    { value: 'mutate', label: 'Mutate' },
    { value: 'persist', label: 'Persist' },
    { value: 'raid', label: 'Raid' },
    { value: 'reconfigure', label: 'Reconfigure' },
    { value: 'revolt', label: 'Revolt' },
    { value: 'riot', label: 'Riot' },
    { value: 'saddle', label: 'Saddle' },
    { value: 'spectacle', label: 'Spectacle' },
    { value: 'spree', label: 'Spree' },
    { value: 'survival', label: 'Survival' },
    { value: 'training', label: 'Training' },
    { value: 'undying', label: 'Undying' },
    { value: 'valiant', label: 'Valiant' },
  ],
}

export const allSetMechanics: KeywordOption[] = [
  ...setMechanics.meta,
  ...setMechanics.popular,
  ...setMechanics.recent,
  ...setMechanics.other,
]

// ============ SPECIAL TYPES ============
export const specialTypes: KeywordOption[] = [
  { value: 'legendary', label: 'Legendary' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'aura', label: 'Aura' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'saga', label: 'Saga' },
  { value: 'modal double-faced', label: 'MDFC' },
  { value: 'transform', label: 'DFC' },
  { value: 'snow', label: 'Snow' },
]

// ============ FORMAT OPTIONS ============
export const formatOptions: KeywordOption[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'modern', label: 'Modern' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'commander', label: 'Commander' },
  { value: 'pioneer', label: 'Pioneer' },
]

// All keywords flat list (for search)
const allKeywords: KeywordOption[] = [
  ...combatAbilities,
  ...allCommonEffects,
  ...triggerKeywords,
  ...allSetMechanics,
  ...specialTypes,
]

export const getKeywordLabel = (value: string): string => {
  return allKeywords.find(kw => kw.value === value)?.label || value
}
