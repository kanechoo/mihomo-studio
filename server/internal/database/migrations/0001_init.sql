-- 0001_init: the schema as it stood at the end of Step 6.
--
-- Every statement here is idempotent, which is unusual for a migration and is
-- deliberate for this one. Steps 1-6 built the schema with GORM's AutoMigrate,
-- so by the time versioned migrations arrive there are already databases
-- carrying these exact tables and no record of ever having been migrated.
-- Running 0001 against one of those has to be a no-op that simply records the
-- version; running it against an empty database has to build the schema.
--
-- The definitions below were transcribed from a pg_dump of a database
-- AutoMigrate had built, so the two paths converge on byte-identical DDL. A
-- column that differed here would give new deployments a schema subtly unlike
-- every existing one, and nothing would notice until a query behaved
-- differently on one of them.
--
-- Later migrations need none of this ceremony: the runner applies each version
-- exactly once, so they can be written as plain ALTERs.

CREATE TABLE IF NOT EXISTS users (
    id            bigserial PRIMARY KEY,
    github_id     bigint NOT NULL,
    login         varchar(255) NOT NULL,
    name          varchar(255),
    email         varchar(320),
    avatar_url    varchar(512),
    last_login_at timestamptz,
    created_at    timestamptz,
    updated_at    timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users (github_id);
CREATE INDEX IF NOT EXISTS idx_users_login ON users (login);

CREATE TABLE IF NOT EXISTS mihomo_configs (
    id               bigserial PRIMARY KEY,
    user_id          bigint NOT NULL,
    name             varchar(100) NOT NULL,
    description      varchar(500),
    ir               jsonb NOT NULL,
    ir_version       varchar(20) DEFAULT '1.0.0' NOT NULL,
    rendered_mihomo  text,
    rendered_singbox text,
    rendered_at      timestamptz,
    created_at       timestamptz,
    updated_at       timestamptz,
    deleted_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_configs_user ON mihomo_configs (user_id);
CREATE INDEX IF NOT EXISTS idx_mihomo_configs_deleted_at ON mihomo_configs (deleted_at);

-- Config names are unique per user, but only among live configs. A plain
-- UNIQUE (user_id, name) would let a soft-deleted row reserve its name forever:
-- the user deletes "home", creates "home" again, and gets a duplicate-key error
-- about a row they cannot see or remove. The WHERE clause is the whole point.
CREATE UNIQUE INDEX IF NOT EXISTS idx_configs_user_name_active
    ON mihomo_configs (user_id, name)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS subscriptions (
    id              bigserial PRIMARY KEY,
    config_id       bigint NOT NULL,
    user_id         bigint NOT NULL,
    token           varchar(64) NOT NULL,
    format          varchar(20) DEFAULT 'mihomo' NOT NULL,
    label           varchar(100),
    revoked_at      timestamptz,
    last_access_at  timestamptz,
    access_count    bigint DEFAULT 0 NOT NULL,
    last_user_agent varchar(255),
    created_at      timestamptz,
    updated_at      timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_token ON subscriptions (token);
CREATE INDEX IF NOT EXISTS idx_subscriptions_config_id ON subscriptions (config_id);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions (user_id);

-- GET /sub/:token is the hottest read path in the service — every client polls
-- it — and it only ever looks for live tokens.
CREATE INDEX IF NOT EXISTS idx_subs_token_active
    ON subscriptions (token)
    WHERE revoked_at IS NULL;

-- Foreign keys. ADD CONSTRAINT has no IF NOT EXISTS, so each is wrapped in a
-- block that swallows the duplicate — the adoption case above.
--
-- fk_subscriptions_user is the one that matters most. subscriptions.user_id is
-- denormalised from the owning config so every repository can scope by user_id
-- without a join; because no GORM association ever declared it, AutoMigrate
-- created no key for it, which would leave the single column the whole tenant
-- isolation rule leans on completely unconstrained.
DO $$ BEGIN
    ALTER TABLE mihomo_configs
        ADD CONSTRAINT fk_users_configs
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE subscriptions
        ADD CONSTRAINT fk_mihomo_configs_subscriptions
        FOREIGN KEY (config_id) REFERENCES mihomo_configs (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE subscriptions
        ADD CONSTRAINT fk_subscriptions_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
