import { request, type PaginatedResponse } from './http'

export interface Supplier {
  _id: string
  name: string
  contactName?: string
  email?: string
  phone?: string
  notes?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SupplierPayload { name: string; contactName?: string; email?: string; phone?: string; notes?: string }
export interface SupplierQuery { search?: string; includeInactive?: boolean; onlyInactive?: boolean; page?: number; limit?: number; sortOrder?: 'asc' | 'desc' }
export const listSuppliers = (query: SupplierQuery = {}) => request<PaginatedResponse<Supplier>>('/suppliers', { method: 'GET', query })
export const createSupplier = (payload: SupplierPayload) => request<Supplier>('/suppliers', { method: 'POST', body: payload })
export const updateSupplier = (id: string, payload: Partial<SupplierPayload>) => request<Supplier>(`/suppliers/${id}`, { method: 'PUT', body: payload })
export const archiveSupplier = (id: string) => request<{ message: string; supplier: Supplier }>(`/suppliers/${id}`, { method: 'DELETE' })
export const restoreSupplier = (id: string) => request<{ message: string; supplier: Supplier }>(`/suppliers/${id}/restore`, { method: 'PATCH' })
