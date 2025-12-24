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
  url: string;
};

export type DerivativeTransaction = {
  securityTitle: string;
  conversionOrExercisePrice?: number | null;
  transactionDate: string;
  transactionFormType?: number | string;
  transactionCode: string; // 'M', etc.
  equitySwapInvolved?: number | string;
  transactionTimeliness?: string; // often '' or 'I'
  transactionShares: number;
  transactionPricePerShare?: number;
  transactionAcquiredDisposedCode?: 'A' | 'D';
  exerciseDate?: string | null;
  expirationDate?: string | null;
  underlyingSecurityTitle?: string | null;
  underlyingSecurityShares?: number | null;
  sharesOwnedFollowingTransaction?: number | null;
  directOrIndirectOwnership?: 'D' | 'I' | null;
};

export type nonDerivativeTransaction = {
  securityTitle: string;
  transactionDate: string;
  transactionFormType?: number | string;
  transactionCode: string; // 'S', 'A', etc.
  equitySwapInvolved?: number | string;
  transactionTimeliness?: string;
  transactionShares: number;
  transactionPricePerShare?: number; // not stored in schema
  transactionAcquiredDisposedCode?: 'A' | 'D';
  sharesOwnedFollowingTransaction?: number | null;
  directOrIndirectOwnership?: 'D' | 'I' | null;
};

export type nonDerivativeHolding = {
  securityTitle: string;
  footnoteId?: string;
  sharesOwnedFollowingTransaction: number | null;
  directOrIndirectOwnership: 'D' | 'I' | null;
};

export type DerivativeHolding = {
  securityTitle: string;
  conversionOrExercisePrice?: number | null;
  exerciseDate?: string | null;
  expirationDate?: string | null;
  underlyingSecurityTitle?: string | null;
  underlyingSecurityShares?: number | null;
  sharesOwnedFollowingTransaction?: number | null;
  directOrIndirectOwnership: 'D' | 'I' | null;
  natureOfOwnership: string | null;
  footnoteId?: string | null;
};

export type Form4Parsed = {
  accession: string;
  issuerCik: number | string;
  rptOwnerName: string;
  periodOfReport: string;           // 'YYYY-MM-DD'
  documentType: string | number;    // '4' or '4/A' (sometimes number 4)
  aff10b5One?: number | boolean;    // 0/1
  isOfficer?: number | boolean;
  isDirector?: number | boolean;
  isOther?: number | boolean;
  officerTitle?: string | null;
  isTenPercentOwner?: number | boolean;
  derivativeTransaction?: DerivativeTransaction[];
  nonDerivativeTransaction?: nonDerivativeTransaction[];
};

export interface Database {
  getAllData<T = any>(query: string): Promise<T[]>;
  setData<T = any>(query: string, []): Promise<T>;
  insertData<T = any>(query: string, []): Promise<T>;
}

export type RawSalesOutput = {
  cik: string;
  tickers: string;
  company_name: string;
  transaction_code: string;
  has_ten_percent_holder: number,
  num_days: number,
  first_transaction: string;
  last_transaction: string;
  total_shares: number,
  pct_sold: number, // zero-led decimal
  total_value: number,
  weighted_avg_price: number,
  num_owners: number,
  accessions: string; // comma-delineated accession
  all_are_officers: number,
  mixed_officer_dir: number,
  owners: string;
  titles: string;
  ma200: number,
  off_ma200: number; // negative number
};

export type RawPurchaseOutput = {
  cik: string,
  tickers: string,
  company_name: string,
  transaction_code: string,
  first_transaction: string,
  last_transaction: string,
  num_days: number,
  total_shares: number,
  total_value: number,
  weighted_avg_price: number,
  pct_increase: number,
  num_owners: number,
  accessions: string,
  all_are_directors: number,
  all_are_officers: number,
  owners: string,
  titles: string,
  off_ma20: number,
  off_ma200: number,
};

export interface HtmlStringData {
  companyName: string;
  ticker: string;
  cik: string;
  windowSize: number;
  dateStrings: string;
  numInsiders: number;
  numShares: number;
  totalValue: string;
  titles: string;
  pctOfHoldings: string;
  weightAvgLine: string;
}

export type FormatOutput = {
  twitterHtml: string;
  blueskyHtml: string;
  accessions: string;
  clusterId: string;
};

export type ClusterInput = {
  cik: string,
  ticker: string,
  first_transaction: string,
  last_transaction: string,
  accessions: string,
  clusterVersion: string;
  transactionCode: string;
};