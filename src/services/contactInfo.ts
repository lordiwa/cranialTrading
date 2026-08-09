/**
 * Contact info — el email de contacto de un usuario, separado de todo lo que
 * se publica sin login (TASK-169).
 *
 * POR QUE EXISTE ESTA COLECCION. El email del dueño se copiaba dentro de cada
 * documento de public_cards y public_preferences, que se leen SIN estar
 * logueado (TASK-085 los abrio a proposito, para que un visitante vea quien
 * vende una carta). Eso hacia que los emails de toda la plataforma se pudieran
 * bajar en masa con una sola peticion anonima — verificado en vivo contra dev.
 *
 * La regla de Firestore no puede filtrar por campo: o el documento entero es
 * publico o no lo es. Asi que el email se muda a su propia coleccion, con
 * lectura solo para usuarios logueados y escritura solo del dueño. El perfil
 * publico sigue abriendose sin login porque no necesita el email; el modal de
 * contacto de matches, que si lo necesita, lo pide aca y siempre es un usuario
 * logueado.
 */
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from './firebase'

export interface ContactInfo {
  email: string
  username: string
}

/**
 * Publica (o actualiza) el email de contacto del propio usuario.
 * Idempotente: se puede llamar en cada login sin coste real.
 */
export async function syncContactInfo(userId: string, email: string, username: string): Promise<void> {
  if (!userId || !email) return
  await setDoc(doc(db, 'contact_info', userId), {
    email,
    username,
    updatedAt: Timestamp.now(),
  })
}

/**
 * Lee el email de contacto de otro usuario. Requiere estar logueado (lo impone
 * la regla, no esta funcion). Devuelve null si no existe o si la lectura se
 * deniega — quien llama debe tratar la ausencia como "no hay contacto", nunca
 * como un error que corte el flujo.
 */
export async function getContactInfo(userId: string): Promise<ContactInfo | null> {
  if (!userId) return null
  try {
    const snap = await getDoc(doc(db, 'contact_info', userId))
    if (!snap.exists()) return null
    const data = snap.data() as Partial<ContactInfo>
    if (!data.email) return null
    return { email: data.email, username: data.username ?? '' }
  } catch {
    return null
  }
}
