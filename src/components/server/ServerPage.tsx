import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  FileDown,
  AlertTriangle,
  Gauge,
  Network,
  ArrowRightLeft,
  ListFilter,
  Globe,
  ShieldCheck,
  Settings,
  Pencil,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as anim from '../../animation/tokens';
import { useWheelTabSwitcher } from '../../hooks/useWheelTabSwitcher';
import { HeaderTools } from '../layout/HeaderTools';
import { useServerCloudStore } from '../../store/serverCloudStore';
import { yamlFilename } from '../common/download';
import { useServerStore } from '../../store/serverStore';
import { useServerProblems, useServerHasErrors } from '../../hooks/useServerValidation';
import { useServerExporter } from '../../hooks/useServerExporter';
import { ListenerListTab } from './ListenerListTab';
import { OverviewTab } from './OverviewTab';
import { GeneralTab } from './GeneralTab';
import { OutboundTab } from './OutboundTab';
import { RuleTab } from './RuleTab';
import { DnsTab } from './DnsTab';
import { ValidationTab } from './ValidationTab';
import { ListenerEditorPanel } from './ListenerEditorPanel';
import { ServerConfigDetailsDialog } from './ServerConfigDetailsDialog';
import { ServerPreviewPane } from './ServerPreviewPane';
import { ServerSaveButton } from './ServerSaveButton';

type ServerTab =
  | 'overview'
  | 'general'
  | 'listeners'
  | 'outbound'
  | 'rules'
  | 'dns'
  | 'validation';

const TABS: { key: ServerTab; icon: typeof Gauge }[] = [
  { key: 'overview', icon: Gauge },
  { key: 'general', icon: Settings },
  { key: 'listeners', icon: Network },
  // Outbound (the `proxies:` table) precedes the rules that name it — the
  // same define-before-reference order the client editor uses for providers.
  { key: 'outbound', icon: ArrowRightLeft },
  { key: 'rules', icon: ListFilter },
  { key: 'dns', icon: Globe },
  { key: 'validation', icon: ShieldCheck },
];

const SERVER_TAB_KEYS = TABS.map(({ key }) => key);

function downloadYaml(content: string, name: string): void {
  const blob = new Blob([content], { type: 'application/yaml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = yamlFilename(name);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ServerPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ServerTab>('overview');
  const { tabStripRef, registerTabButton, handleWheel } = useWheelTabSwitcher(
    SERVER_TAB_KEYS,
    tab,
    setTab
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const config = useServerStore((s) => s.config);
  const currentId = useServerCloudStore((s) => s.currentId);
  const currentName = useServerCloudStore((s) => s.currentName);
  const dirty = useServerCloudStore((s) => s.dirty);
  const problems = useServerProblems();
  const blocked = useServerHasErrors();
  const exported = useServerExporter();

  const problemsByListener = useMemo(() => {
    const map = new Map<string, number>();
    for (const problem of problems) {
      if (!problem.listenerId || problem.severity !== 'error') continue;
      map.set(problem.listenerId, (map.get(problem.listenerId) ?? 0) + 1);
    }
    return map;
  }, [problems]);

  // The second header line mirrors the client editor's save-state line: what it
  // reports here is the validation verdict instead, which is the thing this
  // document can be "wrong" about.
  const counts = useMemo(
    () => ({
      error: problems.filter((p) => p.severity === 'error').length,
      warning: problems.filter((p) => p.severity === 'warning').length,
    }),
    [problems]
  );
  const state =
    counts.error > 0
      ? { key: `e${counts.error}`, text: `${t('server.validation.error')} · ${counts.error}`, color: '#ef4444' }
      : counts.warning > 0
        ? { key: `w${counts.warning}`, text: `${t('server.validation.warning')} · ${counts.warning}`, color: '#f59e0b' }
        : { key: 'ok', text: t('server.validation.allClear'), color: 'var(--accent)' };

  const editing = editingId
    ? config.listeners.find((listener) => listener.id === editingId) ?? null
    : null;

  // The header names the document, the same way the client editor's does:
  // a saved config shows its name and can be renamed in place; an unsaved one
  // is named by the dialog that first saves it.
  const name = currentId !== null && currentName ? currentName : t('server.newConfigName');

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Top Header — same frame as the client editor's: back link, divider,
          title block with a state line, document actions beside the name,
          shared display controls on the right. */}
      <header
        className="flex items-center justify-between gap-4 px-6 py-4 border-b"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex items-center gap-4 min-w-0 flex-wrap">
          <motion.div whileHover="hover" whileTap={{ scale: 0.97 }} className="shrink-0">
            <Link
              to="/"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
            >
              <motion.span
                className="flex"
                variants={{ hover: { x: -3 } }}
                transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
              >
                <ArrowLeft size={16} />
              </motion.span>
              <span className="hidden sm:inline">{t('nav.home')}</span>
            </Link>
          </motion.div>

          <div
            className="w-px h-8 shrink-0 hidden sm:block"
            style={{ backgroundColor: 'var(--border-color)' }}
            aria-hidden="true"
          />

          <div className="min-w-0">
            <h1
              className="flex items-center gap-2 text-xl font-bold"
              style={{ color: 'var(--text-primary)' }}
              title={name}
            >
              <span className="truncate">{name}</span>
              {/* Appears the moment the document diverges from what is saved —
                  the same receipt dot as the client editor's header. */}
              <AnimatePresence>
                {dirty && (
                  <motion.span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: '#d97706' }}
                    title={t('cloud.unsaved')}
                    aria-label={t('cloud.unsaved')}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                  />
                )}
              </AnimatePresence>

              {/* Only for a config that exists in the account; a document that
                  has never been saved is named by the dialog that saves it. */}
              {currentId !== null && (
                <motion.button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  className="shrink-0 p-1 rounded"
                  style={{ color: 'var(--text-secondary)' }}
                  title={t('cloud.details.action')}
                  aria-label={t('cloud.details.action')}
                  whileHover={{ scale: 1.15, opacity: 0.75 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
                >
                  <Pencil size={15} />
                </motion.button>
              )}
            </h1>
            <div className="relative h-5 mt-0.5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={state.key}
                  className="absolute inset-x-0 text-sm truncate"
                  style={{ color: state.color }}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12, ease: anim.EASE_OUT }}
                >
                  {state.text}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* Document actions sit beside the name they act on, where SaveButton
              lives over in the client editor. Labels drop below sm: the icons
              carry the meaning once the header runs out of room. */}
          <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-2">
            <ServerSaveButton />
            <motion.button
              type="button"
              disabled={blocked}
              onClick={() => downloadYaml(exported.yaml, currentName)}
              title={blocked ? t('server.export.blocked') : t('server.export.title')}
              aria-label={blocked ? t('server.export.blocked') : t('server.export.title')}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: blocked ? '#ef4444' : 'var(--text-primary)',
              }}
              animate={{ opacity: blocked ? 0.55 : 1 }}
              whileHover={blocked ? undefined : { scale: 1.03 }}
              whileTap={blocked ? undefined : { scale: 0.97 }}
              transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
            >
              {blocked ? <AlertTriangle size={16} /> : <FileDown size={16} />}
              <span className="hidden md:inline">{t('server.export.title')}</span>
            </motion.button>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <HeaderTools />
        </div>
      </header>

      {/* Main Content - Dual Pane, stacking below lg */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left Pane - Tabs + Content */}
        <div
          className="flex flex-col min-w-0 min-h-0 basis-1/2 lg:basis-auto lg:w-1/2 border-b lg:border-b-0 lg:border-r"
          style={{ borderColor: 'var(--border-color)' }}
        >
          {/* Tab Navigation — same strip pattern as the client form pane */}
          <div
            className="flex border-b overflow-x-auto shrink-0"
            style={{ borderColor: 'var(--border-color)' }}
            ref={tabStripRef}
            onWheel={handleWheel}
          >
            {TABS.map(({ key, icon: Icon }) => {
              const isActive = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  ref={registerTabButton(key)}
                  onClick={() => setTab(key)}
                  className="relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors shrink-0"
                  style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
                >
                  <Icon size={16} />
                  {t(`server.tab.${key}`)}

                  {/* One shared underline sliding between tabs — see FormPane. */}
                  {isActive && (
                    <motion.span
                      layoutId="server-tab-underline"
                      className="absolute left-0 right-0 bottom-0 h-0.5"
                      style={{ backgroundColor: 'var(--accent)' }}
                      transition={anim.layoutSpring}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-hidden min-h-0">
            {tab === 'overview' && <OverviewTab onGoTo={(next) => setTab(next)} />}
            {tab === 'general' && <GeneralTab />}
            {tab === 'listeners' && (
              <ListenerListTab
                problemsByListener={problemsByListener}
                editingId={editingId}
                onEdit={setEditingId}
              />
            )}
            {tab === 'outbound' && <OutboundTab />}
            {tab === 'rules' && <RuleTab />}
            {tab === 'dns' && <DnsTab />}
            {tab === 'validation' && (
              <ValidationTab
                onGotoListener={(id) => {
                  setTab('listeners');
                  setEditingId(id);
                }}
              />
            )}
          </div>
        </div>

        <ServerPreviewPane />
      </div>

      {editing && tab === 'listeners' && (
        <ListenerEditorPanel listener={editing} onClose={() => setEditingId(null)} />
      )}

      <ServerConfigDetailsDialog isOpen={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </div>
  );
}
