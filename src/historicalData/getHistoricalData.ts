import YahooFinance from 'yahoo-finance2';

function createDateString(dateObj: Date): string {
  const dateString = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  return dateString;
}

export default async function getSetMovingAverages(db: any) {
  console.info('Starting get/set moving averages')
  const yf = new YahooFinance();

  // Get list of tickers
  const tickerObj: { tickers: string; }[] = await db.getAllData(`
    SELECT tickers FROM issuers
    `);
  const tickers: string[] = tickerObj.map(({ tickers }) => tickers);

  // Get dates today and in past
  const now = new Date();
  const endDate = createDateString(now);

  now.setDate(now.getDate() - 320);
  const startDate = createDateString(now);

  for (const ticker of tickers) {
    const simpleTicker = ticker.split(', ')[0];
    if(!simpleTicker.length) continue;

    console.info(`Processing: ${simpleTicker}`)

    const tickerData = await yf.chart(simpleTicker, { period1: startDate, period2: endDate, interval: '1d' });

    const { quotes, meta } = tickerData;
    const { regularMarketVolume, fiftyTwoWeekHigh, fiftyTwoWeekLow, longName, shortName } = meta;

    const quotesLast200 = (quotes ?? []).slice(-200);
    const ma200 = (quotesLast200.reduce((acc, curr) => acc + (curr?.adjclose ?? 0), 0) / 200).toFixed(2);

    const quotesLast20 = quotes.slice(-20);
    const ma20 = (quotesLast20.reduce((acc, curr) => acc + (curr?.adjclose ?? 0), 0) / 20).toFixed(2);

    const query = `
    INSERT OR REPLACE INTO moving_averages 
    (ticker, long_name, short_name, ma20, ma200, fifty_two_week_high, fifty_two_week_low, volume, date_string)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    try {
      await db.setData(query, [ticker, longName, shortName, ma20, ma200, fiftyTwoWeekHigh, fiftyTwoWeekLow, regularMarketVolume, endDate]);
    } catch (err) {
      console.error(`Error adding ticker:${simpleTicker} to database`);
    }
  }
  console.info('Moving Averages Complete')
}