import YahooFinance from 'yahoo-finance2';

function createDateString(dateObj: Date): string {
  const dateString = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  return dateString;
}

// Progressive retry function 
async function getTickerData(yFin: any, simpleTicker: string, startDate: string, endDate: string, retriesAvailable = 3, sleepMs = 1000) {

  try {
    const tickerData = await yFin.chart(simpleTicker, { period1: startDate, period2: endDate, interval: '1d' });
    return tickerData;

  } catch (err) {
    if (retriesAvailable > 0) {
      await _sleep(sleepMs);
      getTickerData(yFin, simpleTicker, startDate, endDate, retriesAvailable - 1, sleepMs * 1.5);
    } else {
      // though this grenades the entire function—after 4 retries, something is wrong
      console.error("YAHOO-ERROR:", err);
      return false;
    }
  }
}

async function _sleep(ms: number) {
  return new Promise<void>(res => setTimeout(res, ms));
}

export default async function getHistoricalDataYahoo(db: any) {
  console.info('Starting get/set moving averages');
  const yf = new YahooFinance();

  // Get list of tickers
  const tickerObj: { tickers: string, cik: string; }[] = await db.getAllData(`
    SELECT tickers, cik FROM issuers
    `);

  // Get dates today and in past
  const now = new Date();
  const endDate = createDateString(now);

  now.setDate(now.getDate() - 320);
  const startDate = createDateString(now);

  for (const { tickers, cik } of tickerObj) {
    const simpleTicker = tickers.split(', ')[0];
    if (!simpleTicker.length) continue;

    console.info(`Processing: ${simpleTicker}`);

    const tickerData = await getTickerData(yf, simpleTicker, startDate, endDate);
    if (!tickerData) throw new Error(`Failure retrieving:${simpleTicker} ticker`);

    const { quotes, meta } = tickerData;
    const { regularMarketVolume, fiftyTwoWeekHigh, fiftyTwoWeekLow, longName, shortName } = meta;

    const quotesLast200 = (quotes ?? []).slice(-200);
    const ma200 = (quotesLast200.reduce((acc: number, curr: any) => acc + (curr?.adjclose ?? 0), 0) / 200).toFixed(2);

    const quotesLast20 = quotes.slice(-20);
    const ma20 = (quotesLast20.reduce((acc: number, curr: any) => acc + (curr?.adjclose ?? 0), 0) / 20).toFixed(2);

    const currentPrice = (quotes.slice(-1)[0].adjclose ?? 0).toFixed(2);

    const query = `
    INSERT OR REPLACE INTO moving_averages 
    (ticker, long_name, short_name, ma20, ma200, fifty_two_week_high, fifty_two_week_low, volume, date_string, daily_price, cik)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await _sleep(500);

    try {
      await db.setData(query, [tickers, longName, shortName, ma20, ma200, fiftyTwoWeekHigh, fiftyTwoWeekLow, regularMarketVolume, endDate, currentPrice, cik]);
    } catch (err) {
      console.error(`Error adding ticker:${simpleTicker} to database - Error${err}`);
    }
  }
  console.info('Moving Averages Complete');
}