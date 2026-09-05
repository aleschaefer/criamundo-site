-- Edição, exclusão lógica e auditoria das transações do cartão.
ALTER TABLE credit_card_transactions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE credit_card_transactions ADD COLUMN updated_at TEXT;
ALTER TABLE credit_card_transactions ADD COLUMN deleted_at TEXT;
UPDATE credit_card_transactions SET updated_at = created_at WHERE updated_at IS NULL;
CREATE INDEX idx_credit_card_transactions_created ON credit_card_transactions(deleted_at, created_at DESC);
