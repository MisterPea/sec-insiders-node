import { Database } from "../types.js";

/**
 * 
 * @param {number} clusterWindow Number of days to look at for clusters
 * @param {number} countThreshold Number of insiders that need to have made purchases
 */

interface ClusterEvent {
  cik: string;
  transaction_code: string;
  insider_count: number;
  total_shares: number;
  start_date: string;
  end_date: string;
}

/**
 * Finds cluster events over a period window. The output excludes 10b5-1(predetermined) transactions
 * @param {number} clusterWindow Number of days to look at for clusters
 * @param {number} countThreshold Number of insiders that need to have made purchases
 */
export async function findClusterEventAvg(db: Database, clusterWindow: number = 7, countThreshold: number = 2): Promise<ClusterEvent[]> {
  const query = `
    WITH aggregated_data AS (
        SELECT 
          t.cik,
          i.tickers,
          t.transaction_code,
          MIN(t.transaction_date) AS first_transaction,
          MAX(t.transaction_date) AS last_transaction,
          SUM(t.transaction_shares) AS total_shares,
          SUM(t.transaction_shares * t.conversion_exercise_price) AS total_value,
          SUM(t.transaction_shares * t.conversion_exercise_price) / SUM(t.transaction_shares) AS weighted_avg_price,
          COUNT(DISTINCT t.owner_name) AS num_owners,
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
       GROUP BY t.cik, t.transaction_code
    )
    SELECT *
    FROM aggregated_data
    WHERE num_owners >= ${countThreshold}
    ORDER BY num_owners, total_value DESC
  `;


  const clusterData = await db.getAllData(query);
  return clusterData;
}

export async function findRepeatTransactions(db: Database, clusterWindow: number, countThreshold: number) {
  const query = `
      WITH aggregated_data AS (
        SELECT 
          t.cik,
          i.tickers,
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