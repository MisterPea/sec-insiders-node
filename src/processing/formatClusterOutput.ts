import { title } from "process";
import { RawPurchaseOutput, RawSalesOutput } from "../types.js";

const formatDollars = (dollarFloat: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(dollarFloat);
const formatPercent = (pctFloat: number) => new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(pctFloat);
const singleTicker = (tickers: string) => tickers.split(', ')[0];
const dayFormat = (numDays: number, firstTransaction: string, lastTransaction: string) => numDays === 0 ? `1 day window (${lastTransaction})` : `${numDays + 1} day window (${firstTransaction} → ${lastTransaction})`;
const compactFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2
});

export function formatSalesOutput(sales: RawSalesOutput[]) {
  for (let i = 0; i < sales.length; i += 1) {
    const {
      cik,
      tickers,
      company_name,
      has_ten_percent_holder,
      num_days,
      first_transaction,
      last_transaction,
      total_shares,
      pct_sold,
      total_value,
      weighted_avg_price,
      num_owners,
      accessions,
      all_are_officers,
      mixed_officer_dir,
      owners,
      titles,
      ma200,
      off_ma200
    } = sales[i];

    const title = `Sales activity - ${company_name} (${singleTicker(tickers)}) | CIK:${cik}`;

    const dollarFormat = formatDollars(total_value);
    const pctFormat = formatPercent(pct_sold);
    const timePeriod = `Over a ${dayFormat(num_days, first_transaction, last_transaction)}, ${num_owners} insiders sold ${total_shares} shares, totaling ${dollarFormat}. These sales account for ${pctFormat} of their collective holdings.`;

    const movingAvgPctAbove = (): string => {
      const pct = off_ma200 / -100;
      const suffix = pct > 0 ? 'above' : 'below';
      const outputWithSuffix = `${formatPercent(pct)} ${suffix}`;
      return outputWithSuffix;
    };
    const sharePriceFormat = formatDollars(weighted_avg_price);
    const context = `The weighted average sale price was ${sharePriceFormat}/share - ${movingAvgPctAbove()} the 200-day MA.`;

    const titlesFormat = [...new Set(titles.split('**').map(item => item.trim()))].join(' / ');
    const titlesAndLinks = `The titles of the sellers are: ${titlesFormat}`;

    const linkArray = accessions.split(',').map((a) => {
      const accessionDash = a;
      const accessionTrim = a.replaceAll('-', '');
      const cikNum = Number(cik);
      const urlFormat = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionTrim}/${accessionDash}-index.html`;
      return urlFormat;
    });

    const aggregatedOutput = `
      ${title}
      ${timePeriod}
      ${context}
      ${titlesAndLinks}
      ${linkArray.join('\n')}
    `;

    console.log(aggregatedOutput);

    const summary = `
    ${singleTicker(tickers)} insider sales cluster detected
    ${num_owners} executives sold ${compactFormat.format(total_value)} in a ${num_days + 1}-day window
    Avg price +${movingAvgPctAbove()} vs 200-DMA
    `;
    console.log(summary);
  };
}


export function formatPurchaseOutput(purchases: RawPurchaseOutput[]) {
  for (let i = 0; i < purchases.length; i += 1) {
    const {
      cik,
      tickers,
      company_name,
      transaction_code,
      first_transaction,
      last_transaction,
      num_days,
      total_shares,
      total_value,
      weighted_avg_price,
      pct_increase,
      num_owners,
      accessions,
      all_are_directors,
      all_are_officers,
      owners,
      titles,
      off_ma20,
      off_ma200,
    } = purchases[i];

    const title = `Purchase activity - ${company_name} (${singleTicker(tickers)}) | CIK:${cik}`;

    const dollarFormat = formatDollars(total_value);
    const pctFormat = formatPercent(pct_increase);
    const timePeriod = `Over a ${dayFormat(num_days, first_transaction, last_transaction)}, ${num_owners} insiders purchased ${total_shares} shares, totaling ${dollarFormat}. This represents a ${pctFormat} increase in their collective holdings.`;

    const sharePriceFormat = formatDollars(weighted_avg_price);


    const movAvgOffset = () => {
      const off20ma = formatPercent(off_ma20 / 100);
      const off200ma = formatPercent(off_ma200 / 100);
      const off20suffix = off_ma20 < 0 ? 'above' : 'below';
      const off200suffix = off_ma200 < 0 ? 'above' : 'below';
      const off20Agg = `${off20ma} ${off20suffix} the 20-day MA`;
      const off200Agg = `${off200ma} ${off200suffix} the 200-day MA`;
      return { m20: off20Agg, m200: off200Agg };
    };
    const { m20, m200 } = movAvgOffset();
    const priceAverage = `The weighted average purchase price was ${sharePriceFormat}/share - ${m20} and ${m200}`;

    const titlesFormat = [...new Set(titles.split('**').map(item => item.trim()))].join(' / ');
    const titlesAndLinks = `The titles of the buyers are: ${titlesFormat}`;

    console.log(`
      ${title}
      ${timePeriod}
      ${priceAverage}
      ${titlesAndLinks}
      `);

    const summary = `
        ${singleTicker(tickers)} insider buying cluster observed
        ${num_owners} executives increased their holdings by ${pctFormat} in a ${num_days + 1}-day window
        Avg price ${m200}
        `;
    console.log(summary);
  }

};

