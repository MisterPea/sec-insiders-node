CREATE TABLE
  IF NOT EXISTS issuers (
    cik TEXT PRIMARY KEY,
    tickers TEXT,
    company_name TEXT,
    sic TEXT,
    sic_description TEXT
  );

CREATE TABLE
  IF NOT EXISTS form4_jobs (
    accession TEXT PRIMARY KEY,
    cik TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending|running|done|failed
    attempts INTEGER NOT NULL DEFAULT 0,
    discovered_at TEXT NOT NULL DEFAULT (datetime ('now')),
    processed_at TEXT,
    last_modified TEXT,
    xml_sha256 TEXT
  );

CREATE TABLE
  IF NOT EXISTS form4_filings (
    accession TEXT PRIMARY KEY,
    cik TEXT NOT NULL,
    form_type TEXT NOT NULL,
    filed_at TEXT NOT NULL,
    period_of_report TEXT NOT NULL,
    is_amendment INTEGER DEFAULT 0,
    ten5_1 INTEGER DEFAULT NULL,
    owner_name TEXT NOT NULL,
    is_director INTEGER DEFAULT 0,
    is_officer INTEGER DEFAULT 0,
    is_ten_percent INTEGER DEFAULT 0,
    is_other INTEGER DEFAULT 0,
    officer_title TEXT DEFAULT NULL,
    is_option_exercise INTEGER DEFAULT 0,
    is_from_exercise INTEGER DEFAULT 0,
    is_exercise_related_sale INTEGER DEFAULT 0,
    security_title TEXT NOT NULL,
    transaction_date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    acquired_disposed TEXT price REAL,
    conversion_exercise_price REAL,
    transaction_code TEXT NOT NULL,
    transaction_voluntary INTEGER DEFAULT 0,
    sec_owned_post_trx REAL,
    ownership_form TEXT,
    date_exercisable TEXT,
    underlying_title TEXT,
    underlying_shares REAL,
    exercise_group_id TEXT,
    notes TEXT
  );