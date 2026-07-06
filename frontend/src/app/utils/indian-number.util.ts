export interface IndianAmountBreakdown {
  thousand: number;
  lakh: number;
  crore: number;
  full: string;
  primaryDisplay: string;
}

/** Format full amount with Indian digit grouping (e.g. 1,00,34,824.44). */
export function formatIndianFull(value: number): string {
  return Math.abs(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/** Thousand, Lakh, Crore breakdown with 2 decimal places each. */
export function getIndianAmountBreakdown(value: number): IndianAmountBreakdown {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  const thousand = abs / 1_000;
  const lakh = abs / 1_00_000;
  const crore = abs / 1_00_00_000;

  let primaryDisplay: string;
  if (abs >= 1_00_00_000) {
    primaryDisplay = `${sign}₹${crore.toFixed(2)} Cr`;
  } else if (abs >= 1_00_000) {
    primaryDisplay = `${sign}₹${lakh.toFixed(2)} L`;
  } else if (abs >= 1_000) {
    primaryDisplay = `${sign}₹${thousand.toFixed(2)} K`;
  } else {
    primaryDisplay = `${sign}₹${abs.toFixed(2)}`;
  }

  return {
    thousand,
    lakh,
    crore,
    full: `${sign}₹${formatIndianFull(value)}`,
    primaryDisplay
  };
}
