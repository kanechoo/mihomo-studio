-- 0005_server_config_shares: capability URLs for the server-config editor.
--
-- The subscriptions precedent, carried over to the server editor's documents.
-- A share is a resource reference, never a snapshot: the row holds a token and
-- the server config it points at, and every visit re-reads that config's
-- current IR. The YAML itself is rendered from the IR by the frontend (the
-- listener → client-proxy converters live there), so — unlike subscriptions —
-- there are no served bytes stored or computed on this side.
--
-- Everything follows 0004/0001 conventions: a denormalised user_id so every
-- owner-scoped query avoids a join, one token per row with a unique index, and
-- revocation as a timestamp rather than a delete so a revoked link stays
-- visible in its owner's list.

CREATE TABLE server_config_shares (
    id               bigserial PRIMARY KEY,
    server_config_id bigint NOT NULL,
    user_id          bigint NOT NULL,
    -- Same entropy as subscription tokens: NewSubscriptionToken mints both.
    token            varchar(64) NOT NULL,
    -- 'full_server_yaml' or 'server_to_client_proxies'; see the CHECK below.
    share_type       varchar(40) NOT NULL,
    revoked_at       timestamptz,
    created_at       timestamptz,
    updated_at       timestamptz
);

CREATE INDEX idx_server_config_shares_user ON server_config_shares (user_id);
CREATE INDEX idx_server_config_shares_config ON server_config_shares (server_config_id);
CREATE UNIQUE INDEX idx_server_config_shares_token ON server_config_shares (token);

ALTER TABLE server_config_shares
    ADD CONSTRAINT chk_server_config_shares_type
    CHECK (share_type IN ('full_server_yaml', 'server_to_client_proxies'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_server_config_shares'
    ) THEN
        ALTER TABLE server_config_shares
            ADD CONSTRAINT fk_users_server_config_shares
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_server_configs_server_config_shares'
    ) THEN
        ALTER TABLE server_config_shares
            ADD CONSTRAINT fk_server_configs_server_config_shares
            FOREIGN KEY (server_config_id) REFERENCES server_configs(id) ON DELETE CASCADE;
    END IF;
END $$;
