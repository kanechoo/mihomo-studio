// Fetching a document the browser cannot.
//
// Import Subscription normally fetches from the browser, which is the right
// default: it needs no account, and the request goes straight from the user to
// their provider without this service seeing the URL — which is a credential.
// But a provider that sends no `Access-Control-Allow-Origin` header cannot be
// read from a page at all, and the browser reports that failure identically to a
// DNS error. For those, the request is made by the server instead.
//
// The endpoint requires a session. It makes this service fetch a URL of the
// caller's choosing, and an anonymous version of that is a relay for anyone who
// finds it.

import { request } from './client';

export interface RemoteDocument {
  content: string;
  contentType: string;
}

export function fetchRemoteDocument(url: string, signal?: AbortSignal): Promise<RemoteDocument> {
  return request<{ content: string; content_type: string }>('/api/v1/import/fetch', {
    method: 'POST',
    body: { url },
    signal,
  }).then((body) => ({ content: body.content, contentType: body.content_type ?? '' }));
}
