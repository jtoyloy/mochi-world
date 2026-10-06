-- Separate ordinary Coins receipts; no SPL payments, claims or treasury liability.
CREATE TABLE IF NOT EXISTS adventure_commerce_receipts (
  user_id text NOT NULL REFERENCES users(id),
  id text NOT NULL CHECK(id ~ '^[a-zA-Z0-9-]{16,80}$'),
  kind text NOT NULL CHECK(kind IN ('buy','sell')),
  vendor text NOT NULL,
  request jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,id)
);
CREATE INDEX IF NOT EXISTS adventure_commerce_receipts_history
  ON adventure_commerce_receipts(user_id,kind,vendor,created_at);
CREATE OR REPLACE FUNCTION prevent_commerce_receipt_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Adventure commerce receipts are immutable';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS adventure_commerce_receipt_immutable ON adventure_commerce_receipts;
CREATE TRIGGER adventure_commerce_receipt_immutable
  BEFORE UPDATE OR DELETE ON adventure_commerce_receipts
  FOR EACH ROW EXECUTE FUNCTION prevent_commerce_receipt_update();
