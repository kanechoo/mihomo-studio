import { useTranslation } from 'react-i18next';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { ApiError, fetchRemoteDocument } from '../api';

// Reading a document from a URL the user typed, from wherever the switch says.
//
// Two places do this — Import Subscription on the Proxies tab and YAML Import in
// the editor pane — and they have to agree on more than the request: which
// failures the server path can fix, what to say when the browser refuses to
// explain itself, and whether the remembered preference is currently usable.
// One copy each, rather than one per modal.
export interface RemoteFetch {
  // Whether the request will actually go through the server. Not the same as the
  // stored preference — see below.
  viaServer: boolean;
  setViaServer: (viaServer: boolean) => void;
  canUseServer: boolean;
  download: (url: string, signal?: AbortSignal) => Promise<string>;
  describeFailure: (error: unknown) => string;
}

export function useRemoteFetch(): RemoteFetch {
  const { t } = useTranslation();
  const preference = useUIStore((state) => state.subscriptionFetchViaServer);
  const setViaServer = useUIStore((state) => state.setSubscriptionFetchViaServer);
  const authStatus = useAuthStore((state) => state.status);

  const canUseServer = authStatus === 'authenticated';
  // The preference outlives the session that could act on it — it is persisted,
  // and signing out does not clear it. Reporting it as-is would leave the switch
  // showing on while every fetch went to the server and came back 401.
  const viaServer = preference && canUseServer;

  const download = async (url: string, signal?: AbortSignal): Promise<string> => {
    if (viaServer) {
      const document = await fetchRemoteDocument(url, signal);
      return document.content;
    }

    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(t('remoteFetch.error.fetchFailed', { status: response.status }));
    }
    return response.text();
  };

  // fetch() rejects the same way for a DNS failure, a refused connection and a
  // CORS rejection, and the browser deliberately withholds which — so the one
  // message names the case the switch can actually fix.
  const describeFailure = (error: unknown): string => {
    if (error instanceof ApiError) {
      if (error.isUnauthorized) return t('remoteFetch.error.signInRequired');
      if (error.isNetworkError) return t('remoteFetch.error.serverUnreachable');
      return error.message || t('remoteFetch.error.serverFetch');
    }
    if (error instanceof TypeError) return t('remoteFetch.error.unreachable');
    return error instanceof Error ? error.message : t('remoteFetch.error.unknown');
  };

  return { viaServer, setViaServer, canUseServer, download, describeFailure };
}
