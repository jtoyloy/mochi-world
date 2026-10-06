BEGIN;
CREATE TABLE IF NOT EXISTS player_adventure(user_id text PRIMARY KEY REFERENCES users(id),state jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mochi_battle_brains(mochi_id text PRIMARY KEY REFERENCES mochis(id),domain text NOT NULL DEFAULT 'battle-v1' CHECK(domain='battle-v1'),version integer NOT NULL DEFAULT 0,checkpoint bytea,metrics jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS resource_node_state(id text PRIMARY KEY,available_at bigint NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS resource_harvests(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),node_id text NOT NULL,status text NOT NULL CHECK(status IN('pending','complete','cancelled')),starts_at bigint NOT NULL,ready_at bigint NOT NULL,result jsonb,completed_at timestamptz);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_harvest ON resource_harvests(user_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS adventure_events(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),kind text NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS combat_encounters(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),mob_id text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS reward_treasury(id text PRIMARY KEY,balance_raw bigint NOT NULL CHECK(balance_raw>=0),liability_raw bigint NOT NULL DEFAULT 0 CHECK(liability_raw>=0 AND liability_raw<=balance_raw),mode text NOT NULL CHECK(mode IN('mock','spl')));
CREATE TABLE IF NOT EXISTS reward_treasury_funding(id text PRIMARY KEY,treasury_id text REFERENCES reward_treasury(id),amount_raw bigint NOT NULL CHECK(amount_raw>0),reference text UNIQUE NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS game_reward_accruals(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),treasury_id text NOT NULL REFERENCES reward_treasury(id),amount_raw bigint NOT NULL CHECK(amount_raw>0),source text NOT NULL,items jsonb NOT NULL,day date NOT NULL,claim_id text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS game_reward_claims(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),treasury_id text NOT NULL REFERENCES reward_treasury(id),amount_raw bigint NOT NULL CHECK(amount_raw>0),wallet text,status text NOT NULL CHECK(status IN('pending','paid')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS game_reward_payouts(id text PRIMARY KEY,claim_id text UNIQUE NOT NULL REFERENCES game_reward_claims(id),amount_raw bigint NOT NULL CHECK(amount_raw>0),signature text UNIQUE NOT NULL,mode text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS adventure_parties(id text PRIMARY KEY,leader_id text REFERENCES users(id),members jsonb NOT NULL CHECK(jsonb_array_length(members) BETWEEN 1 AND 4),created_at timestamptz NOT NULL DEFAULT now());
COMMIT;
-- Accounting records cannot silently change their economic meaning.
CREATE OR REPLACE FUNCTION reward_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Reward ledger records are immutable'; END $$;
DROP TRIGGER IF EXISTS immutable_reward_funding ON reward_treasury_funding;
CREATE TRIGGER immutable_reward_funding BEFORE UPDATE OR DELETE ON reward_treasury_funding FOR EACH ROW EXECUTE FUNCTION reward_immutable_record();
DROP TRIGGER IF EXISTS immutable_reward_payout ON game_reward_payouts;
CREATE TRIGGER immutable_reward_payout BEFORE UPDATE OR DELETE ON game_reward_payouts FOR EACH ROW EXECUTE FUNCTION reward_immutable_record();
CREATE OR REPLACE FUNCTION reward_accrual_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Accruals cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-'claim_id') IS DISTINCT FROM (to_jsonb(OLD)-'claim_id') OR OLD.claim_id IS NOT NULL OR NEW.claim_id IS NULL THEN RAISE EXCEPTION 'Only one claim assignment is allowed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM game_reward_claims WHERE id=NEW.claim_id AND user_id=NEW.user_id AND treasury_id=NEW.treasury_id) THEN RAISE EXCEPTION 'Claim must own the accrual'; END IF;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS immutable_reward_accrual ON game_reward_accruals;
CREATE TRIGGER immutable_reward_accrual BEFORE UPDATE OR DELETE ON game_reward_accruals FOR EACH ROW EXECUTE FUNCTION reward_accrual_guard();
CREATE OR REPLACE FUNCTION reward_payout_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE claim game_reward_claims; treasury reward_treasury; BEGIN
 SELECT * INTO claim FROM game_reward_claims WHERE id=NEW.claim_id FOR UPDATE;
 SELECT * INTO treasury FROM reward_treasury WHERE id=claim.treasury_id FOR UPDATE;
 IF claim.id IS NULL OR claim.status<>'pending' OR NEW.amount_raw<>claim.amount_raw OR NEW.mode<>treasury.mode OR NEW.amount_raw>treasury.balance_raw OR NEW.amount_raw>treasury.liability_raw THEN RAISE EXCEPTION 'Payout must match a pending funded claim exactly'; END IF;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS verified_reward_payout ON game_reward_payouts;
CREATE TRIGGER verified_reward_payout BEFORE INSERT ON game_reward_payouts FOR EACH ROW EXECUTE FUNCTION reward_payout_guard();
ALTER TABLE reward_treasury ADD COLUMN IF NOT EXISTS currency jsonb NOT NULL DEFAULT '{}';
ALTER TABLE mochi_battle_brains ADD COLUMN IF NOT EXISTS pack text NOT NULL DEFAULT 'battle-0.74.0-v1';
