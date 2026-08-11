/**
 * TASK-196 — un mazo de Moxfield con la forma inesperada no puede producir NaN.
 *
 * QUE PASABA. Un mazo valido salvo por UNA carta sin `quantity` daba
 * "Mainboard: NaN | Sideboard: 0", el resumen decia "NaN CARDS" y el boton
 * quedaba HABILITADO diciendo literalmente "IMPORT NAN CARDS". Sin ningun error.
 * La suma era reduce((sum, item) => sum + item.quantity, 0), sin guarda — y dos
 * lineas mas abajo el NOMBRE si se protegia con `item.card?.name ?? ''`. La
 * guarda estaba en la cabeza de quien lo escribio, no en el codigo.
 *
 * Los caminos de error HTTP ya andaban bien (403 dice "Deck is private", 500
 * muestra el texto del proxy). Lo que faltaba era validar la FORMA de un 200.
 *
 * SEGUNDO DEFECTO, que D6 dejo sin verificar por prudencia (tocaba escribir en
 * la cuenta compartida): moxfieldToCardList hacia item.card.set.toUpperCase()
 * sin guarda, en TRES bloques identicos (commanders, mainboard, sideboard). Una
 * carta sin `set` reventaba A MITAD del import, dejando estado parcial. Aca
 * queda verificado sin tocar la red: es una funcion pura.
 *
 * CRITERIO: una carta inservible se DESCARTA y se CUENTA, nunca se cuela con un
 * valor inventado. El que decide que hacer con el mazo incompleto es quien
 * llama, con el numero de descartes en la mano — no esta funcion en silencio.
 */
import {
  countMoxfieldCards,
  moxfieldToCardList,
  type MoxfieldCard,
  type MoxfieldDeck,
} from '@/services/moxfield'

const cartaOk = (over: Partial<MoxfieldCard> = {}): MoxfieldCard => ({
  quantity: 1,
  boardType: 'mainboard',
  card: { name: 'Lightning Bolt', set: 'lea', cn: '161', scryfall_id: 'abc' },
  ...over,
} as MoxfieldCard)

const mazo = (boards: Partial<MoxfieldDeck['boards']>): MoxfieldDeck => ({
  name: 'Mazo',
  boards: {
    mainboard: { count: 0, cards: {} },
    sideboard: { count: 0, cards: {} },
    commanders: { count: 0, cards: {} },
    ...boards,
  },
} as MoxfieldDeck)

describe('TASK-196 — countMoxfieldCards nunca devuelve NaN', () => {
  it('suma normalmente cuando todo esta bien', () => {
    const r = countMoxfieldCards({ a: cartaOk({ quantity: 2 }), b: cartaOk({ quantity: 3 }) })
    expect(r.total).toBe(5)
    expect(r.invalid).toBe(0)
  })

  it('una carta SIN quantity no produce NaN: se descarta y se cuenta — ESTE es el bug', () => {
    const sinQty = { boardType: 'mainboard', card: cartaOk().card } as unknown as MoxfieldCard
    const r = countMoxfieldCards({ a: cartaOk({ quantity: 2 }), b: sinQty })
    expect(Number.isNaN(r.total)).toBe(false)
    expect(r.total).toBe(2)
    expect(r.invalid).toBe(1)
  })

  it('descarta quantity con tipos raros sin contaminar el total', () => {
    const r = countMoxfieldCards({
      ok: cartaOk({ quantity: 4 }),
      texto: cartaOk({ quantity: 'dos' as never }),
      nulo: cartaOk({ quantity: null as never }),
      nan: cartaOk({ quantity: Number.NaN }),
      infinito: cartaOk({ quantity: Number.POSITIVE_INFINITY }),
      objeto: cartaOk({ quantity: {} as never }),
    })
    expect(r.total).toBe(4)
    expect(r.invalid).toBe(5)
  })

  it('acepta un quantity en string numerico (cambio de tipo, no dato corrupto)', () => {
    const r = countMoxfieldCards({ a: cartaOk({ quantity: '3' as never }) })
    expect(r.total).toBe(3)
    expect(r.invalid).toBe(0)
  })

  it('descarta cantidades negativas y no enteras — no existe media carta', () => {
    const r = countMoxfieldCards({
      neg: cartaOk({ quantity: -2 }),
      frac: cartaOk({ quantity: 1.5 }),
    })
    expect(r.total).toBe(0)
    expect(r.invalid).toBe(2)
  })

  it('quantity 0 es valido, no un descarte', () => {
    const r = countMoxfieldCards({ a: cartaOk({ quantity: 0 }) })
    expect(r.total).toBe(0)
    expect(r.invalid).toBe(0)
  })

  it('tolera cards ausente o vacio', () => {
    expect(countMoxfieldCards(undefined)).toEqual({ total: 0, invalid: 0 })
    expect(countMoxfieldCards({})).toEqual({ total: 0, invalid: 0 })
  })
})

describe('TASK-196 — moxfieldToCardList no revienta a mitad del import', () => {
  it('convierte un mazo sano igual que antes', () => {
    const deck = mazo({
      mainboard: { count: 1, cards: { a: cartaOk({ quantity: 2 }) } },
    })
    const cards = moxfieldToCardList(deck)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ quantity: 2, name: 'Lightning Bolt', setCode: 'LEA', isInSideboard: false })
  })

  it('una carta SIN set no lanza y no aborta el resto del mazo', () => {
    const sinSet = { quantity: 1, boardType: 'mainboard', card: { name: 'Rara', cn: '1', scryfall_id: 'z' } } as unknown as MoxfieldCard
    const deck = mazo({
      mainboard: { count: 2, cards: { mala: sinSet, buena: cartaOk({ quantity: 3 }) } },
    })
    let cards: ReturnType<typeof moxfieldToCardList> = []
    expect(() => { cards = moxfieldToCardList(deck) }).not.toThrow()
    // La buena sobrevive. Ese es el punto: un dato malo no se lleva el import entero.
    expect(cards.some(c => c.name === 'Lightning Bolt' && c.quantity === 3)).toBe(true)
  })

  it('una carta SIN el objeto card entero se descarta sin lanzar', () => {
    const sinCard = { quantity: 1, boardType: 'mainboard' } as unknown as MoxfieldCard
    const deck = mazo({ mainboard: { count: 2, cards: { mala: sinCard, buena: cartaOk() } } })
    expect(() => moxfieldToCardList(deck)).not.toThrow()
    expect(moxfieldToCardList(deck)).toHaveLength(1)
  })

  it('los TRES bloques estan guardados por igual, no solo mainboard (Regla 6)', () => {
    const sinSet = { quantity: 1, boardType: 'x', card: { name: 'Rara', cn: '1', scryfall_id: 'z' } } as unknown as MoxfieldCard
    const deck = mazo({
      commanders: { count: 1, cards: { c: sinSet } },
      mainboard: { count: 1, cards: { m: sinSet } },
      sideboard: { count: 1, cards: { s: sinSet } },
    })
    expect(() => moxfieldToCardList(deck)).not.toThrow()
  })

  it('descarta la carta cuyo quantity no es utilizable en vez de propagar NaN', () => {
    const sinQty = { boardType: 'mainboard', card: cartaOk().card } as unknown as MoxfieldCard
    const deck = mazo({ mainboard: { count: 1, cards: { a: sinQty } } })
    const cards = moxfieldToCardList(deck)
    expect(cards.every(c => Number.isFinite(c.quantity))).toBe(true)
  })

  it('respeta includeSideboard = false (comportamiento de hoy)', () => {
    const deck = mazo({
      mainboard: { count: 1, cards: { a: cartaOk() } },
      sideboard: { count: 1, cards: { b: cartaOk({ quantity: 5 }) } },
    })
    expect(moxfieldToCardList(deck, false)).toHaveLength(1)
    expect(moxfieldToCardList(deck, true)).toHaveLength(2)
  })
})
