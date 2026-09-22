-- 0002_subscription_constraints: let the database enforce what the service
-- already validates.
--
-- service.SubscriptionInput.normaliseAndValidate rejects a format outside the
-- two the exporters produce, and the API is the only writer today. Both of
-- those are true right up until they are not: a repair script run against
-- production, a future importer, or a second service reading the same database
-- all write rows nobody validated. A row with format 'clash' would then sit
-- there until GET /sub/:token served the mihomo artifact for it, quietly, with
-- no error anywhere.
--
-- access_count is checked for the same reason. It is only ever incremented in
-- SQL, so it cannot go negative through the API — but a bad UPDATE would, and a
-- negative fetch count is the kind of thing that gets noticed months later in a
-- screenshot rather than at the moment it was written.
--
-- Unlike 0001 this is written plainly. The runner applies every version exactly
-- once, so ordinary migrations need no defence against being replayed.

ALTER TABLE subscriptions
    ADD CONSTRAINT chk_subscriptions_format
    CHECK (format IN ('mihomo', 'singbox'));

ALTER TABLE subscriptions
    ADD CONSTRAINT chk_subscriptions_access_count
    CHECK (access_count >= 0);
