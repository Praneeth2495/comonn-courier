// Dev-only sample data for the Accounts → Overview tab — lets you edit
// numbers directly and reload instead of needing real orders in a
// database. Only ever read when both import.meta.env.DEV is true AND the
// page is loaded with ?mockAccounts=1 (see AccountsOverviewPanel), so this
// can never activate in a production build regardless of the query string.
// Edit the `revenue`/`costRatio` arrays per range to try different shapes —
// e.g. the negative value in MONTH's costRatio is there on purpose, to
// exercise the chart's negative-profit rendering.

const RANGE_CONFIG = {
  day: { labels: ['6–9am', '9–12', '12–3pm', '3–6pm', '6–9pm', '9pm–12'], revenue: [4200, 18600, 24300, 21100, 16800, 7300], costRatio: [0.72, 0.70, 0.68, 0.69, 0.71, 0.73], deltas: { gross: 6.2, net: 6.0, cost: 4.1, profit: 9.1, marginPp: 1.4 } },
  week: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], revenue: [88000, 95000, 101000, 97000, 112000, 68000, 41000], costRatio: [0.71, 0.69, 0.68, 0.70, 0.67, 0.73, 0.75], deltas: { gross: 3.8, net: 3.6, cost: 1.2, profit: 5.5, marginPp: 0.6 } },
  // Deliberately spikes cost ratio above 1.0 for two buckets (a "fuel
  // surcharge" story) so profit goes negative — this is what exercises the
  // chart's negative-value rendering fix.
  month: { labels: ['1–3', '4–6', '7–9', '10–12', '13–15', '16–18', '19–21', '22–24', '25–27', '28–30'], revenue: [245000, 268000, 251000, 279000, 295000, 241000, 258000, 312000, 284000, 267000], costRatio: [0.705, 0.70, 0.695, 1.15, 1.08, 0.71, 0.70, 0.68, 0.69, 0.70], deltas: { gross: 11.4, net: 11.1, cost: 6.8, profit: -4.3, marginPp: -1.8 } },
  quarter: { labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12'], revenue: [710000, 695000, 742000, 688000, 655000, 598000, 612000, 671000, 705000, 733000, 758000, 772000], costRatio: [0.71, 0.705, 0.70, 0.715, 0.72, 0.73, 0.70, 0.735, 0.715, 0.70, 0.695, 0.69], deltas: { gross: 7.9, net: 7.6, cost: 13.8, profit: 2.1, marginPp: -0.4 } },
  sixmo: { labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'], revenue: [2420000, 2510000, 2380000, 2690000, 2790000, 2990000], costRatio: [0.735, 0.725, 0.715, 0.705, 0.695, 0.685], deltas: { gross: 18.6, net: 18.3, cost: 13.9, profit: 24.0, marginPp: 2.0 } },
  year: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], revenue: [1650000, 1720000, 1810000, 1890000, 1760000, 2050000, 2420000, 2510000, 2380000, 2690000, 2790000, 2990000], costRatio: [0.74, 0.735, 0.73, 0.735, 0.72, 0.715, 0.735, 0.725, 0.715, 0.705, 0.695, 0.685], deltas: { gross: 22.3, net: 21.9, cost: 15.4, profit: 29.7, marginPp: 2.6 } },
};

const DISCOUNT_RATE = 0.045;
const CHANNEL_SPLIT = { b2c: 0.31, b2b: 0.45, c2c: 0.24 };

export function buildMockAccountsOverview(range) {
  const cfg = RANGE_CONFIG[range] || RANGE_CONFIG.month;
  const series = cfg.revenue.map((gross, i) => {
    const discount = round2(gross * DISCOUNT_RATE);
    const net = round2(gross - discount);
    const cost = round2(net * cfg.costRatio[i]);
    return { label: cfg.labels[i], gross, discount, net, cost, profit: round2(net - cost) };
  });
  const totals = series.reduce((acc, b) => ({
    gross: acc.gross + b.gross,
    discount: acc.discount + b.discount,
    net: acc.net + b.net,
    cost: acc.cost + b.cost,
  }), { gross: 0, discount: 0, net: 0, cost: 0 });
  const profit = round2(totals.net - totals.cost);
  const margin = totals.net > 0 ? profit / totals.net : 0;

  return {
    range,
    window: { from: 'sample', to: 'sample' },
    series,
    totals: { gross: round2(totals.gross), discount: round2(totals.discount), net: round2(totals.net), cost: round2(totals.cost), profit, margin },
    deltas: cfg.deltas,
    channel: { b2c: round2(totals.gross * CHANNEL_SPLIT.b2c), b2b: round2(totals.gross * CHANNEL_SPLIT.b2b), c2c: round2(totals.gross * CHANNEL_SPLIT.c2c) },
    outstanding: {
      receivable: { total: 597000, partyInvoices: 115000, merchantInvoices: 482000, overdueCount: 2 },
      payable: { total: 364000, overdueCount: 1 },
    },
    costBreakdownAvailable: false,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
