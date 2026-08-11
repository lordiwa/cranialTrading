/**
 * TASK-188 — candado de regresion contra la fuga de datos personales por
 * lectura anonima. Hace exactamente lo que haria un atacante: una peticion REST
 * a Firestore SIN token, y comprueba que lo que vuelve no trae emails.
 *
 * POR QUE ESTE TEST EXISTE Y POR QUE ES REST Y NO SDK. Es la TERCERA aparicion
 * de la misma clase de defecto:
 *   TASK-087 — users/{uid}/cards con `allow read: if true`
 *   TASK-169 — el email copiado dentro de cada doc de public_cards
 *   TASK-188 — el email dentro del doc de /users
 * Las tres veces el codigo del cliente "no mostraba" el dato, y las tres veces
 * el dato viajaba igual: las reglas de Firestore se evaluan por DOCUMENTO, no
 * por campo, y filtrar en el cliente no es seguridad. Por eso la verificacion
 * tiene que saltarse el cliente por completo.
 *
 * NUNCA IMPRIME UN EMAIL. Comprueba presencia de la clave y reporta cuentas, no
 * valores — un test de seguridad que vuelca datos personales en el log de CI es
 * la misma fuga por otra via.
 *
 * Necesita VITE_FIREBASE_PROJECT_ID y VITE_FIREBASE_API_KEY (de .env.local /
 * .env.development). Sin eso se salta: no hay forma honesta de pasar sin
 * ejercitar la red.
 */
const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? ''
const apiKey = process.env.VITE_FIREBASE_API_KEY ?? ''
const configured = Boolean(projectId && apiKey)

const restUrl = (collectionName: string, pageSize = 300) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}` +
  `?pageSize=${pageSize}&key=${apiKey}`

interface RestDoc { name?: string; fields?: Record<string, unknown> }

/** Peticion SIN Authorization: exactamente lo que puede hacer cualquiera. */
async function fetchAnonymously(collectionName: string) {
  const res = await fetch(restUrl(collectionName))
  const body = (await res.json()) as { documents?: RestDoc[]; error?: { message: string } }
  return { status: res.status, documents: body.documents ?? [], error: body.error }
}

const describeIf = configured ? describe : describe.skip

describeIf('TASK-188 — exposicion anonima de datos personales', () => {
  it('la coleccion /users no devuelve el campo email a un anonimo', async () => {
    const { status, documents } = await fetchAnonymously('users')

    // Si las reglas cambiaran y /users dejara de ser legible sin sesion, este
    // test tambien pasa — y estaria bien. Lo que no puede pasar es 200 CON email.
    if (status !== 200) return

    const withEmail = documents.filter(d => d.fields && 'email' in d.fields)
    expect(
      withEmail.length,
      `${withEmail.length} de ${documents.length} documentos de /users exponen 'email' sin sesion. ` +
      `Correr scripts/strip-user-email.mjs --apply DESPUES de desplegar el codigo.`
    ).toBe(0)
  }, 30000)

  it('regresion TASK-169: /public_cards tampoco devuelve email a un anonimo', async () => {
    const { status, documents } = await fetchAnonymously('public_cards')
    if (status !== 200) return

    const withEmail = documents.filter(d => d.fields && 'email' in d.fields)
    expect(withEmail.length, `${withEmail.length} documentos de /public_cards exponen 'email'`).toBe(0)
  }, 30000)

  it('regresion TASK-169: /contact_info NO es legible sin sesion', async () => {
    // Aca el email SI vive, a proposito. Lo que lo protege es la regla.
    const { status, documents } = await fetchAnonymously('contact_info')
    expect(
      documents.length,
      `/contact_info devolvio ${documents.length} documentos sin sesion (HTTP ${status}). Ahi vive el email.`
    ).toBe(0)
  }, 30000)

  it('regresion TASK-087: users/{uid}/cards no es enumerable sin sesion', async () => {
    // Se prueba contra un uid real tomado de /users si esta disponible; si /users
    // ya no es legible, se usa un uid inventado — el resultado esperado es el
    // mismo y la ausencia de datos no debe convertir esto en un falso verde.
    const users = await fetchAnonymously('users')
    const uid = users.documents[0]?.name?.split('/').pop() ?? 'uid-inexistente'
    const { status, documents } = await fetchAnonymously(`users/${uid}/cards`)
    expect(
      documents.length,
      `users/${uid}/cards devolvio ${documents.length} documentos sin sesion (HTTP ${status})`
    ).toBe(0)
  }, 30000)
})

if (!configured) {
  // Un skip silencioso es indistinguible de un verde. Que se vea en el log.
  console.warn(
    '[TASK-188] anonymousExposure.test.ts SALTEADO: faltan VITE_FIREBASE_PROJECT_ID / VITE_FIREBASE_API_KEY. ' +
    'Este test no verifico NADA en esta corrida.'
  )
}
