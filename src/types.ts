export interface SecEntity {
  cik: string;
  entityType: string;
  sic: string;
  sicDescription: string;
  ownerOrg: string;
  insiderTransactionForOwnerExists: number;
  insiderTransactionForIssuerExists: number;
  name: string;
  tickers: string[];
  exchanges: string[];
  ein: string;
  lei: string | null;
  description: string;
  website: string;
  investorWebsite: string;
  category: string;
  fiscalYearEnd: string;
  stateOfIncorporation: string;
  stateOfIncorporationDescription: string;
  addresses: {
    mailing: Address;
    business: Address;
  };
  phone: string;
  flags: string;
  formerNames: string[];
  filings: Filings;
}

export interface Address {
  street1: string;
  street2: string | null;
  city: string;
  stateOrCountry: string;
  zipCode: string;
  stateOrCountryDescription: string;
  isForeignLocation: number | null;
  foreignStateTerritory: string | null;
  country: string | null;
  countryCode: string | null;
}

export interface Filings {
  recent: RecentFilings;
  files: FilingFile[];
}

export interface RecentFilings {
  accessionNumber: string[];
  filingDate: string[];
  reportDate: (string | null)[];
  acceptanceDateTime: string[];
  act: string[];
  form: string[];
  fileNumber: (string | null)[];
  filmNumber: (string | null)[];
  items: (string | null)[];
  core_type: (string | null)[];
  size: (string | number)[];
  isXBRL: (boolean | number)[];
  isInlineXBRL: (boolean | number)[];
  primaryDocument: string[];
  primaryDocDescription: (string | null)[];
}

export interface FilingFile {
  name: string;
  filingCount: number;
  filingFrom: string;
  filingTo: string;
}

export type AccessionBase = {
  cik: string,
  accession: string,
  url: string
};