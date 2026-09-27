export const roundQuantity = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function quantityStep(unit: string): number {
  const normalized = unit.trim().toLowerCase().replace(/\./g, '');
  if (['g', 'gm', 'gram', 'grams', 'ml', 'millilitre', 'milliliter', 'millilitres', 'milliliters'].includes(normalized)) return 500;
  if (['kg', 'kgs', 'kilogram', 'kilograms', 'l', 'lt', 'litre', 'liter', 'litres', 'liters'].includes(normalized)) return 0.5;
  return 1;
}

export function initialQuantity(unit: string): number {
  return quantityStep(unit) === 500 ? 500 : 1;
}

export function validQuantity(value: number): boolean {
  return Number.isFinite(value) && roundQuantity(value) > 0 && value <= Number.MAX_SAFE_INTEGER;
}