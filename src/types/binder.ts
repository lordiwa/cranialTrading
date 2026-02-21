export interface BinderAllocation {
    cardId: string
    quantity: number
    addedAt: Date
}

export interface BinderStats {
    totalCards: number
    totalPrice: number
}

export interface Binder {
    id: string
    userId: string
    name: string
    description: string
    allocations: BinderAllocation[]
    thumbnail: string
    createdAt: Date
    updatedAt: Date
    stats: BinderStats
    isPublic: boolean
    forSale: boolean
}

export interface CreateBinderInput {
    name: string
    description: string
}
