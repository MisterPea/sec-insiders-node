import { Database, RawPurchaseOutput } from "../types.js";

/**
 * Finds purchase cluster events over a period window. The output excludes 10b5-1(predetermined) transactions
 * @param {number} clusterWindow Number of days to look at for clusters
 * @param {number} countThreshold Number of insiders that need to have made purchases
 */
export async function findClusterPurchases(db: Database, clusterWindow: number = 7, countThreshold: number = 2): Promise<RawPurchaseOutput[]> {
  const query = `
      WITH per_owner AS (
        SELECT
          t.cik,
          t.transaction_code,
          UPPER(t.owner_name) AS owner_name,
          MAX(NULLIF(TRIM(t.officer_title), '')) AS officer_title
        FROM form4_filings t
        WHERE t.transaction_date >= DATE('now', '-${clusterWindow} days')
          AND t.transaction_code = 'P'
          AND t.equity_swap_involved = 0
          AND t.is_option_exercise = 0
          AND t.is_from_exercise = 0
          AND t.is_exercise_related_sale = 0
          AND t.ten5_1 = 0
        GROUP BY t.cik, t.transaction_code, UPPER(t.owner_name)
      ),
      aggregated_data AS (
        SELECT 
          t.cik,
          i.tickers,
          i.company_name,
          t.transaction_code,
          MIN(t.transaction_date) AS first_transaction,
          MAX(t.transaction_date) AS last_transaction,
          JULIANDAY(MAX(t.transaction_date)) - JULIANDAY(MIN(t.transaction_date)) AS num_days,
          SUM(t.transaction_shares) AS total_shares,
          SUM(t.transaction_shares * t.conversion_exercise_price) AS total_value,
          SUM(t.transaction_shares * t.conversion_exercise_price) / SUM(t.transaction_shares) AS weighted_avg_price,

          CASE
            WHEN SUM(t.sec_owned_post_trx) - SUM(t.transaction_shares) <= 0 THEN NULL
            ELSE SUM(t.transaction_shares) * 1.0
                / (SUM(t.sec_owned_post_trx) - SUM(t.transaction_shares))
          END AS pct_increase,

          MAX(t.is_ten_percent) AS has_ten_percent_owners,
          COUNT(DISTINCT t.owner_name) AS num_owners,
          GROUP_CONCAT(DISTINCT t.accession) AS accessions,
          MIN(t.is_director) AS all_are_directors,
          MIN(t.is_officer) AS all_are_officers,

          -- ✅ counts distinct owners whose *per-owner* title is NULL
        COUNT(DISTINCT CASE
          WHEN p.officer_title IS NULL THEN p.owner_name
          END) AS num_null_titles,

          GROUP_CONCAT(UPPER(t.owner_name), ' ** ') AS owners,
          GROUP_CONCAT(UPPER(NULLIF(TRIM(t.officer_title), '')), ' ** ') AS titles

        FROM form4_filings t
        JOIN issuers i ON t.cik = i.cik
        JOIN per_owner p
          ON p.cik = t.cik
        AND p.transaction_code = t.transaction_code
        AND p.owner_name = UPPER(t.owner_name)

        -- ✅ re-apply the same filters here, otherwise your aggregation is wrong
        WHERE t.transaction_date >= DATE('now', '-${clusterWindow} days')
          AND t.transaction_code = 'P'
          AND t.equity_swap_involved = 0
          AND t.is_option_exercise = 0
          AND t.is_from_exercise = 0
          AND t.is_exercise_related_sale = 0
          AND t.ten5_1 = 0

        GROUP BY t.cik, t.transaction_code
      )
      SELECT
        aggregated_data.*,

        CASE
          WHEN ma20 IS NULL OR ma20 = 0 THEN NULL
          ELSE ((ma20 - weighted_avg_price) * 100.0 / ma20)
        END AS off_ma20,

        CASE
          WHEN ma200 IS NULL OR ma200 = 0 THEN NULL
          ELSE ((ma200 - weighted_avg_price) * 100.0 / ma200)
        END AS off_ma200

      FROM aggregated_data
      JOIN moving_averages ma ON aggregated_data.tickers = ma.ticker

      WHERE num_owners >= ${countThreshold}
        AND weighted_avg_price < ma20
        AND weighted_avg_price < ma200

    ORDER BY num_owners, total_value DESC;
  `;
  const clusterPurchases = await db.getAllData(query);
  return clusterPurchases;
}

/**
 * Finds sales cluster events over a period window. The output excludes 10b5-1(predetermined) transactions
 * @param {number} clusterWindow Number of days to look at for clusters
 * @param {number} countThreshold Number of insiders that need to have made purchases
 */
export async function findClusterSales(db: Database, clusterWindow: number = 7, countThreshold: number = 2): Promise<ClusterEvent[]> {
  const query = `
  WITH aggregated_data AS (
    SELECT 
      t.cik,
      i.tickers,
      i.company_name,
      t.transaction_code,
      MIN(t.is_ten_percent) AS has_ten_percent_holder,
      JULIANDAY(MAX(t.transaction_date)) - JULIANDAY(MIN(t.transaction_date)) AS num_days,
      MIN(t.transaction_date) AS first_transaction,
      MAX(t.transaction_date) AS last_transaction,
      SUM(t.transaction_shares) AS total_shares,

      -- calculate percent of holdings sold
      CASE
        WHEN SUM(t.transaction_shares + t.sec_owned_post_trx) = 0 THEN NULL
        ELSE
        SUM(t.transaction_shares) * 1.0 / SUM(t.transaction_shares + t.sec_owned_post_trx) END AS pct_sold,
      SUM(t.transaction_shares * t.conversion_exercise_price) AS total_value,
      SUM(t.transaction_shares * t.conversion_exercise_price) / SUM(t.transaction_shares) AS weighted_avg_price,
      COUNT(DISTINCT t.owner_name) AS num_owners,
      GROUP_CONCAT(DISTINCT t.accession) AS accessions,
      MIN(t.is_officer) AS all_are_officers,

      -- "mixed officer/director" flag: 1 if any officer and any director exist in the cluster
      CASE
        WHEN MAX(t.is_officer) = 1 AND MAX(t.is_director) = 1 THEN 1
        ELSE 0
      END AS mixed_officer_dir,
      MAX(is_ten_percent) AS has_ten_percent_owners,
      GROUP_CONCAT(UPPER(t.owner_name), ' ** ') AS owners,
      GROUP_CONCAT(UPPER(t.officer_title),' ** ') AS titles

    FROM form4_filings t
    JOIN issuers i ON t.cik = i.cik
    WHERE t.transaction_date >= DATE('now', '-${clusterWindow} days') 
      AND t.transaction_code = 'S'
      AND t.equity_swap_involved = 0
      AND t.is_option_exercise = 0
      AND t.is_from_exercise = 0
      AND t.is_exercise_related_sale = 0
      AND t.ten5_1 = 0

      -- keep only rows with a title to evaluate
      AND t.officer_title IS NOT NULL
      AND TRIM(t.officer_title) <> ''

      -- exclude titles matching ANY pattern in the exclusion table
      AND NOT EXISTS (
        SELECT 1
        FROM excluded_officer_titles e
        WHERE UPPER(t.officer_title) LIKE '%' || UPPER(e.title) || '%'
      )
      GROUP BY t.cik, t.transaction_code
      HAVING MIN(t.is_director) <> 1
      )
      -- aggregate output
      SELECT
        aggregated_data.*,
        ma.ma200,
        CASE
          WHEN ma.ma200 IS NULL OR ma.ma200 = 0 THEN NULL
          ELSE ((ma.ma200 - weighted_avg_price) * 100.0 / ma.ma200)
          END AS off_ma200
        FROM aggregated_data
        JOIN moving_averages ma ON aggregated_data.tickers = ma.ticker
        WHERE num_owners >= ${countThreshold}
          AND weighted_avg_price > ma.ma200
        ORDER BY pct_sold DESC, total_value DESC;
  `;
  const clusterSales = await db.getAllData(query);
  return clusterSales;
}

export async function findRepeatTransactions(db: Database, clusterWindow: number, countThreshold: number) {
  const query = `
      WITH aggregated_data AS (
        SELECT 
          t.cik,
          i.tickers,
          i.company_name,
          t.transaction_code,
          t.owner_name,
          COUNT(DISTINCT t.accession) AS tot_transactions,
          MIN(t.transaction_date) AS first_transaction,
          MAX(t.transaction_date) AS last_transaction,
          SUM(t.transaction_shares) AS total_shares,
          t.sec_owned_post_trx AS shares_owned_post_transaction,
          SUM(t.transaction_shares * t.conversion_exercise_price) AS total_value,
          -- multiply by 1.0 to force float division in SQLite
          SUM(t.transaction_shares * t.conversion_exercise_price) * 1.0 
            / SUM(t.transaction_shares) AS weighted_avg_price,
          GROUP_CONCAT(DISTINCT t.accession) AS accessions
        FROM form4_filings t
        JOIN issuers i ON t.cik = i.cik
        WHERE t.transaction_date >= DATE('now', '-${clusterWindow} days')
          AND t.equity_swap_involved = 0
          AND t.is_option_exercise = 0
          AND t.is_from_exercise = 0
          AND t.is_exercise_related_sale = 0
          AND t.ten5_1 = 0
          AND t.transaction_code IN ('P','S')
          AND t.owner_name <> '' -- if owner_name === ''
        GROUP BY 
          t.cik,
          t.owner_name,
          t.transaction_code
      )
      SELECT *
      FROM aggregated_data
      WHERE tot_transactions >= ${countThreshold}
      ORDER BY total_value DESC;
  `;

  const clusterData = await db.getAllData(query);
  return clusterData;
}