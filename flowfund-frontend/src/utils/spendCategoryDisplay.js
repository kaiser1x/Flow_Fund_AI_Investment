/**
 * Map Plaid / raw category strings to canonical keys for emoji + bar colors.
 */

const DISPLAY = {
  'Food & Drink': { emoji: '🍔', color: '#f59e0b' },
  Groceries: { emoji: '🛒', color: '#10b981' },
  Shopping: { emoji: '🛍️', color: '#8b5cf6' },
  Transportation: { emoji: '🚗', color: '#3b82f6' },
  Travel: { emoji: '✈️', color: '#0ea5e9' },
  Entertainment: { emoji: '🎬', color: '#ec4899' },
  'Health & Fitness': { emoji: '💪', color: '#06b6d4' },
  Education: { emoji: '📚', color: '#f97316' },
  Transfer: { emoji: '💸', color: '#6b7280' },
  Income: { emoji: '💰', color: '#059669' },
  Other: { emoji: '💳', color: '#2d6b52' },
};

export function normalizeSpendCategory(raw) {
  if (!raw) return 'Other';
  const c = String(raw).toUpperCase().replace(/_/g, ' ').trim();

  if (c.includes('FOOD') && c.includes('DRINK')) return 'Food & Drink';
  if (c.includes('FOOD')) return 'Food & Drink';
  if (c.includes('GROCERY') || c === 'GROCERIES') return 'Groceries';
  if (c.includes('SHOP') || c.includes('MERCHANDISE') || c.includes('GENERAL')) return 'Shopping';
  if (c.includes('TRANSPORT') && !c.includes('TRAVEL')) return 'Transportation';
  if (c.includes('TRAVEL') || c.includes('AIRLINE') || c.includes('FLIGHT') || c.includes('LODGING'))
    return 'Travel';
  if (c.includes('ENTERTAIN') || c.includes('RECREATION')) return 'Entertainment';
  if (c.includes('HEALTH') || c.includes('FITNESS') || c.includes('MEDICAL') || c.includes('GYM'))
    return 'Health & Fitness';
  if (c.includes('EDUCATION') || c.includes('BOOK')) return 'Education';
  if (c.includes('TRANSFER')) return 'Transfer';
  if (c.includes('INCOME') || c.includes('DEPOSIT') || c.includes('PAYROLL')) return 'Income';

  return 'Other';
}

export function spendCategoryDisplay(rawCategory, isIncome) {
  if (isIncome) return DISPLAY.Income;
  const key = normalizeSpendCategory(rawCategory);
  return DISPLAY[key] || DISPLAY.Other;
}
