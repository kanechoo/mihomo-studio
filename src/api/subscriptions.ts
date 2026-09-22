// The subscription endpoints.
//
// Binding hangs off a config because a subscription without one is meaningless;
// rotate and revoke address the subscription directly, since by then the caller
// holds its id and repeating the config in the path would only add something to
// get wrong.

import { request } from './client';
import type { Subscription, SubscriptionInput } from './types';

// Includes revoked subscriptions. They stay in the list on purpose — "I turned
// that one off last week" is exactly the question this view answers, and a row
// that vanished on revocation would leave the user wondering whether the URL is
// really dead.
export function listSubscriptions(
  configId: number,
  signal?: AbortSignal
): Promise<Subscription[]> {
  return request<{ subscriptions: Subscription[] }>(
    `/api/v1/configs/${configId}/subscriptions`,
    { signal }
  ).then((body) => body.subscriptions ?? []);
}

export function bindSubscription(
  configId: number,
  input: SubscriptionInput
): Promise<Subscription> {
  return request<Subscription>(`/api/v1/configs/${configId}/subscriptions`, {
    method: 'POST',
    body: input,
  });
}

// POST, not PUT: rotating is not idempotent. Two rotations produce two different
// tokens, so a client that retried a request whose response it never saw would
// have just invalidated the URL the first attempt handed back.
//
// The label, the format and the access history survive; the leaked URL dies in
// the same statement that mints its replacement.
export function rotateSubscription(id: number): Promise<Subscription> {
  return request<Subscription>(`/api/v1/subscriptions/${id}/rotate`, { method: 'POST' });
}

// Idempotent on the server: revoking twice is a 204, not an error. This is the
// endpoint a user reaches for because something has leaked, and a failure would
// send them hunting for a problem that no longer exists.
export function revokeSubscription(id: number): Promise<void> {
  return request<void>(`/api/v1/subscriptions/${id}`, { method: 'DELETE' });
}
