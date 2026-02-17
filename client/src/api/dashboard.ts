import { request } from './http'

export interface DashboardSummary {
  ingredientCount: number
  recipeCount: number
  lowStockCount: number
  totalStockValue: number
}

export interface LowStockItem {
  id: string
  name: string
  unit: string
  stockQuantity: number
  reorderLevel: number
  shortfall: number
  stockValue: number
  isActive: boolean
}

export interface RecentTransaction {
  _id: string
  ingredientId: string
  type: 'IN' | 'OUT' | 'ADJUST'
  quantity: number
  previousStock: number
  newStock: number
  reason?: string
  unitCost?: number
  referenceType?: 'recipe' | 'manual' | 'purchase' | 'system'
  referenceId?: string
  createdAt: string
  updatedAt: string
  ingredient?: {
    id: string
    name: string
    unit: string
    isActive: boolean
  } | null
  reference?: {
    type: string
    id: string | null
    name: string | null
    isActive: boolean | null
  } | null
}

export interface DashboardSummaryResponse {
  summary: DashboardSummary
  lowStockItems: LowStockItem[]
  recentTransactions: RecentTransaction[]
  meta: {
    includeInactive: boolean
    lowStockLimit: number
    recentTransactionsLimit: number
    generatedAt: string
  }
}

export interface DashboardSummaryQuery {
  lowStockLimit?: number
  recentTransactionsLimit?: number
  includeInactive?: boolean
  includeRelated?: boolean
}

export const getDashboardSummary = async (
  query: DashboardSummaryQuery = {},
): Promise<DashboardSummaryResponse> => {
  return request<DashboardSummaryResponse>('/dashboard/summary', {
    method: 'GET',
    query,
  })
}
