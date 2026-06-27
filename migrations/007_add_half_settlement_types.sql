CREATE TABLE IF NOT EXISTS point_transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('register', 'bet', 'settle_win', 'settle_lose', 'recharge', 'settle_half_win', 'settle_half_lose')),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reference_id INTEGER,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO point_transactions_new SELECT * FROM point_transactions;

DROP TABLE point_transactions;

ALTER TABLE point_transactions_new RENAME TO point_transactions;

CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_created_at ON point_transactions(created_at);
