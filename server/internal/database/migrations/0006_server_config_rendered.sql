-- 0006_server_config_rendered: stored YAML artifacts for server configs.
--
-- Server-config shares serve bytes, exactly as /sub does for client configs:
-- the browser's exporters render both payloads at save time (the full server
-- document, and the aggregated client proxies fragment), and the share
-- endpoint returns them verbatim. Rendering stays in TypeScript for the same
-- reason it always has — a second implementation here would drift from the
-- editor preview the first time either side changed.
--
-- rendered_at mirrors mihomo_configs: NULL marks a config saved before this
-- existed (or by a client that sent no artifacts), which is what lets the
-- share panel say "save once from the editor" instead of serving an empty
-- file. Every editor save rewrites all three columns in the same statement as
-- the IR, so a share link can never mix one document's listeners with
-- another's artifacts.

ALTER TABLE server_configs
    ADD COLUMN IF NOT EXISTS rendered_server_yaml text,
    ADD COLUMN IF NOT EXISTS rendered_client_proxies text,
    ADD COLUMN IF NOT EXISTS rendered_at timestamptz;
