const STOCK_STATUS = {
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  UNCONFIGURED: 'UNCONFIGURED',
  CRITICAL: 'CRITICAL',
  LOW: 'LOW',
  SUFFICIENT: 'SUFFICIENT',
}

const CRITICAL_STOCK_RATIO = 0.25

const calculateStockStatus = ({ stockQuantity, reorderLevel }) => {
  const parsedStock = Number(stockQuantity)
  const parsedReorder = Number(reorderLevel)
  const normalizedStock = Number.isFinite(parsedStock) ? parsedStock : 0
  const normalizedReorder =
    Number.isFinite(parsedReorder) && parsedReorder > 0 ? parsedReorder : 0

  if (normalizedStock <= 0) {
    return {
      code: STOCK_STATUS.OUT_OF_STOCK,
      stockRatio: normalizedReorder > 0 ? 0 : null,
      shortfall: normalizedReorder > 0 ? normalizedReorder : null,
    }
  }

  if (normalizedReorder <= 0) {
    return {
      code: STOCK_STATUS.UNCONFIGURED,
      stockRatio: null,
      shortfall: null,
    }
  }

  const stockRatio = normalizedStock / normalizedReorder
  const shortfall = Math.max(normalizedReorder - normalizedStock, 0)

  if (stockRatio <= CRITICAL_STOCK_RATIO) {
    return { code: STOCK_STATUS.CRITICAL, stockRatio, shortfall }
  }

  if (normalizedStock <= normalizedReorder) {
    return { code: STOCK_STATUS.LOW, stockRatio, shortfall }
  }

  return { code: STOCK_STATUS.SUFFICIENT, stockRatio, shortfall }
}

module.exports = {
  calculateStockStatus,
  CRITICAL_STOCK_RATIO,
  STOCK_STATUS,
}
