CREATE TABLE calendar_days (
  date date PRIMARY KEY,
  julian_date date NOT NULL,
  weekday_sr text NOT NULL CHECK (weekday_sr <> ''),
  week_context_sr text,
  commemoration_sr text NOT NULL CHECK (commemoration_sr <> ''),
  source_emphasis text NOT NULL CHECK (source_emphasis <> ''),
  source_ref text NOT NULL CHECK (source_ref <> ''),
  verification_status text NOT NULL CHECK (verification_status IN ('verified')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
