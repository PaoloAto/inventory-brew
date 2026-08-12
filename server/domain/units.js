const UNIT_DEFINITIONS = Object.freeze({
  pcs: { dimension: 'count', baseUnit: 'pcs', factor: 1 },
  g: { dimension: 'mass', baseUnit: 'g', factor: 1 },
  kg: { dimension: 'mass', baseUnit: 'g', factor: 1000 },
  ml: { dimension: 'volume', baseUnit: 'ml', factor: 1 },
  l: { dimension: 'volume', baseUnit: 'ml', factor: 1000 },
})

const getDefinition = (unit) => {
  const definition = UNIT_DEFINITIONS[unit]
  if (!definition) throw new RangeError(`Unknown unit: ${unit}`)
  return definition
}

const assertFinite = (value, label) => {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`)
  return number
}

const getBaseUnit = (unit) => getDefinition(unit).baseUnit
const getConversionFactor = (unit) => getDefinition(unit).factor
const convertToBase = (quantity, unit) => assertFinite(quantity, 'quantity') * getConversionFactor(unit)
const convertFromBase = (quantityBase, displayUnit) =>
  assertFinite(quantityBase, 'quantityBase') / getConversionFactor(displayUnit)
const areUnitsCompatible = (unitA, unitB) => getDefinition(unitA).dimension === getDefinition(unitB).dimension
const costPerDisplayUnitToBase = (cost, displayUnit) =>
  assertFinite(cost, 'cost') / getConversionFactor(displayUnit)
const costPerBaseUnitToDisplay = (costBase, displayUnit) =>
  assertFinite(costBase, 'costBase') * getConversionFactor(displayUnit)

module.exports = {
  UNIT_DEFINITIONS,
  getBaseUnit,
  getConversionFactor,
  convertToBase,
  convertFromBase,
  areUnitsCompatible,
  costPerDisplayUnitToBase,
  costPerBaseUnitToDisplay,
}
