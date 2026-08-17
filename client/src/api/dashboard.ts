import { request } from './http'
import type { StockStatus } from '../types/ingredient'

export interface DashboardSummary {
  ingredientCount: number
  recipeCount: number
  lowStockCount: number
  outOfStockCount: number
  criticalStockCount: number
  lowOnlyCount: number
  unconfiguredReorderCount: number
  sufficientStockCount: number
  replenishmentRequiredCount: number
  totalStockValue: number
}

export interface LowStockItem {
  id: string
  name: string
  unit: string
  stockQuantity: number
  reorderLevel: number
  shortfall: number
  stockStatus: StockStatus
  stockValue: number
  isActive: boolean
}

export interface RecentTransaction {
  _id: string
  ingredientId: string
  type: 'IN' | 'OUT' | 'ADJUST'
  quantity: number
  deltaQuantity?: number
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

export interface DashboardOverviewResponse {
  meta: {
    asOf: string
    generatedAt: string
    salesDateFrom: string
    salesDateTo: string
    salesDays: 7
    prepLookbackDays: 14
    inventoryLookbackDays: 30
    wasteDateFrom: string
    wasteDateTo: string
  }
  attention: {
    prepShortageIngredientCount: number
    reorderTriggeredCount: number
    outOfStockCount: number
    openPurchaseOrderCount: number
    overduePurchaseOrderCount: number
  }
  sales: {
    summary: {
      totalServings: number
      totalRevenue: number
      totalEstimatedFoodCost: number
      totalEstimatedGrossProfit: number
      grossMarginPercent: number | null
    }
    topMenuItems: Array<{
      recipeId: string
      recipeName: string
      servingsSold: number
      estimatedRevenue: number
      estimatedFoodCost: number
      estimatedGrossProfit: number
      grossMarginPercent: number | null
    }>
  }
  prep: {
    recordedDayCount: number
    dataSufficient: boolean
    recommendationCount: number
    totalSuggestedServings: number
    shortageIngredientCount: number
    canPrepare: boolean
    shortages: Array<{
      ingredientId: string
      ingredientName: string
      unit: string
      requiredQuantity: number
      availableQuantity: number
      shortfall: number
      canSatisfy: false
    }>
  }
  inventory: {
    ingredientCount: number
    totalStockValue: number
    outOfStockCount: number
    reorderTriggeredCount: number
    items: Array<{
      id: string
      name: string
      unit: string
      stockQuantity: number
      stockStatus: StockStatus
      daysRemaining: number | null
      averageDailyDepletion: number
      suggestedReorderQuantity: number | null
      preferredSupplier: { id: string; name: string } | null
    }>
  }
  purchasing: {
    openCount: number
    draftCount: number
    onOrderCount: number
    overdueCount: number
    items: Array<{
      id: string
      _id: string
      orderNumber: string
      supplierNameSnapshot: string
      status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED'
      expectedAt: string | null
      remainingLineCount: number
      overdue: boolean
    }>
  }
  waste: {
    eventCount: number
    totalWasteValue: number
    byReason: Array<{
      reasonCode: string
      eventCount: number
      totalWasteValue: number
    }>
  }
  recentTransactions: RecentTransaction[]
}

export const getDashboardSummary = async (
  query: DashboardSummaryQuery = {},
): Promise<DashboardSummaryResponse> => {
  return request<DashboardSummaryResponse>('/dashboard/summary', {
    method: 'GET',
    query,
  })
}

export const getDashboardOverview = (asOf: string) =>
  request<DashboardOverviewResponse>('/dashboard/overview', {
    method: 'GET',
    query: { asOf },
  })
