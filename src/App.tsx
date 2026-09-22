import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './locales';
import './styles/globals.css';
import { HomePage } from './pages/HomePage';
import { EditorPage } from './pages/EditorPage';
import { ServerEntryPage } from './pages/ServerEntryPage';
import { useAuthStore } from './store/authStore';

// Whether this page load is GitHub's redirect back to us.
//
// Read at module scope, before anything renders, because bootstrap() strips the
// query string as its first act — by the time an effect could look, the evidence
// is gone.
const startedAsOAuthCallback =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code');

function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const status = useAuthStore((state) => state.status);
  const navigate = useNavigate();
  const location = useLocation();

  // Runs once: redeems an OAuth callback if this page load is one, otherwise
  // revalidates a stored token. The store guards against the second call
  // StrictMode makes in development — redeeming an authorization code twice
  // fails, and the failure would land on a session that had just succeeded.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // A finished sign-in belongs on the home page, because that is where the
  // configs the user just signed in for are listed.
  //
  // GitHub returns the browser to the OAuth app's callback URL, which is this
  // origin's root by default — so most of the time this has nothing to do. It
  // earns its place when VITE_OAUTH_REDIRECT_URI points somewhere else, and
  // when the user started the flow from inside the editor.
  useEffect(() => {
    if (!startedAsOAuthCallback) return;
    if (status !== 'authenticated') return;
    if (location.pathname === '/') return;
    navigate('/', { replace: true });
  }, [status, location.pathname, navigate]);

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      {/* Two paths into the same page: without an id it is a new document, with
          one it is that saved config. The editor reads the id from the URL
          rather than from a store, so a tab always shows what its address bar
          says — including after a reload, and including when several tabs are
          open on different configs. */}
      <Route path="/client-config-editor" element={<EditorPage />} />
      <Route path="/client-config-editor/:id" element={<EditorPage />} />
      <Route path="/server-config-editor" element={<ServerEntryPage />} />
      <Route path="/server-config-editor/:id" element={<ServerEntryPage />} />
      {/* Share links are served by the API itself ({PUBLIC_BASE_URL}/share/
          {token} answers with raw YAML), so no route exists for them here —
          a browser that lands on this origin's /share/:token has followed a
          link minted against a different host. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
