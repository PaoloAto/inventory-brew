import { ApiError } from './http'

export const getErrorMessage = (error: unknown, fallback = 'Request failed') => {
  if (error instanceof ApiError) {
    if (error.details && error.details.length > 0) {
      return `${error.message}: ${error.details.join('; ')}`
    }
    return error.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}
