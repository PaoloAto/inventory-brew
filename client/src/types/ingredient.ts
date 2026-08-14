export type Unit = 'pcs' | 'g' | 'kg' | 'ml' | 'l'

export type StockStatusCode =
  | 'OUT_OF_STOCK'
  | 'UNCONFIGURED'
  | 'CRITICAL'
  | 'LOW'
  | 'SUFFICIENT'

export interface StockStatus {
  code: StockStatusCode
  stockRatio: number | null
  shortfall: number | null
}

export interface Ingredient {
  id: string
  name: string
  category?: string
  unit: Unit
  stockQuantity: number
  costPerUnit: number
  reorderLevel?: number
  parLevel?: number
  stockStatus: StockStatus
  isActive: boolean
  manufacturer?: string
  preferredSupplierId?: string | null
  supplierSku?: string
}
