import { useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ErrorNote } from '../components/cloud/ErrorNote';
import { NoticeCard } from '../components/common/NoticeCard';
import { ServerPage } from '../components/server/ServerPage';
import { useAuthStore } from '../store/authStore';
import { useServerCloudStore } from '../store/serverCloudStore';

// The server editor's entry route handler: /server for a local draft and
// /server/:id for a saved one. The gating mirrors EditorPage — the URL is the
// authority, a saved config needs a session and one request — minus the draft
// slot machinery, because the server editor holds one document per tab today.
export function ServerEntryPage() {
  const { t } = useTranslation();
  const rawId = useParams().id;

  const malformed = rawId !== undefined && !/^[1-9][0-9]*$/.test(rawId);
  const routeId = rawId !== undefined && !malformed ? Number(rawId) : null;

  const status = useAuthStore((state) => state.status);
  const currentId = useServerCloudStore((state) => state.currentId);
  const saveError = useServerCloudStore((state) => state.saveError);
  const open = useServerCloudStore((state) => state.open);

  const [failed, setFailed] = useState(false);
  // Which route this tab has already acted on — see EditorPage for why this is
  // arrival-scoped rather than derived from currentId.
  const acted = useRef<number | null | undefined>(undefined);
  const [ready, setReady] = useState(routeId === null);

  const settled = status === 'authenticated' || status === 'anonymous';

  useLayoutEffect(() => {
    if (routeId === null) {
      setReady(true);
      return;
    }
    if (malformed || !settled) return;
    if (status !== 'authenticated') return;

    if (acted.current === routeId) return;
    acted.current = routeId;

    // Already holding it: the first-save navigation from /server.
    if (currentId === routeId) {
      setReady(true);
      return;
    }

    setReady(false);
    setFailed(false);
    void open(routeId).then((ok) => {
      setFailed(!ok);
      setReady(true);
    });
  }, [malformed, settled, status, routeId, currentId, open]);

  if (malformed) return <Navigate to="/server-config-editor" replace />;

  if (routeId !== null && settled && status !== 'authenticated') {
    return <NoticeCard tone="locked" title={t('server.cloud.signInRequired')} />;
  }

  if (routeId !== null && failed) {
    return (
      <NoticeCard tone="error" title={t('server.cloud.error.open')}>
        <ErrorNote error={saveError} />
      </NoticeCard>
    );
  }

  if (!ready) {
    return <NoticeCard tone="loading" title={t('cloud.loading')} />;
  }

  return <ServerPage />;
}
