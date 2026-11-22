export interface BufferPoint {
  date: string;
  balancePaise: number;
}

export interface BufferAnalysis {
  minBalancePaise: number;
  minBalanceDate: string | null;
  firstBreachDate: string | null;
  maxGapPaise: number;
  maxGapDate: string | null;
}

/**
 * Analyses a daily balance series against a cash buffer.
 * - firstBreachDate: earliest date whose balance is strictly below bufferPaise.
 * - maxGapPaise: max over days of max(0, bufferPaise - balance).
 * - Ties resolve to the earliest date.
 * - Empty series returns zeros and nulls.
 */
export function analyseBuffer(series: BufferPoint[], bufferPaise: number): BufferAnalysis {
  let minBal = 0;
  let minDate: string | null = null;
  let breach: string | null = null;
  let maxGap = 0;
  let maxGapD: string | null = null;

  for (const { date, balancePaise } of series) {
    if (minDate === null || balancePaise < minBal || (balancePaise === minBal && date < minDate)) {
      minBal = balancePaise;
      minDate = date;
    }

    if (balancePaise < bufferPaise && (breach === null || date < breach)) {
      breach = date;
    }

    const gap = Math.max(0, bufferPaise - balancePaise);
    if (gap > 0 && (maxGapD === null || gap > maxGap || (gap === maxGap && date < maxGapD))) {
      maxGap = gap;
      maxGapD = date;
    }
  }

  return {
    minBalancePaise: minBal,
    minBalanceDate: minDate,
    firstBreachDate: breach,
    maxGapPaise: maxGap,
    maxGapDate: maxGapD,
  };
}
