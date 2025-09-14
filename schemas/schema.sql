CREATE TABLE IF NOT EXISTS issuers (
  cik TEXT PRIMARY KEY,
  tickers TEXT,
  company_name TEXT,
  sic TEXT,
  sic_description TEXT
);