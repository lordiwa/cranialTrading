/**
 * Particiona un array en sub-arrays de a lo sumo `size` elementos, preservando el orden.
 * Usado para respetar el límite de 500 operaciones de writeBatch de Firestore
 * (ver stores/messages.ts markConversationRead).
 */
export const chunkArray = <T>(items: T[], size: number): T[][] => {
    if (items.length === 0) return [];
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};
