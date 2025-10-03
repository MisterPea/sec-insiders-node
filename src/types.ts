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
