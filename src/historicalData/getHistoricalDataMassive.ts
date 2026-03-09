import {
  restClient,
  DefaultApiGetStocksSMARequest,
  GetStocksSMATimespanEnum,
  GetStocksSMASeriesTypeEnum,
  GetStocksSMAOrderEnum

} from '@massive.com/client-js';

const massiveApiKey = process.env.MASSIVE_API_KEY;

type Agg = {
  T: string;
  v: number;
  vw: number;
  o: number;
  c: number;
  h: number;
  l: number;
  t: number;
  n: number;
};

async function _sleep(ms: number) {
  return new Promise<void>(res => setTimeout(res, ms));
}

function createDateString(dateObj: Date): string {
  const dateString = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  return dateString;
}

export async function getHistoricalDataMassive(database: any) {
  const SLEEP_AMT = 13000; // 13 sec - only allowed 5 calls a minute
  console.info('Starting get/set moving averages via MASSIVE');

  if (!massiveApiKey) throw new Error('MASSIVE API key unavailable');
  const rest = restClient(massiveApiKey);

  // Get list of tickers
  const tickerObj: { tickers: string; }[] = await database.getAllData(`
    SELECT tickers FROM issuers
    `);
  const tickers: string[] = tickerObj.map(({ tickers }) => tickers);

  // Get date today - 1
  const now = new Date();

  now.setDate(now.getDate() - 1);
  const startDate = createDateString(now);

  for (const ticker of tickers) {
    const simpleTicker = ticker.split(', ')[0];
    const requestObj: DefaultApiGetStocksSMARequest = {
      stockTicker: simpleTicker,
      timespan: GetStocksSMATimespanEnum.Day,
      adjusted: true,
      window: 253,
      expandUnderlying: true,
      seriesType: GetStocksSMASeriesTypeEnum.Close,
      limit: 300,
      order: GetStocksSMAOrderEnum.Asc
    };

    try {
      const response: any = await rest.getStocksSMA(requestObj);

      const { aggregates } = response.results.underlying;

      let low = Infinity;
      let high = -Infinity;

      (aggregates as Agg[]).forEach(({ l, h }) => {
        low = Math.min(low, l);
        high = Math.max(high, h);
      });

      const quotesLast200 = (aggregates ?? []).slice(-200);
      const ma200 = (quotesLast200.reduce((acc: number, curr: Agg) => acc + (curr?.c ?? 0), 0) / 200).toFixed(2);

      const quotesLast20 = aggregates.slice(-20);
      const ma20 = (quotesLast20.reduce((acc: number, curr: Agg) => acc + (curr?.c ?? 0), 0) / 20).toFixed(2);

      const currentPrice = (aggregates.slice(-1)[0]?.c ?? 0).toFixed(2);

      const avgVolume = (aggregates.reduce((acc: number, curr: Agg) => acc + (curr?.v ?? 0), 0) / aggregates.length).toFixed(0);

      const query = `
        INSERT OR REPLACE INTO moving_averages 
        (ticker, ma20, ma200, fifty_two_week_high, fifty_two_week_low, volume, date_string, daily_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

      console.info(`Add MA for ${ticker}`);
      await database.setData(query, [ticker, ma20, ma200, high, low, avgVolume, startDate, currentPrice]);


    } catch (err) {
      if ((err as any)?.status === 429) {
        await _sleep(60000); // or parse Retry-After header if available
        console.error('429 WAIT', err);
      } else {
        console.error(err);
      }
    } finally {
      await _sleep(SLEEP_AMT + Math.floor(Math.random() * 500)); // rate limit
    }
  }
}
