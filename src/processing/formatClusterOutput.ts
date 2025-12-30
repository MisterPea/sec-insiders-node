import { ClusterInput, FormatOutput, HtmlStringData, RawPurchaseOutput, RawSalesOutput } from "../types.js";
import crypto from 'node:crypto';

// Format float into dollar-denominated string
const formatDollars = (dollarFloat: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(dollarFloat);

// Format float (0-1) into a percent-suffixed string
const formatPercent = (pctFloat: number) => new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(pctFloat);

// Find the first ticker if a string contains multiple, comma-separated strings
const singleTicker = (tickers: string) => tickers.split(', ')[0];

// Determine if we show a single date or a start *and* end date 
const dayFormat = (firstTransaction: string, lastTransaction: string) => firstTransaction === lastTransaction ? lastTransaction : `${firstTransaction} → ${lastTransaction}`;

// Takes a string of comma-separated accessions and returns an array or accession strings
const createAccessionLinkArray = (accessions: string, cik: string): string[] => {
  return accessions.split(',').map((a) => {
    const accessionDash = a;
    const accessionTrim = a.replaceAll('-', '');
    const cikNum = Number(cik);
    const urlFormat = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionTrim}/${accessionDash}-index.html`;
    return urlFormat;
  });
};

function makeClusterId(input: ClusterInput) {
  const { cik, clusterVersion, accessions, first_transaction, last_transaction, transactionCode } = input;

  const normalizeAccession = (a: string) => a.trim().replace(/-/g, "");

  const accessionArray = accessions.split(',');

  const sortedAccessions = [...new Set(accessionArray.map(normalizeAccession))].sort();

  const canonical = JSON.stringify({
    v: clusterVersion,
    cik: cik,
    tc: transactionCode,
    first: first_transaction,
    last: last_transaction,
    acc: sortedAccessions,
  });
  const hash = crypto.createHash("sha256").update(canonical).digest("hex");
  return hash;
}

// Format float into a compact dollar-denominated string
const compactFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2
});

/**
 * Converter of raw sales data into info that can be converted to html
 * @param {Array<RawSalesOutput>} sales Array of sales data
 * @returns {Array<FormatOutput>}
 */
export function formatSalesOutput(sales: RawSalesOutput[]): FormatOutput[] {
  const outputArray: FormatOutput[] = [];
  for (let i = 0; i < sales.length; i += 1) {
    const {
      cik,
      tickers,
      company_name,
      // transaction_code,
      // has_ten_percent_holder,
      num_days,
      first_transaction,
      last_transaction,
      total_shares,
      pct_sold,
      total_value,
      weighted_avg_price,
      num_owners,
      accessions,
      // all_are_officers,
      // mixed_officer_dir,
      // owners,
      titles,
      // ma200,
      off_ma200
    } = sales[i];

    const pctFormat = formatPercent(pct_sold);

    const movingAvgPctAbove = (): string => {
      const pct = off_ma200 / -100;
      const suffix = pct > 0 ? 'above' : 'below';
      const outputWithSuffix = `${formatPercent(pct)} ${suffix}`;
      return outputWithSuffix;
    };

    const sharePriceFormat = formatDollars(weighted_avg_price);

    const context = `The weighted average sale price was ${sharePriceFormat}/share - ${movingAvgPctAbove()} the 200-day MA.`;

    const titlesFormat = [...new Set(titles.split('**').map(item => item.trim()))].join(' / ');

    const aggregatedOutput: HtmlStringData = {
      companyName: company_name,
      ticker: singleTicker(tickers),
      cik: cik,
      pctOfHoldings: pctFormat,
      windowSize: num_days + 1,
      dateStrings: dayFormat(first_transaction, last_transaction),
      numInsiders: num_owners,
      numShares: total_shares,
      titles: titlesFormat,
      weightAvgLine: context,
      totalValue: compactFormat.format(total_value)
    };

    const accessionArray = createAccessionLinkArray(accessions, cik);
    const twitterHtml = createHtmlString(aggregatedOutput, false, true);
    const blueskyHtml = createHtmlString(aggregatedOutput, false, false);

    const clusterInput: ClusterInput = {
      cik,
      ticker: singleTicker(tickers),
      first_transaction,
      last_transaction,
      accessions,
      clusterVersion: 'v1',
      transactionCode: 'S'
    };
    const clusterId = makeClusterId(clusterInput);
    outputArray.push({ twitterHtml, blueskyHtml, accessions: JSON.stringify(accessionArray), clusterId, ticker: singleTicker(tickers), purchaseOrSale: 'S' });
  };
  return outputArray;
}

/**
 * Converter of raw purchase data into info that can be converted to html
 * @param {Array<RawPurchaseOutput>} purchases Array of purchase data
 * @returns {Array<FormatOutput>}
 */
export function formatPurchaseOutput(purchases: RawPurchaseOutput[]): FormatOutput[] {
  const outputArray: FormatOutput[] = [];
  for (let i = 0; i < purchases.length; i += 1) {
    const {
      cik,
      tickers,
      company_name,
      // transaction_code,
      first_transaction,
      last_transaction,
      num_days,
      total_shares,
      total_value,
      weighted_avg_price,
      pct_increase,
      num_owners,
      accessions,
      num_null_titles,
      // all_are_directors,
      // all_are_officers,
      // owners,
      titles,
      off_ma20,
      off_ma200,
    } = purchases[i];

    const pctFormat = formatPercent(pct_increase);

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

    const titlesArray = [...new Set(titles.split('**').map(item => item.trim()))];
    const nullAdditions = num_null_titles > 0 ? `${num_null_titles} UNNAMED INSIDERS` : '';
    const titlesFormat = [...titlesArray, nullAdditions].join(' / ');

    const aggregatedOutput: HtmlStringData = {
      companyName: company_name,
      ticker: singleTicker(tickers),
      cik: cik,
      pctOfHoldings: pctFormat,
      windowSize: num_days + 1,
      dateStrings: dayFormat(first_transaction, last_transaction),
      numInsiders: num_owners,
      numShares: total_shares,
      titles: titlesFormat,
      weightAvgLine: priceAverage,
      totalValue: compactFormat.format(total_value)
    };

    const accessionArray = createAccessionLinkArray(accessions, cik);
    const twitterHtml = createHtmlString(aggregatedOutput, true, true);
    const blueskyHtml = createHtmlString(aggregatedOutput, true, false);

    const clusterInput: ClusterInput = {
      cik,
      ticker: singleTicker(tickers),
      first_transaction,
      last_transaction,
      accessions,
      clusterVersion: 'v1',
      transactionCode: 'P'
    };

    const clusterId = makeClusterId(clusterInput);
    outputArray.push({ twitterHtml, blueskyHtml, accessions: JSON.stringify(accessionArray), clusterId, ticker: singleTicker(tickers), purchaseOrSale: 'P' });
  }
  return outputArray;
};

/**
 * Function to create a html-string of output from data found from formatSaleOutput/formatPurchaseOutput
 * @param {HtmlStringData} documentInfo Data derived from formatSaleOutput and formatPurchaseOutput
 * @param {boolean} isPurchase Boolean flag to denote whether the transactions are purchases or not
 * @param {boolean} isTwitter Boolean flag to denote whether output is intended for twitter ot not
 * @returns {string} Returns a string version of the html document
 */
function createHtmlString(documentInfo: HtmlStringData, isPurchase: boolean = false, isTwitter: boolean = true): string {
  const {
    companyName,
    ticker,
    cik,
    windowSize,
    dateStrings,
    numInsiders,
    numShares,
    totalValue,
    titles,
    pctOfHoldings,
    weightAvgLine
  } = documentInfo;

  const windowStart = windowSize === 1 ? 'In' : 'Over';
  const socialHandle = isTwitter ? '@insider_tape' : '@insider-tape';
  const aOrAn = [8, 11, 18].includes(windowSize) ? 'an' : 'a';

  const doc = (() => {
    var title = 'SALES ACTIVITY:';
    var purchaseSold = 'sold';
    var buyerSeller = 'sellers';
    var amtOfHoldings = `<p>These sales account for <span class="accent">${pctOfHoldings}</span> of their collective holdings.</p>`;
    if (isPurchase) {
      title = 'PURCHASE ACTIVITY:';
      purchaseSold = 'purchased';
      buyerSeller = 'buyers';
      amtOfHoldings = `<p>This represents a <span class="accent">${pctOfHoldings}</span> increase in their collective holdings.</p>`;
    }
    return { title, purchaseSold, buyerSeller, amtOfHoldings };
  })();

  const htmlFrame = `
    <!DOCTYPE html>
    <html lang="en">

    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Document</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link
        href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@100..1000&family=Google+Sans+Flex:ROND@0..100&display=swap"
        rel="stylesheet">
        <style>
          :root {
            --black: #1b1b1b;
            --dark-blue: #12374b;
            --dark-blue-accent: #05283a;
          }

          html {
            font-size: 2vw;
          }

          body {
            aspect-ratio: 3 / 2;
            overflow: hidden;
            font-family: "Google Sans Flex", sans-serif;
            font-optical-sizing: auto;
            font-style: normal;
            font-variation-settings: "slnt" 0, "GRAD" 0, "ROND" 25;
          }

          body:has(.bluesky) {
            aspect-ratio: 4 / 3;
          }

          *,
          html,
          body {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            color: var(--dark-blue);
          }

          .bold {
            font-weight: 650;
          }

          .semibold {
            font-weight: 600;
          }

          .accent {
            font-weight: 550;
            color: var(--dark-blue-accent)
          }

          .cik {
            font-weight: 200;
            opacity: 0.8;
          }

          .regular {
            font-weight: 400;
          }

          .main-content {
            padding: 1.5rem;
            height: 100%;
            width: auto;
            position: relative;
            background-color: rgb(246, 246, 246);
            overflow: hidden;

            /* Honeycomb */
            background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 86.2443 97.6668"><path opacity="0.125" d="M43.1221,1c.9121,0,1.8118.2411,2.6018.6972l36.9185,21.3148c1.6049.9266,2.6018,2.6534,2.6018,4.5065v42.6297c.0001,1.8531-.9969,3.5799-2.6017,4.5065l-36.9184,21.315c-.79.4561-1.6897.6972-2.6018.6972s-1.8119-.2411-2.6018-.6971L3.6019,74.6548c-1.6049-.9266-2.6018-2.6534-2.6018-4.5065V27.5186c-.0001-1.8531.9969-3.5799,2.6017-4.5065L40.5202,1.6972c.79-.4561,1.6897-.6972,2.6019-.6972M43.1221,0c-1.0712,0-2.142.277-3.1019.8311L3.1018,22.1461c-1.9194,1.1082-3.1018,3.1562-3.1018,5.3725v42.6297c.0001,2.2163,1.1825,4.2643,3.1019,5.3725l36.9185,21.3148c.9596.554,2.0309.8311,3.1018.8311s2.142-.277,3.1018-.8311l36.9184-21.315c1.9194-1.1082,3.1018-3.1562,3.1018-5.3725V27.5184c-.0001-2.2163-1.1825-4.2643-3.1019-5.3725L46.2239.8311c-.9596-.554-2.0309-.8311-3.1018-.8311h0Z"/></svg>');
            background-size: 7rem 7.5rem;
            background-position: 10rem;
            background-repeat: repeat;
          }

          .title {
            background-color: var(--dark-blue-accent);
            padding: 0.75rem 1rem 0;
            color: #fff;
            width: fit-content;
            letter-spacing: 5%;
            font-size: 1.25rem;
            border-bottom-right-radius: -2rem;
          }

          .bluesky>.title {
            font-size: 1.5rem;
          }

          .company-title {
            color: #fff;
            background-color: var(--dark-blue-accent);
            padding: 1rem;
            border-bottom-left-radius: 1.25rem;
            border-bottom-right-radius: 1.25rem;
            border-top-right-radius: 1.25rem;
          }

          .bluesky>.company-title {
            font-size: 2.25rem;
          }

          .company-title span {
            color: #fff;
          }

          .main-content.purchase .title,
          .main-content.purchase .company-title,
          .main-content.purchase .company-title span {
            background-color: #29a25c;
            color: #fff;
          }

          .info-text {
            background: linear-gradient(180deg, rgba(246, 246, 246, 1) 0%, rgba(246, 246, 246, 1) 50%, rgba(246, 246, 246, 0) 100%);
            height: 100%;
            width: 100vw;
            margin: 0 -1.5rem;
            padding: 0 1.5rem;
          }

          p {
            padding-top: 1.125rem;
            font-size: 1.65rem;
            text-wrap: balance;
          }

          .bluesky p {
            font-size: 1.7rem;
            text-wrap-style: stable;
          }

          .footer-wrap {
            width: 100%;
            display: flex;
            justify-content: flex-end;
            position: absolute;
            bottom: 0;
            right: 1.5rem;
          }

          .footer {
            font-size: 0.9rem;
            padding: 0.25rem 0.5rem;
            font-weight: 300;
            letter-spacing: 3%;
            color: var(--black);
            background-color: #fff;
            width: fit-content;
          }
        </style>
    </head>

    <body>
      <div class="main-content${isPurchase ? ' purchase' : ''}${isTwitter ? '' : ' bluesky'}">
        <h1 class="title semibold">${doc.title}</h1>
        <h1 class="company-title bold">${companyName} <span class="semibold">(${ticker})</span> <span class="semibold cik">CIK:${cik}</span>
        </h1>
        <div class="info-text regular">
          <p>${windowStart} ${aOrAn} ${windowSize} day window (${dateStrings}), 
          <span class="accent">${numInsiders} insiders</span> ${doc.purchaseSold} <span class="accent">${numShares >> 0} shares</span>, totaling <span class="accent">${totalValue}</span>.</p>
          ${doc.amtOfHoldings}
          <p>${weightAvgLine}</p>
          <p>The titles of the ${doc.buyerSeller} are: <span class="accent">${titles}</span></p>
        </div>
        <div class="footer-wrap">
          <footer class="regular footer">UNARTFUL LABS • ${socialHandle}</footer>
        </div>
      </div>
    </body>
  </html>
  `;

  return htmlFrame;
}


