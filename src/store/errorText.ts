import { ApiError, ErrorCode } from '../api';
import type { ConfigProblem } from '../core/ir';

// What a store hands a component to render: a translation key, plus an optional
// detail line that is quoted verbatim.
export interface ErrorText {
  key: string;
  detail?: string;
  // Problems the editor found itself, rather than ones a server reported.
  //
  // A separate channel from `detail` because these are translatable — they are
  // written here, not by a server, so they arrive as keys and the component
  // renders them in whatever language the interface is in.
  problems?: ConfigProblem[];
}

// errorTextFor turns a failed request into something showable in two languages.
//
// The split matters. The generic causes — unreachable, expired session, server
// fault — have translations, because they say the same thing every time. The
// specific ones do not: "you already have a config with this name" and "name
// must be at most 100 characters, got 137" are written by the server, in
// English, and are far more useful than any translated paraphrase of "invalid
// request". Those come through as `detail`, shown next to a translated heading.
export function errorTextFor(error: unknown, fallbackKey: string): ErrorText {
  if (!(error instanceof ApiError)) {
    return { key: fallbackKey, detail: error instanceof Error ? error.message : undefined };
  }

  if (error.isNetworkError) return { key: 'cloud.error.unreachable' };
  if (error.isUnauthorized) return { key: 'cloud.error.signedOut' };

  switch (error.code) {
    case ErrorCode.BadRequest:
    case ErrorCode.Conflict:
      return { key: fallbackKey, detail: error.message };
    case ErrorCode.NotFound:
      return { key: 'cloud.error.gone' };
    case ErrorCode.Unavailable:
      return { key: 'cloud.error.unreachable' };
    default:
      // A 500 says nothing useful to the user by design, so the request id is
      // the detail worth surfacing: it is the one string that leads straight to
      // the matching server log line.
      return { key: 'cloud.error.server', detail: error.requestId };
  }
}
