import { getCikData } from "./pipeline.js";
import sp500_cik from "./sp500_CIK.js";
import { DB } from "./sqlite.js";
import { SecEntity } from "./types.js";

const db = new DB()

async function getInitialData() {
  // Get initial data array
  const cikDataArray: SecEntity[] = await getCikData(sp500_cik);

  // Insert data into db
  cikDataArray.forEach((company) =>  db.insertCompanyData(company))


}


getInitialData()