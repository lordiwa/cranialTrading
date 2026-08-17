import { findIncoherent, type CoherenceView } from '../../../e2e/helpers/coherence'

/**
 * TASK-240 round 3, MEDIUM-2. The E2E lock that uses findIncoherent can only
 * exercise its MERGE branch on a run where the app actually merged the added
 * card into an existing row — measured over several runs, most runs create a
 * new document instead, and the branch that matters most (document survived,
 * entry disagrees) never fires. These cases pin every branch deterministically.
 */
describe('findIncoherent (E2E teardown lock)', () => {
    const view = (
        quantities: Record<string, number>,
        indexQuantities: Record<string, number>,
        duplicateIndexEntryIds: string[] = [],
    ): CoherenceView => ({ quantities, indexQuantities, duplicateIndexEntryIds })

    it('passes when document and card_index agree', () => {
        const before = view({ a: 1 }, { a: 1 })
        const after = view({ a: 1 }, { a: 1 })
        expect(findIncoherent(['a'], before, after)).toEqual([])
    })

    // THE MERGE BRANCH. This is the exact state a merged add left behind with
    // the round-2 teardown: the document was restored to 1, the card_index
    // entry kept the bumped 2, and every other lock was blind to it.
    it('reports doc/index quantity divergence on a surviving card', () => {
        const before = view({ a: 1 }, { a: 1 })
        const after = view({ a: 1 }, { a: 2 })
        expect(findIncoherent(['a'], before, after)).toEqual([
            'a: doc.quantity=1 but card_index q=2',
        ])
    })

    it('reports a phantom: document deleted but its index entry survives', () => {
        const before = view({ a: 1 }, { a: 1 })
        const after = view({}, { a: 1 })
        expect(findIncoherent(['a'], before, after)).toEqual([
            'a: document deleted but card_index entry survives with q=1',
        ])
    })

    it('passes a clean delete: document and entry both gone', () => {
        const before = view({ a: 1 }, { a: 1 })
        const after = view({}, {})
        expect(findIncoherent(['a'], before, after)).toEqual([])
    })

    it('reports an invisible card: entry vanished while the document survives', () => {
        const before = view({ a: 3 }, { a: 3 })
        const after = view({ a: 3 }, {})
        expect(findIncoherent(['a'], before, after)).toEqual([
            'a: card_index entry vanished (was q=3) while the document survives with quantity=3',
        ])
    })

    // TASK-234 leaves documents with no index entry legitimately; a card that
    // had none before and has none after is not this run's doing.
    it('passes a document that had no index entry before or after', () => {
        const before = view({ a: 1 }, {})
        const after = view({ a: 1 }, {})
        expect(findIncoherent(['a'], before, after)).toEqual([])
    })

    it('reports a NEWLY duplicated index entry instead of picking one of them', () => {
        const before = view({ a: 1 }, { a: 1 })
        const after = view({ a: 1 }, { a: 1 }, ['a'])
        expect(findIncoherent(['a'], before, after)).toEqual([
            'a: newly appears in MORE THAN ONE card_index entry — coherence for it cannot be decided',
        ])
    })

    // TASK-240 round 4, LOW. An id already duplicated in `before` is
    // pre-existing corruption, not the run's doing — and syncIndexQuantities
    // rewrites EVERY entry matching an id, so all of its copies really are
    // restored to the same q. Reddening on it failed the run for damage that
    // did not happen.
    it('passes an id that was ALREADY duplicated before the run', () => {
        const before = view({ a: 1 }, { a: 1 }, ['a'])
        const after = view({ a: 1 }, { a: 1 }, ['a'])
        expect(findIncoherent(['a'], before, after)).toEqual([])
    })

    it('still reports a quantity divergence on an already-duplicated id', () => {
        const before = view({ a: 1 }, { a: 1 }, ['a'])
        const after = view({ a: 1 }, { a: 2 }, ['a'])
        expect(findIncoherent(['a'], before, after)).toEqual([
            'a: doc.quantity=1 but card_index q=2',
        ])
    })

    it('ignores cards the run did not touch, however divergent they are', () => {
        const before = view({ a: 1, bystander: 1 }, { a: 1, bystander: 1 })
        const after = view({ a: 1, bystander: 1 }, { a: 1, bystander: 99 })
        expect(findIncoherent(['a'], before, after)).toEqual([])
    })

    it('reports every touched card, not just the first', () => {
        const before = view({ a: 1, b: 1 }, { a: 1, b: 1 })
        const after = view({ a: 1, b: 1 }, { a: 2, b: 5 })
        expect(findIncoherent(['a', 'b'], before, after)).toHaveLength(2)
    })
})
