// Percentuais referentes ao rendimento informado, sem anualização implícita.
export function calculateYields(income, currentPrice, averagePrice) {
  const ratio = price => Number.isFinite(income) && income >= 0 && Number.isFinite(price) && price > 0
    ? income / price * 100 : null;
  return { currentDy: ratio(currentPrice), averageDy: ratio(averagePrice) };
}
