import { useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ErrorNote } from '../components/cloud/ErrorNote';
import { NoticeCard } from '../components/common/NoticeCard';
import { AppLayout } from '../components/layout/AppLayout';
import { useAuthStore } from '../store/authStore';
import { useCloudStore } from '../store/cloudStore';
import { adoptSlot, takeSlot } from '../store/drafts';

// The editor, on two routes: /editor for a new document and /editor/:id for a
// saved config.
//
// The URL is the authority on which document this tab is holding. Each one
// keeps its unsaved state in its own draft slot, so what this page decides on
// arrival is which slot to take — and, for a saved config whose slot has
// nothing unsaved in it, whether to go and fetch the copy on the server.
export function EditorPage() {
  const { t } = useTranslation();
  const rawId = useParams().id;

  // Only positive integers are config ids. Number('12abc') quietly yielding 12
  // is exactly the near-miss that would open the wrong document.
  const malformed = rawId !== undefined && !/^[1-9][0-9]*$/.test(rawId);
  const routeId = rawId !== undefined && !malformed ? Number(rawId) : null;

  const status = useAuthStore((state) => state.status);
  const currentId = useCloudStore((state) => state.currentId);
  const listError = useCloudStore((state) => state.listError);
  const open = useCloudStore((state) => state.open);

  const [failed, setFailed] = useState(false);
  // Nothing is read out of storage until the route says which slot to read, so
  // there is a moment on every load where the stores hold an empty document
  // that belongs to nobody. Rendering the editor over it would flash an empty
  // config at someone whose work is one line of JSON away.
  const [hydrated, setHydrated] = useState(false);

  // Which route this tab has already acted on.
  //
  // Taking a document is something that happens on *arriving* at a route, not
  // whenever `currentId` changes. The difference matters because saving a new
  // document sets `currentId` from the new-config route, in the moment before
  // the tab moves to /editor/{id} — and reading that as "another config has
  // turned up here" is how a first save ended with the document reset and the
  // tab still sitting where it started.
  //
  // undefined until the first pass, so a tab that opens straight onto /editor
  // still counts as having arrived there.
  const acted = useRef<number | null | undefined>(undefined);

  // A saved config is behind a request, and a fresh tab on /editor/12 is
  // anonymous for as long as /me takes to answer — asking before then is a
  // guaranteed 401. A new document is behind nothing and waits for nobody.
  const settled = status === 'authenticated' || status === 'anonymous';
  const holdingRequested = routeId === null || currentId === routeId;

  // A layout effect, so the slot is read and the document is on screen in the
  // same paint. As an ordinary effect this would show the loading notice for a
  // frame on every open — the work is synchronous, and blinking at somebody
  // before handing them what was already on disk is not worth the frame.
  useLayoutEffect(() => {
    if (malformed) return;
    if (routeId !== null && !settled) return;
    if (routeId !== null && status !== 'authenticated') {
      // A session that has gone invalidates what this tab decided. Whatever it
      // is holding came from an account, and signing back in has to fetch it
      // again rather than find the route already ticked off.
      acted.current = undefined;
      return;
    }

    if (acted.current === routeId) return;
    acted.current = routeId;

    // The document is already here: this is the first save, moving the tab from
    // /editor to /editor/{id}. It is what belongs in the new slot, so the slot
    // is taken without reading or resetting anything.
    if (routeId !== null && currentId === routeId) {
      adoptSlot(routeId);
      setHydrated(true);
      return;
    }

    const outcome = takeSlot(routeId);
    setHydrated(true);

    // Unsaved work outranks the copy on the server: it is the newer document,
    // and it is the one that would be lost. The header goes on saying it is
    // unsaved until it is saved.
    if (routeId === null || outcome === 'restored') return;

    setFailed(false);
    void open(routeId).then((ok) => setFailed(!ok));
  }, [malformed, settled, status, routeId, currentId, open]);

  if (malformed) return <Navigate to="/" replace />;

  if (routeId !== null && settled && status !== 'authenticated') {
    return <NoticeCard tone="locked" title={t('editor.signInRequired')} />;
  }

  if (routeId !== null && failed) {
    return (
      <NoticeCard tone="error" title={t('cloud.error.open')}>
        <ErrorNote error={listError} />
      </NoticeCard>
    );
  }

  // Either the slot has not been read yet, or it has and this tab is waiting on
  // the request that fills it.
  if (!hydrated || !holdingRequested) {
    return <NoticeCard tone="loading" title={t('cloud.loading')} />;
  }

  return <AppLayout />;
}
