export interface ApiErrorPayload {
  code: string
  message: string
  details?: string[]
}

export class ApiError extends Error {
  status: number
  code?: string
  details?: string[]

  constructor(options: { status: number; message: string; code?: string; details?: string[] }) {
    super(options.message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.details = options.details
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:5000/api'

const buildUrl = (path: string, params?: object) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${API_BASE_URL}${normalizedPath}`)

  if (params) {
    Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
      if (value === undefined || value === null) return
      url.searchParams.set(key, String(value))
    })
  }

  return url.toString()
}

const extractErrorPayload = async (response: Response) => {
  try {
    const parsed = (await response.json()) as { error?: ApiErrorPayload; message?: string }
    if (parsed.error) return parsed.error
    if (parsed.message) {
      return {
        code: 'REQUEST_FAILED',
        message: parsed.message,
      }
    }
  } catch {
    // ignore body parse errors and fallback to generic message
  }

  return {
    code: 'REQUEST_FAILED',
    message: `Request failed with status ${response.status}`,
  }
}

export const request = async <T>(
  path: string,
  options: Omit<RequestInit, 'body'> & {
    query?: object
    body?: unknown
  } = {},
): Promise<T> => {
  const { query, body, headers, ...rest } = options
  const response = await fetch(buildUrl(path, query), {
    ...rest,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const errorPayload = await extractErrorPayload(response)
    throw new ApiError({
      status: response.status,
      code: errorPayload.code,
      message: errorPayload.message,
      details: errorPayload.details,
    })
  }

  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedResponse<T> {
  items: T[]
  pagination: PaginationMeta
}

export const getApiBaseUrl = () => API_BASE_URL
