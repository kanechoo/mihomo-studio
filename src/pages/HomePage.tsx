import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RotateCw, MonitorSmartphone, Server, Waypoints } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConfigSummary } from '../api';
import * as anim from '../animation/tokens';
import { AccountMenu } from '../components/cloud/AccountMenu';
import { ErrorNote } from '../components/cloud/ErrorNote';
import { SubscriptionLinksModal } from '../components/cloud/SubscriptionLinksModal';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';
import { ThemeSwitcher } from '../components/common/ThemeSwitcher';
import { ConfigCard } from '../components/home/ConfigCard';
import { NewConfigCard } from '../components/home/NewConfigCard';
import { NewServerConfigCard } from '../components/home/NewServerConfigCard';
import { ServerConfigSection } from '../components/home/ServerConfigSection';
import { SignInPanel } from '../components/home/SignInPanel';
import { useAuthStore } from '../store/authStore';
import { useCloudStore } from '../store/cloudStore';

// The landing page: the config library, and the way into a new document.
//
// Editing does not happen here. Every card opens a tab on /editor or /server,
// so several configs can be open at once and each tab's address bar says which
// one it is holding.

type LibraryKind = 'client' | 'server';

function LibrarySwitcher({
  value,
  onChange,
}: {
  value: LibraryKind;
  onChange: (next: LibraryKind) => void;
}) {
  const { t } = useTranslation();
  const options: { key: LibraryKind; icon: typeof MonitorSmartphone }[] = [
    { key: 'client', icon: MonitorSmartphone },
    { key: 'server', icon: Server },
  ];

  return (
    <div
      role="tablist"
      aria-label={t('home.switcher.label')}
      className="inline-flex items-center gap-1 p-1 rounded-lg"
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    >
      {options.map(({ key, icon: Icon }) => {
        const isActive = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className="relative flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            {isActive && (
              <motion.span
                layoutId="home-library-thumb"
                className="absolute inset-0 rounded-md"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  boxShadow: '0 1px 3px rgb(0 0 0 / 0.18)',
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <Icon size={15} className="relative shrink-0" />
            <span className="relative">
              {t(key === 'client' ? 'home.client.title' : 'home.server.title')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  const [linksFor, setLinksFor] = useState<ConfigSummary | null>(null);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <header
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
      >
        <div>
          <h1
            className="flex items-center gap-2 text-xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            <Waypoints size={22} className="shrink-0" style={{ color: 'var(--accent)' }} />
            {t('app.title')}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {t('app.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* The avatar is the whole of the "you are signed in" signal in this
              header, and it turns up a moment after the page does — the session
              is confirmed by a request. Arriving under its own power is what
              distinguishes that from a static part of the layout. */}
          <AnimatePresence>
            {status === 'authenticated' && (
              <motion.div
                key="account"
                className="flex items-center gap-3"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: anim.DURATION.base, ease: anim.EASE_OUT }}
              >
                <AccountMenu login={user?.login ?? ''} avatarUrl={user?.avatar_url} size="lg" />
                <div
                  className="w-px h-6"
                  style={{ backgroundColor: 'var(--border-color)' }}
                  aria-hidden="true"
                />
              </motion.div>
            )}
          </AnimatePresence>
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Three mutually exclusive bodies in one place: the session is still
            settling, the library is ready, or nobody is signed in. mode="wait"
            makes the outgoing one finish before the incoming one starts —
            without it, "Signing in…" and the library would briefly occupy the
            same space and the page would appear to stutter at the one moment
            the user is waiting on it. */}
        <AnimatePresence mode="wait">
          {status === 'exchanging' || status === 'restoring' ? (
            <motion.p
              key="pending"
              className="py-16 text-center text-base"
              style={{ color: 'var(--text-secondary)' }}
              variants={anim.fade}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {status === 'exchanging' ? t('auth.signingIn') : t('auth.restoring')}
            </motion.p>
          ) : status === 'authenticated' ? (
            <motion.div key="library" variants={anim.fade} initial="hidden" animate="visible" exit="exit">
              <ConfigLibrary onLinks={setLinksFor} />
            </motion.div>
          ) : (
            <motion.div
              key="signed-out"
              className="grid gap-5 md:grid-cols-2 items-start"
              variants={anim.staggerContainer}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <NewConfigCard />
              <NewServerConfigCard />
              <SignInPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <SubscriptionLinksModal
        isOpen={linksFor !== null}
        onClose={() => setLinksFor(null)}
        config={linksFor}
      />
    </div>
  );
}

function ConfigLibrary({ onLinks }: { onLinks: (config: ConfigSummary) => void }) {
  const { t } = useTranslation();
  const configs = useCloudStore((state) => state.configs);
  const listStatus = useCloudStore((state) => state.listStatus);
  const listError = useCloudStore((state) => state.listError);
  const refresh = useCloudStore((state) => state.refresh);

  // One library on screen at a time. Client is the default: it is the more
  // common document, and the switcher makes the other half discoverable.
  const [library, setLibrary] = useState<LibraryKind>('client');

  // Deleting a server config from this page must also re-read the server list,
  // which lives inside its own section; the token is the nudge.
  const [serverRefresh, setServerRefresh] = useState(0);

  // A local request can finish before the eye registers anything, so each
  // click holds the icon spinning for a minimum beat. That window is also the
  // lockout: the button ignores clicks until the spin ends, so mashing it
  // fires one refresh, not ten.
  const [minSpin, setMinSpin] = useState(false);
  const minSpinTimer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (minSpinTimer.current !== null) window.clearTimeout(minSpinTimer.current);
    };
  }, []);
  const refreshBusy = listStatus === 'loading' || minSpin;

  const handleRefreshClick = () => {
    if (refreshBusy) return;
    void refresh();
    setServerRefresh((n) => n + 1);
    setMinSpin(true);
    minSpinTimer.current = window.setTimeout(() => setMinSpin(false), 600);
  };

  // The lists belong to the server and are one request away, so they are
  // fetched on every visit rather than persisted. Coming back to this tab after
  // saving in another one should show the new name, not a cached one.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <motion.div className="space-y-5" variants={anim.staggerContainer} initial="hidden" animate="visible">
      <motion.div className="flex items-end justify-between gap-4" variants={anim.fadeUp}>
        <div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('cloud.configs.title')}
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('cloud.configs.intro')}
          </p>
        </div>
        <motion.button
          type="button"
          disabled={refreshBusy}
          onClick={handleRefreshClick}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg shrink-0 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            opacity: refreshBusy ? 0.6 : 1,
          }}
          whileHover={refreshBusy ? undefined : { scale: 1.03, opacity: 0.85 }}
          whileTap={refreshBusy ? undefined : { scale: 0.97 }}
          transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
        >
          {/* Refreshing an already-populated list changes nothing on screen when
              the server agrees with what is shown, and a button that does
              nothing visible reads as broken. The spin is the receipt. */}
          <motion.span
            className="flex"
            animate={refreshBusy ? { rotate: 360 } : { rotate: 0 }}
            transition={
              refreshBusy
                ? { duration: 0.8, ease: 'linear', repeat: Infinity }
                : { duration: anim.DURATION.base, ease: anim.EASE_OUT }
            }
          >
            <RotateCw size={16} />
          </motion.span>
          {t('cloud.configs.refresh')}
        </motion.button>
      </motion.div>

      {/* Client / server are two different resources with different editors.
          The switcher picks one; both lists never share the screen. */}
      <motion.div variants={anim.fadeUp}>
        <LibrarySwitcher value={library} onChange={setLibrary} />
      </motion.div>

      <AnimatePresence mode="wait" initial={false}>
        {library === 'client' ? (
          <motion.section
            key="client"
            className="space-y-3 min-w-0"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
          >
            <motion.div variants={anim.fadeUp} initial="hidden" animate="visible">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('home.client.title')}
              </h3>
              <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {t('home.client.intro')}
              </p>
            </motion.div>

            <NewConfigCard />

            <ErrorNote error={listError} />

            <AnimatePresence mode="wait">
              {listStatus === 'loading' && configs.length === 0 && (
                <motion.p
                  key="loading"
                  className="py-10 text-center text-base"
                  style={{ color: 'var(--text-secondary)' }}
                  variants={anim.fade}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  {t('cloud.loading')}
                </motion.p>
              )}

              {listStatus === 'ready' && configs.length === 0 && (
                <motion.p
                  key="empty"
                  className="py-10 text-center text-base"
                  style={{ color: 'var(--text-secondary)' }}
                  variants={anim.fade}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  {t('cloud.configs.empty')}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.div className="space-y-3" variants={anim.staggerContainer}>
              <AnimatePresence>
                {configs.map((config) => (
                  <ConfigCard
                    key={config.id}
                    config={config}
                    onLinks={(c) => {
                      onLinks(c);
                      setServerRefresh((n) => n + 1);
                    }}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {/* Deleting a config stops every subscription URL pointing at it,
                and that is not obvious from a delete button. Say it once, here. */}
            <AnimatePresence>
              {configs.length > 0 && (
                <motion.p
                  className="text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                  variants={anim.fade}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  {t('cloud.configs.deleteNote')}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.section>
        ) : (
          <motion.div
            key="server"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
          >
            <ServerConfigSection refreshToken={serverRefresh} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
