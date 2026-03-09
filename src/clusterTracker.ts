const isoDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export async function updateCusterTracker(db: any) {
  const currentRecords = await db.getAllData(`
    SELECT cluster_id, cik, low_price, high_price, low_price_date, high_price_date
    FROM cluster_tracking`
  );

  for (const record of currentRecords) {
    const { cluster_id, cik, low_price, high_price, low_price_date, high_price_date } = record;

    const { daily_price } = await db.getData(`
      SELECT daily_price FROM moving_averages
      WHERE cik = ?
    `, [cik]);

    let newLow = low_price;
    let newHigh = high_price;
    let newLowDate = low_price_date;
    let newHighDate = high_price_date;

    if (daily_price < low_price) {
      newLow = daily_price;
      newLowDate = isoDate();
    } else if (daily_price > high_price) {
      newHigh = daily_price;
      newHighDate = isoDate();
    }

    try {
      await db.setData(`
        UPDATE cluster_tracking 
        SET low_price = ?, high_price = ?, low_price_date = ?, high_price_date = ?
        WHERE cluster_id = ?`,
        [newLow, newHigh, newLowDate, newHighDate, cluster_id]
      );
      console.info(`Updated cluster_tracking for ${cluster_id} - ${cik}`)

    } catch (err) {
      console.error(`Could not update tracking on ${cik}`);
    }
  }
}

interface ScopedClusterPost {
  ticker: string,
  cik: string,
  cluster_id: string;
  daily_price: number;
  purchase_or_sale: string;
}

async function _claimNextClusterPost(db: any): Promise<ScopedClusterPost | undefined> {
  const row = await db.getData(`
    WITH target AS (
      SELECT cluster_id
      FROM cluster_post
      WHERE is_tracked = 'pending'
      LIMIT 1
    )
    UPDATE cluster_post
    SET is_tracked = 'processing'
    WHERE cluster_id = (SELECT cluster_id FROM target)
    RETURNING
      cluster_id,
      ticker,
      cik,
      purchase_or_sale,
      (
        SELECT ma.daily_price
        FROM moving_averages ma
        WHERE ma.cik = cluster_post.cik
        LIMIT 1
      ) AS daily_price;
  `);
  return row;
}

export async function addClustersToTracker(db: any) {
  while (true) {
    const currRow = await _claimNextClusterPost(db);
    if (!currRow) return;

    const { cluster_id, cik, purchase_or_sale, ticker, daily_price } = currRow;

    try {
      await db.insertData(`
    INSERT OR REPLACE INTO cluster_tracking (
      cluster_id,
      tickers,
      cik,
      low_price,
      high_price,
      initial_price,
      purchase_or_sale,
      low_price_date,
      high_price_date,
      initial_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, DATE('now'), DATE('now'), DATE('now'))`,
        [[cluster_id, ticker, cik, daily_price, daily_price, daily_price, purchase_or_sale]]
      );

      await db.setData(`
      UPDATE cluster_post
      SET is_tracked = 'complete'
      WHERE cluster_id = ?  
    `, [cluster_id]);

      console.info(`Initiated tracking on ${cluster_id} - ${ticker} - ${cik}`);
    } catch (err) {

      console.error(err);
      await db.setData(`
      UPDATE cluster_post
      SET is_tracked = 'failed_to_track'
      WHERE cluster_id = ?  
    `, [cluster_id]);
    }
  }
}

