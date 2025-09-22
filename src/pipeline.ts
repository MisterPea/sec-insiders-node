import { apiRequest } from "./httpRequest.js";
import { AccessionBase, SecEntity } from "./types.js";

// Initial call to get company data
export async function getCikData(ciks: string[]): Promise<SecEntity[]> {
  return Promise.all(
    ciks.map((cik) => apiRequest({
      url: `https://data.sec.gov/submissions/CIK${cik}.json`,
      method: "GET",
      headers: {
        "User-Agent": "Unartful Labs (sysop@misterpea.me)",
        "Accept": "application/json"
      }
    }, { priority: 10 }
    ) as Promise<SecEntity>)
  );
}

// Build paths for Form 4 and 4A from accession numbers 
export function buildAccessionBase(jsonData: SecEntity): string[][] {
  const { cik, filings } = jsonData;
  const { recent } = filings;
  const { form, accessionNumber, primaryDocument } = recent;
  const formFourPaths = [];

  // Find Form 4 and create paths
  for (let i = 0; i < form.length; i += 1) {
    const currForm = form[i];
    if (currForm === '4' || currForm === '4/A') {
      const cikNum = Number(cik);
      const accNum = accessionNumber[i].replace(/-/g, '');
      const doc = primaryDocument[i].replace(/(xsl.*)(?:\/)/g, '');
      const url = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNum}/${doc}`;

      const base = [
        cik,
        accessionNumber[i],
        url,
      ];
      formFourPaths.push(base);
    }
  }
  return formFourPaths;
}

// Get XML data
export async function getXmlData(url: string): Promise<any> {
  return apiRequest({
    url: url,
    method: "GET",
    headers: {
      "User-Agent": "Unartful Labs (sysop@misterpea.me)",
      "Accept": "application/xml",
    },
    responseType: "text",
    transformResponse: [data => data]
  }, { priority: 10 }
  ) as Promise<any>;
}