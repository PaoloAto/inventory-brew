import { request, type PaginatedResponse } from './http'
import type { Unit } from '../types/ingredient'

export type PurchaseOrderStatus = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'
export interface PurchaseOrderItem { _id: string; ingredientId: string; ingredientNameSnapshot: string; unit: Unit; orderedQuantity: number; receivedQuantity: number; remainingQuantity: number; expectedUnitCost: number }
export interface PurchaseOrder { _id: string; orderNumber: string; supplierId: string; supplierNameSnapshot: string; status: PurchaseOrderStatus; notes?: string; orderedAt?: string; expectedAt?: string; closedAt?: string; cancelledAt?: string; items: PurchaseOrderItem[]; createdAt: string; updatedAt: string }
export interface PurchaseReceiptItem { purchaseOrderItemId: string; ingredientId: string; ingredientNameSnapshot: string; unit: Unit; quantity: number; unitCost: number; lineTotal: number }
export interface PurchaseReceipt { _id: string; purchaseOrderId: string; orderNumberSnapshot: string; supplierId: string; supplierNameSnapshot: string; operationId: string; receivedAt: string; items: PurchaseReceiptItem[]; totalValue: number }
export interface PurchaseOrderPayload { supplierId: string; expectedAt?: string; notes?: string; items: Array<{ ingredientId: string; orderedQuantity: number; expectedUnitCost: number }> }
export interface ReceivePayload { items: Array<{ purchaseOrderItemId: string; quantity: number; unitCost: number }> }
export interface PurchaseOrderQuery { supplierId?: string; status?: PurchaseOrderStatus; search?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number; sortOrder?: 'asc' | 'desc' }
export const listPurchaseOrders = (query: PurchaseOrderQuery = {}) => request<PaginatedResponse<PurchaseOrder>>('/purchase-orders', { method: 'GET', query })
export const getPurchaseOrder = (id: string) => request<PurchaseOrder>(`/purchase-orders/${id}`, { method: 'GET' })
export const createPurchaseOrder = (payload: PurchaseOrderPayload) => request<PurchaseOrder>('/purchase-orders', { method: 'POST', body: payload })
export const updatePurchaseOrder = (id: string, payload: PurchaseOrderPayload) => request<PurchaseOrder>(`/purchase-orders/${id}`, { method: 'PUT', body: payload })
export const orderPurchaseOrder = (id: string) => request<PurchaseOrder>(`/purchase-orders/${id}/order`, { method: 'POST' })
export const cancelPurchaseOrder = (id: string) => request<PurchaseOrder>(`/purchase-orders/${id}/cancel`, { method: 'POST' })
export const receivePurchaseOrder = (id: string, payload: ReceivePayload) => request<{ message: string; purchaseOrder: PurchaseOrder; purchaseReceipt: PurchaseReceipt; transactionsCreated: number; operationId: string }>(`/purchase-orders/${id}/receive`, { method: 'POST', body: payload })
export const listPurchaseReceipts = (query: { purchaseOrderId?: string; supplierId?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number; sortOrder?: 'asc' | 'desc' } = {}) => request<PaginatedResponse<PurchaseReceipt>>('/purchase-receipts', { method: 'GET', query })
