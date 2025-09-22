import { buildAccessionBase, getCikData, getXmlData } from "./pipeline.js";
import sp500_cik from "./sp500_CIK.js";
// import { DB } from "./sqlite-dont-use.js";
import { AccessionBase, SecEntity } from "./types.js";
import { XMLParser } from 'fast-xml-parser';
import { DB } from "./db/DB.js";

const db = new DB();

async function getInitialData() {
  // Get initial data array
  const cikDataArray: SecEntity[] = await getCikData(sp500_cik);
  const issuers: string[][] = [];
  const accessionArray: string[][] = [];

  cikDataArray.forEach((issuer) => {
    issuers.push([issuer.cik, issuer.tickers.join(', '), issuer.name.toUpperCase(), issuer.sic, issuer.sicDescription]);
    const accessionElement = buildAccessionBase(issuer);
    accessionArray.push(...accessionElement);
  });

  await db.insertData(`
    INSERT OR REPLACE INTO issuers (cik, tickers, company_name, sic, sic_description)
    VALUES (?, ?, ?, ?, ?)`,
    issuers
  );

  await db.insertData(`
    INSERT OR REPLACE INTO form4_jobs (cik, accession, url)
    VALUES (?, ?, ?)`,
    accessionArray
  );



  // const issuersArray = cikDataArray.map((issuer) => (
  //   [issuer.cik, issuer.tickers.join(', '), issuer.name.toUpperCase(), issuer.sic, issuer.sicDescription]
  // ));

  // await db.insertData(`
  //   INSERT OR REPLACE INTO issuers (cik, tickers, company_name, sic, sic_description)
  //   VALUES (?, ?, ?, ?, ?)`,
  //   issuersArray
  // )
}







// cikDataArray.forEach((company) => {
//   // Insert data into db
//   db.insertCompanyData(company);

//   // Build accession/XML - insert into form queue
//   const accessionPaths: AccessionBase[] = buildAccessionBase(company);
//   db.insertForm4Paths(accessionPaths);
// });

// async function processXmlUrls() {
//   const documentData = db.getFirstPending();
//   if (documentData) {
//     const { url, accession, } = documentData;
//     const xmlData = await getXmlData(url);
//     const parser = new XMLParser({ ignoreDeclaration: true });
//     const { ownershipDocument } = parser.parse(xmlData);
//     const flatJson = flattenTree(ownershipDocument);

//     // Data possibly in form 4 with defaults
//     const formData = {
//       'accession': accession,
//       'issuerCik': 0,
//       'rptOwnerName': '',
//       'periodOfReport': '',
//       'documentType': 4,
//       'aff10b5One': 0,
//       'isOfficer': 0,
//       'isDirector': 0,
//       'isOther': 0,
//       'officerTitle': null,
//       'isTenPercentOwner': 0,
//       'nonDerivativeTransaction': [],
//       'derivativeTransaction': [],
//       'footnotes': []
//     };

//     Object.keys(formData).forEach((key: string) => {
//       if (flatJson[key]) {
//         (formData as any)[key] = flatJson[key];
//       }
//     });
//     // console.log(db.insertIndividualForm4(formData));
//     db.insertIndividualForm4(formData);
//   }
// }

// // Flattens json tree and normalizes possible array values 
// function flattenTree(obj: any, prefix = ''): Record<string, any> {
//   const result: Record<string, any> = {};

//   for (var [key, value] of Object.entries(obj)) {

//     // if last key is value - make it previous key
//     let newKey = prefix;
//     if (key !== 'value') {
//       newKey = key;
//     }

//     // Normalize transactions and footnotes to be arrays
//     if (key === 'derivativeTransaction' || key === 'nonDerivativeTransaction' || key === 'footnotes') {
//       // if not array
//       if (!Array.isArray(value)) {
//         value = [value];
//       }
//       // flatten object array
//       result[newKey] = (value as any[]).map((e: any) => flattenTree(e));
//     }

//     else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
//       Object.assign(result, flattenTree(value, newKey));
//     } else {
//       result[newKey] = value;
//     }
//   }
//   return result;
// }



await getInitialData();
// processXmlUrls()

