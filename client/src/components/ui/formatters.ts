const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
})

const wholeNumberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

export const formatCurrency = (value: number) => currencyFormatter.format(value)

export const formatNumber = (value: number, maximumFractionDigits = 2) => {
  if (maximumFractionDigits === 0) return wholeNumberFormatter.format(value)
  return numberFormatter.format(value)
}

export const formatQuantity = (value: number, unit?: string) => {
  const formatted = formatNumber(value)
  return unit ? `${formatted} ${unit}` : formatted
}

export const formatSignedQuantity = (
  value: number,
  type: 'IN' | 'OUT' | 'ADJUST',
  unit?: string,
) => {
  const sign = type === 'IN' ? '+' : type === 'OUT' ? '−' : ''
  return `${sign}${formatQuantity(Math.abs(value), unit)}`
}

export const formatPercentage = (value: number, maximumFractionDigits = 0) =>
  `${new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value)}%`

export const formatDateTime = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}

export const formatTime = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : timeFormatter.format(date)
}
