import { request, type PaginatedResponse } from './http'

export type SalesRecordStatus = 'ACTIVE' | 'CANCELLED'

export interface SalesRecordLine {
  recipeId: string
  recipeNameSnapshot: string
  yieldServingsSnapshot: number
  servingsSold: number
  sellingPricePerServingSnapshot: number
  costPerServingSnapshot: number
  estimatedRevenue: number
  estimatedFoodCost: number
  estimatedGrossProfit: number
  grossMarginPercentSnapshot: number | null
}

export interface SalesRecord {
  id: string
  businessDate: string
  status: SalesRecordStatus
  cancelledAt: string | null
  lines: SalesRecordLine[]
  totalServings: number
  totalRevenue: number
  totalEstimatedFoodCost: number
  totalEstimatedGrossProfit: number
  grossMarginPercent: number | null
  createdAt: string
  updatedAt: string
}

export interface SalesRecordListItem {
  id: string
  businessDate: string
  status: SalesRecordStatus
  lineCount: number
  totalServings: number
  totalRevenue: number
  totalEstimatedFoodCost: number
  totalEstimatedGrossProfit: number
  grossMarginPercent: number | null
  createdAt: string
  cancelledAt: string | null
}

export interface SalesSummary {
  totalServings: number
  totalRevenue: number
  totalEstimatedFoodCost: number
  totalEstimatedGrossProfit: number
  grossMarginPercent: number | null
}

export interface MenuPerformanceItem {
  recipeId: string
  recipeName: string
  servingsSold: number
  estimatedRevenue: number
  estimatedFoodCost: number
  estimatedGrossProfit: number
  grossMarginPercent: number | null
}

export interface SalesListQuery {
  status?: SalesRecordStatus
  search?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
  sortOrder?: 'asc' | 'desc'
}

interface SalesRecordDTO extends Omit<SalesRecord, 'id'> {
  _id: string
}

const toSalesRecord = (record: SalesRecordDTO): SalesRecord => ({
  ...record,
  id: record._id,
})

export const recordSales = async (payload: {
  businessDate: string
  lines: Array<{ recipeId: string; servingsSold: number }>
}) => {
  const response = await request<{ record: SalesRecordDTO }>('/sales/records', {
    method: 'POST',
    body: payload,
  })
  return toSalesRecord(response.record)
}

export const listSalesRecords = (query: SalesListQuery = {}) =>
  request<PaginatedResponse<SalesRecordListItem>>('/sales/records', { method: 'GET', query })

export const getSalesRecord = async (id: string) => {
  const response = await request<{ record: SalesRecordDTO }>(`/sales/records/${id}`, { method: 'GET' })
  return toSalesRecord(response.record)
}

export const cancelSalesRecord = async (id: string) => {
  const response = await request<{ record: SalesRecordDTO }>(`/sales/records/${id}/cancel`, {
    method: 'POST',
    body: {},
  })
  return toSalesRecord(response.record)
}

export const getSalesSummary = (dateFrom: string, dateTo: string) =>
  request<{ summary: SalesSummary; items: MenuPerformanceItem[] }>('/sales/summary', {
    method: 'GET',
    query: { dateFrom, dateTo },
  })
