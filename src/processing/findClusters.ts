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

interface Database {
  getAllData<T = any>(query: string): Promise<T[]>;
}

/**
 * 
 * @param {number} clusterWindow Number of days to look at for clusters
 * @param {number} countThreshold Number of insiders that need to have made purchases
 */
export async function findClusterEvent(db: Database, clusterWindow: number = 7, countThreshold: number = 2): Promise<ClusterEvent[]> {

  const query = `
    WITH filtered AS (
      SELECT cik,
             owner_name,
             transaction_date,
             transaction_code,
             transaction_shares,
             conversion_exercise_price
      FROM form4_filings
      WHERE security_type = 'non-derivative'
        AND equity_swap_involved = 0
        AND is_option_exercise = 0
        AND is_from_exercise = 0
        AND is_exercise_related_sale = 0
        AND transaction_code IN ('P', 'S')
        AND transaction_date >= date('now', '-${clusterWindow} day')   
    ),
    ordered AS (
      SELECT *,
             julianday(transaction_date)
               - lag(julianday(transaction_date)) OVER (
                   PARTITION BY cik, transaction_code
                   ORDER BY transaction_date
                 ) AS gap_days
      FROM filtered
    ),
    grouped AS (
      SELECT *,
            SUM(CASE WHEN gap_days > 30 OR gap_days IS NULL THEN 1 ELSE 0 END)
            OVER (PARTITION BY cik, transaction_code ORDER BY transaction_date)
            AS cluster_id
      FROM ordered
    ),
  insider_avg AS (
    SELECT
      cik,
      transaction_code,
      cluster_id,
      owner_name,
      SUM(transaction_shares * conversion_exercise_price) / SUM(transaction_shares) AS insider_avg_price,
      SUM(transaction_shares) AS insider_total_shares,
      MIN(transaction_date) AS start_date,
      MAX(transaction_date) AS end_date
    FROM grouped
    GROUP BY cik, transaction_code, cluster_id, owner_name
  )
  SELECT
    i_a.cik,
    i.tickers,
    i_a.transaction_code,
    i_a.cluster_id,
    COUNT(DISTINCT i_a.owner_name) AS insider_count,
    SUM(i_a.insider_total_shares) AS total_shares,
    ROUND(SUM(i_a.insider_total_shares * i_a.insider_avg_price),2) AS total_value, 
    ROUND(AVG(i_a.insider_avg_price),2) AS avg_price_per_insider,
    ROUND(SUM(i_a.insider_avg_price * i_a.insider_total_shares) / SUM(i_a.insider_total_shares),2) AS vwavg_price_across_insiders,
    i_a.start_date,
    i_a.end_date
  FROM insider_avg AS i_a
  LEFT JOIN issuers AS i ON i_a.cik = i.cik
  GROUP BY i_a.cik, i_a.transaction_code, i_a.cluster_id
  HAVING insider_count >= ${countThreshold}
  
  ORDER BY insider_count DESC;
  `;


  const clusterData = await db.getAllData(query);
  return clusterData;
}