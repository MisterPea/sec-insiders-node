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
    cik TEXT,
    accession TEXT,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_form4_jobs_url ON form4_jobs (url);

CREATE TABLE
  IF NOT EXISTS form4_filings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accession TEXT,
    cik TEXT NOT NULL,
    form_type TEXT NOT NULL,
    is_amendment INTEGER DEFAULT 0,
    owner_name TEXT NOT NULL,
    period_of_report TEXT NOT NULL,
    ten5_1 INTEGER DEFAULT NULL,
    is_director INTEGER DEFAULT 0,
    is_officer INTEGER DEFAULT 0,
    is_ten_percent INTEGER DEFAULT 0,
    is_other INTEGER DEFAULT 0,
    officer_title TEXT DEFAULT NULL,
    security_type TEXT, -- derivative / non-derivative / derivative holding / non-derivative holding
    security_title TEXT,
    transaction_date TEXT,
    acquired_disposed TEXT,
    transaction_shares INTEGER DEFAULT 0,
    conversion_exercise_price REAL,
    transaction_code TEXT,
    equity_swap_involved INTEGER DEFAULT 0,
    nature_of_ownership TEXT DEFAULT NULL,
    is_option_exercise INTEGER DEFAULT 0,
    is_from_exercise INTEGER DEFAULT 0,
    is_exercise_related_sale INTEGER DEFAULT 0,
    transaction_voluntary INTEGER DEFAULT 0,
    ownership_form TEXT,
    date_exercisable TEXT,
    underlying_title TEXT,
    underlying_shares REAL,
    sec_owned_post_trx REAL,
    exercise_group_id TEXT,
    notes TEXT
  );