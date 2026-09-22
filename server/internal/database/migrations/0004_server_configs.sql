-- 0004_server_configs: cloud persistence for the server-config editor.
--
-- The server editor (src/components/server/) saves the same kind of document
-- the client editor does — a structured IR that is the source of truth, with
-- YAML produced on demand in the browser. It gets its own table rather than a
-- "kind" column on mihomo_configs because mihomo_configs is shaped around the
-- client editor's needs: ir_version plus the two rendered_* artifacts and the
-- subscriptions association have no meaning for a server config, and mixing
-- the two would put NULL columns and a dead has-many on half the rows.
--
-- Everything else follows the subscriptions precedent for a user-scoped
-- resource: a denormalised user_id so every repository query scopes without a
-- join, and a partial unique index on (user_id, name) among live rows only,
-- so a soft-deleted config frees its name immediately.

CREATE TABLE server_configs (
    id          bigserial PRIMARY KEY,
    user_id     bigint NOT NULL,
    name        varchar(100) NOT NULL,
    description varchar(500),
    -- The ServerConfigIR document (schemaVersion, dns, listeners, outbounds,
    -- rules). jsonb for the same reason mihomo_configs.ir is: the IR carries
    -- open protocol records whose shape belongs to the frontend schemas.
    ir          jsonb NOT NULL,
    ir_version  varchar(20) DEFAULT '1.0.0' NOT NULL,
    created_at  timestamptz,
    updated_at  timestamptz,
    deleted_at  timestamptz
);

CREATE INDEX idx_server_configs_user ON server_configs (user_id);
CREATE INDEX idx_server_configs_deleted_at ON server_configs (deleted_at);

CREATE UNIQUE INDEX idx_server_configs_user_name_active
    ON server_configs (user_id, name)
    WHERE deleted_at IS NULL;

-- Added in its own block for the same reason as 0001: CREATE INDEX IF NOT
-- EXISTS covers indexes, but there is no portable "add constraint if missing",
-- and re-running this file must not fail halfway through.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_server_configs'
    ) THEN
        ALTER TABLE server_configs
            ADD CONSTRAINT fk_users_server_configs
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;
