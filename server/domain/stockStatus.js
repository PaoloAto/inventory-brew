const STOCK_STATUS = {
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  UNCONFIGURED: 'UNCONFIGURED',
  CRITICAL: 'CRITICAL',
  LOW: 'LOW',
  SUFFICIENT: 'SUFFICIENT',
}

const CRITICAL_STOCK_RATIO = 0.25

const calculateStockStatus = ({ stockQuantity, reorderLevel }) => {
  if (stockQuantity <= 0) {
    return {
      code: STOCK_STATUS.OUT_OF_STOCK,
      stockRatio: reorderLevel > 0 ? stockQuantity / reorderLevel : null,
      shortfall: reorderLevel > 0 ? Math.max(reorderLevel - stockQuantity, 0) : null,
    }
  }

  if (reorderLevel <= 0) {
    return {
      code: STOCK_STATUS.UNCONFIGURED,
      stockRatio: null,
      shortfall: null,
    }
  }

  const stockRatio = stockQuantity / reorderLevel
  const shortfall = Math.max(reorderLevel - stockQuantity, 0)

  if (stockRatio <= CRITICAL_STOCK_RATIO) {
    return { code: STOCK_STATUS.CRITICAL, stockRatio, shortfall }
  }

  if (stockQuantity <= reorderLevel) {
    return { code: STOCK_STATUS.LOW, stockRatio, shortfall }
  }

  return { code: STOCK_STATUS.SUFFICIENT, stockRatio, shortfall }
}

module.exports = {
  calculateStockStatus,
  CRITICAL_STOCK_RATIO,
  STOCK_STATUS,
}
