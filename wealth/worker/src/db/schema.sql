CREATE TABLE IF NOT EXISTS wealth_deals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    property_address TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    signing_status TEXT DEFAULT 'pending',
    mint_status TEXT DEFAULT 'not_started',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wealth_participants (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    email TEXT,
    wallet_address TEXT,
    role TEXT DEFAULT 'signer',
    signing_status TEXT DEFAULT 'pending',
    share_pct REAL DEFAULT 0.0,
    cash_amount TEXT DEFAULT '0',
    loan_amount TEXT DEFAULT '0',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (deal_id) REFERENCES wealth_deals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wealth_signatures (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    document_name TEXT NOT NULL,
    document_hash TEXT NOT NULL,
    provider TEXT NOT NULL,
    envelope_id TEXT,
    evidence_key TEXT,
    completed_at TEXT NOT NULL,
    FOREIGN KEY (deal_id) REFERENCES wealth_deals(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES wealth_participants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wealth_ownership_ledger (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    asset_id INTEGER NOT NULL,
    amount TEXT NOT NULL,
    tx_hash TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (deal_id) REFERENCES wealth_deals(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES wealth_participants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wealth_audit_events (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL,
    participant_id TEXT,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (deal_id) REFERENCES wealth_deals(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES wealth_participants(id) ON DELETE SET NULL
);
