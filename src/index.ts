import { buildAccessionBase, getCikData, getXmlData } from "./pipeline.js";
import sp500_cik from "./sp500_CIK.js";
import { DB } from "./sqlite.js";
import { AccessionBase, SecEntity } from "./types.js";
import { xml2js, xml2json } from 'xml-js';
import { XMLParser } from 'fast-xml-parser';

const db = new DB();

async function getInitialData() {
  // Get initial data array
  const cikDataArray: SecEntity[] = await getCikData(sp500_cik);

  cikDataArray.forEach((company) => {
    // Insert data into db
    db.insertCompanyData(company);

    // Build accession/XML - insert into form queue
    const accessionPaths: AccessionBase[] = buildAccessionBase(company);
    db.insertForm4Paths(accessionPaths);
  });
}

async function processXmlUrls() {
  const documentData = db.getFirstPending();
  if (documentData) {
    const { url, accession, } = documentData;
    const xmlData = await getXmlData(url);
    const parser = new XMLParser({ ignoreDeclaration: true });
    const { ownershipDocument } = parser.parse(xmlData);
    const flatJson = flattenTree(ownershipDocument);

    // Data possibly in form 4
    const possibleFormData = [
      'issuerCik',
      'rptOwnerName',
      'periodOfReport',
      'documentType',
      'aff10b5One',
      'isOfficer',
      'isDirector',
      'isOther',
      'officerTitle',
      'isTenPercentOwner',
      'nonDerivativeTransaction',
      'derivativeTransaction',
      'footnotes'
    ];

    const availableFormData = Object.keys(flatJson);
    const overlapFormData = availableFormData.filter((k) => possibleFormData.includes(k));
    // const  = parseJson(flatJson, overlapFormData);
    console.log(flatJson);

  }
}

// Flattens json tree and normalizes possible array values 
function flattenTree(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};

  for (var [key, value] of Object.entries(obj)) {

    // if last key is value - make it previous key
    let newKey = prefix;
    if (key !== 'value') {
      newKey = key;
    }

    // Normalize transactions and footnotes to be arrays
    if (key === 'derivativeTransaction' || key === 'nonDerivativeTransaction' || key === 'footnotes') {
      // if not array
      if (!Array.isArray(value)) {
        value = [value];
      }
      // flatten object array
      result[newKey] = (value as any[]).map((e: any) => flattenTree(e));
    }

    else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenTree(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}



// await getInitialData();
processXmlUrls()

