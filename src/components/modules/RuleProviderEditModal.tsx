import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useIRStore } from '../../store/irStore';
import { Select } from '../common/Select';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';
import type { RuleProvider } from '../../core/ir';

interface RuleProviderEditModalProps {
  name?: string;
  provider?: RuleProvider;
  onClose: () => void;
  onSave: (name: string, provider: RuleProvider) => void;
}

const inputClass = 'w-full px-3 py-2 rounded-md border text-sm';
const inputStyle = {
  backgroundColor: 'var(--bg-primary)',
  borderColor: 'var(--border-color)',
  color: 'var(--text-primary)',
};

// An optional argument: hidden until the user enables it, so the generated
// config stays minimal instead of carrying every default.
function OptionalArg({
  label,
  hint,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  hint?: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md border p-3"
      style={{ borderColor: 'var(--border-color)' }}
    >
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-4 h-4"
        />
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
      </label>
      {hint && (
        <p className="text-xs mt-1 ml-6" style={{ color: 'var(--text-tertiary)' }}>
          {hint}
        </p>
      )}
      {enabled && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function RuleProviderEditModal({
  name,
  provider,
  onClose,
  onSave,
}: RuleProviderEditModalProps) {
  const { t } = useTranslation();
  const isEditing = !!name;
  const proxies = useIRStore((state) => state.ir.proxies);
  const proxyGroups = useIRStore((state) => state.ir.proxyGroups);

  const [providerName, setProviderName] = useState(name || '');
  const [type, setType] = useState<RuleProvider['type']>(provider?.type || 'http');
  const [behavior, setBehavior] = useState<RuleProvider['behavior']>(
    provider?.behavior || 'domain'
  );
  const [url, setUrl] = useState(provider?.url || '');
  const [path, setPath] = useState(provider?.path || '');
  const [payload, setPayload] = useState((provider?.payload || []).join('\n'));

  // Optional arguments, each gated by its own toggle.
  const [useFormat, setUseFormat] = useState(!!provider?.format);
  const [format, setFormat] = useState<NonNullable<RuleProvider['format']>>(
    provider?.format || 'yaml'
  );
  const [useInterval, setUseInterval] = useState(provider?.interval !== undefined);
  const [interval, setInterval] = useState(provider?.interval?.toString() || '86400');
  const [useCachePath, setUseCachePath] = useState(!!(provider?.type === 'http' && provider?.path));
  const [cachePath, setCachePath] = useState(
    provider?.type === 'http' ? provider?.path || '' : ''
  );
  const [useProxy, setUseProxy] = useState(!!provider?.proxy);
  const [proxy, setProxy] = useState(provider?.proxy || '');
  const [useSizeLimit, setUseSizeLimit] = useState(provider?.['size-limit'] !== undefined);
  const [sizeLimit, setSizeLimit] = useState(provider?.['size-limit']?.toString() || '0');
  const [useHeader, setUseHeader] = useState(
    !!provider?.header && Object.keys(provider.header).length > 0
  );
  const [headerText, setHeaderText] = useState(
    provider?.header
      ? Object.entries(provider.header)
          .flatMap(([k, vs]) => vs.map((v) => `${k}: ${v}`))
          .join('\n')
      : ''
  );

  const [error, setError] = useState('');

  useEffect(() => {
    if (!provider) return;
    setType(provider.type);
    setBehavior(provider.behavior);
    setUrl(provider.url || '');
    setPath(provider.type === 'file' ? provider.path || '' : '');
    setPayload((provider.payload || []).join('\n'));
    setUseFormat(!!provider.format);
    setFormat(provider.format || 'yaml');
    setUseInterval(provider.interval !== undefined);
    setInterval(provider.interval?.toString() || '86400');
    setUseCachePath(provider.type === 'http' && !!provider.path);
    setCachePath(provider.type === 'http' ? provider.path || '' : '');
    setUseProxy(!!provider.proxy);
    setProxy(provider.proxy || '');
    setUseSizeLimit(provider['size-limit'] !== undefined);
    setSizeLimit(provider['size-limit']?.toString() || '0');
    setUseHeader(!!provider.header && Object.keys(provider.header).length > 0);
  }, [provider]);

  // `mrs` is only supported for domain/ipcidr behaviors.
  const mrsAllowed = behavior !== 'classical' && type !== 'inline';
  useEffect(() => {
    if (format === 'mrs' && !mrsAllowed) setFormat('yaml');
  }, [format, mrsAllowed]);

  const parseHeader = (): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    headerText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const idx = line.indexOf(':');
        if (idx === -1) return;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (!key) return;
        (result[key] ||= []).push(value);
      });
    return result;
  };

  const handleSave = () => {
    if (!providerName.trim()) {
      setError(t('ruleProvider.error.nameRequired'));
      return;
    }
    if (type === 'http' && !url.trim()) {
      setError(t('ruleProvider.error.urlRequired'));
      return;
    }
    if (type === 'file' && !path.trim()) {
      setError(t('ruleProvider.error.pathRequired'));
      return;
    }
    if (type === 'inline' && !payload.trim()) {
      setError(t('ruleProvider.error.payloadRequired'));
      return;
    }

    const next: RuleProvider = { type, behavior };

    // Not `if (useFormat)` alone: the toggle survives a switch to `inline`,
    // where the control is no longer on screen to turn off, and would emit a
    // `format` an inline payload has no use for.
    if (useFormat && type !== 'inline') next.format = format;

    if (type === 'http') {
      next.url = url.trim();
      if (useCachePath && cachePath.trim()) next.path = cachePath.trim();
      if (useInterval) next.interval = parseInt(interval, 10) || 86400;
      if (useProxy && proxy) next.proxy = proxy;
      if (useSizeLimit) next['size-limit'] = parseInt(sizeLimit, 10) || 0;
      if (useHeader) {
        const header = parseHeader();
        if (Object.keys(header).length > 0) next.header = header;
      }
    } else if (type === 'file') {
      next.path = path.trim();
    } else {
      next.payload = payload
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    }

    onSave(providerName.trim(), next);
  };

  const policyOptions = [
    ...proxyGroups.map((g) => g.name),
    ...proxies.map((p) => p.name),
  ];

  // Set when the proxy this provider downloads through has since been deleted.
  // DIRECT is always available and is not one of the config's own names.
  const proxyMissing = !!proxy && proxy !== 'DIRECT' && !policyOptions.includes(proxy);

  // Out to the body: this modal is mounted inside a `space-y-4` list, whose
  // child margins would otherwise offset and shrink the fixed backdrop — a
  // strip of page left uncovered at the top of the window. See common/Modal.
  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      {/* The scrollable card sits inside a clipped shell. Left alone, the
          scrollbar runs the full height of the rounded card — and a scrollbar
          does not follow border-radius, so the right edge read as square. */}
      <div
        className="rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {/* Pinned above the scroll area with the same divider line as the
            footer, so the header never scrolls away either. */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {isEditing ? t('ruleProvider.edit') : t('ruleProvider.add')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-opacity-10 hover:bg-white"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-0">
        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-500 bg-opacity-10 text-red-500 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              {t('ruleProvider.name')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              disabled={isEditing}
              placeholder={t('ruleProvider.namePlaceholder')}
              className={inputClass}
              style={{
                ...inputStyle,
                backgroundColor: isEditing ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
              }}
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              {t('ruleProvider.type')}
            </label>
            <Select<RuleProvider['type']>
              value={type}
              onChange={setType}
              className={inputClass}
              items={[
                { value: 'http', label: 'HTTP' },
                { value: 'file', label: 'File' },
                { value: 'inline', label: 'Inline' },
              ]}
            />
          </div>

          {/* Behavior */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              {t('ruleProvider.behavior')}
            </label>
            <Select<RuleProvider['behavior']>
              value={behavior}
              onChange={setBehavior}
              className={inputClass}
              items={[
                { value: 'domain', label: 'Domain' },
                { value: 'ipcidr', label: 'IP CIDR' },
                { value: 'classical', label: 'Classical' },
              ]}
            />
          </div>

          {/* URL */}
          {type === 'http' && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                {t('ruleProvider.url')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/rules.yaml"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          )}

          {/* Path */}
          {type === 'file' && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                {t('ruleProvider.path')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="./rules/custom.yaml"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          )}

          {/* Inline payload */}
          {type === 'inline' && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                {t('ruleProvider.payload')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                rows={6}
                placeholder={"'+.example.com'\n'+.google.com'"}
                className={`${inputClass} font-mono`}
                style={inputStyle}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {t('ruleProvider.payloadDescription')}
              </p>
            </div>
          )}

          {/* Optional arguments. An inline provider carries its rules in the
              payload above and has nothing else to configure — `format`
              describes how a fetched list is encoded, and the rest are HTTP
              transport concerns — so the whole section goes with it rather
              than leaving a heading standing over an empty box. */}
          {type !== 'inline' && (
          <div className="pt-2">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
              {t('ruleProvider.optionalArgs')}
            </h3>
            <div className="space-y-3">
              <OptionalArg
                label={t('ruleProvider.format')}
                hint={t('ruleProvider.formatDescription')}
                enabled={useFormat}
                onToggle={setUseFormat}
              >
                <Select<NonNullable<RuleProvider['format']>>
                  value={format}
                  onChange={setFormat}
                  className={inputClass}
                  items={[
                    { value: 'yaml', label: 'yaml' },
                    { value: 'text', label: 'text' },
                    {
                      value: 'mrs',
                      label: `mrs${!mrsAllowed ? ` (${t('ruleProvider.mrsUnavailable')})` : ''}`,
                      disabled: !mrsAllowed,
                    },
                  ]}
                />
              </OptionalArg>

              {type === 'http' && (
                <>
                  <OptionalArg
                    label={t('ruleProvider.interval')}
                    hint={t('ruleProvider.intervalDescription')}
                    enabled={useInterval}
                    onToggle={setUseInterval}
                  >
                    <input
                      type="number"
                      value={interval}
                      onChange={(e) => setInterval(e.target.value)}
                      placeholder="86400"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </OptionalArg>

                  <OptionalArg
                    label={t('ruleProvider.cachePath')}
                    hint={t('ruleProvider.cachePathDescription')}
                    enabled={useCachePath}
                    onToggle={setUseCachePath}
                  >
                    <input
                      type="text"
                      value={cachePath}
                      onChange={(e) => setCachePath(e.target.value)}
                      placeholder="./ruleset/cached.yaml"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </OptionalArg>

                  <OptionalArg
                    label={t('ruleProvider.proxy')}
                    hint={t('ruleProvider.proxyDescription')}
                    enabled={useProxy}
                    onToggle={setUseProxy}
                  >
                    <Select
                      value={proxy}
                      onChange={setProxy}
                      className={inputClass}
                      invalid={proxyMissing}
                      items={[
                        { value: '', label: t('ruleProvider.selectProxy') },
                        { value: 'DIRECT', label: 'DIRECT' },
                        // Kept as an option so the control shows what is
                        // actually stored. Dropping it would leave the box
                        // reading "Select a proxy" over a config that still
                        // carries the dead name.
                        ...(proxyMissing ? [{ value: proxy, label: proxy }] : []),
                        ...policyOptions.map((p) => ({ value: p, label: p })),
                      ]}
                    />
                    {/* The proxy it used to download through has been deleted.
                        Left for the user to repoint rather than silently
                        cleared: fetching a rule set directly is a different
                        thing from fetching it through a proxy, and on a
                        blocked list URL it is the difference between working
                        and not. */}
                    {proxyMissing && (
                      <p className="text-xs mt-1 text-red-500">
                        {t('common.nameMissing', { name: proxy })}
                      </p>
                    )}
                  </OptionalArg>

                  <OptionalArg
                    label={t('ruleProvider.sizeLimit')}
                    hint={t('ruleProvider.sizeLimitDescription')}
                    enabled={useSizeLimit}
                    onToggle={setUseSizeLimit}
                  >
                    <input
                      type="number"
                      value={sizeLimit}
                      onChange={(e) => setSizeLimit(e.target.value)}
                      placeholder="0"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </OptionalArg>

                  <OptionalArg
                    label={t('ruleProvider.header')}
                    hint={t('ruleProvider.headerDescription')}
                    enabled={useHeader}
                    onToggle={setUseHeader}
                  >
                    <textarea
                      value={headerText}
                      onChange={(e) => setHeaderText(e.target.value)}
                      rows={3}
                      placeholder={'User-Agent: clash.meta\nAccept: application/json'}
                      className={`${inputClass} font-mono`}
                      style={inputStyle}
                    />
                  </OptionalArg>
                </>
              )}
            </div>
          </div>
          )}
        </div>

        </div>

        {/* Pinned under the scroll area — the same layout as the proxy-group
            modal: a divider, then Cancel/Save that never scroll away. */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <CancelButton onClick={onClose}>{t('common.cancel')}</CancelButton>
          <PrimaryButton onClick={handleSave}>{t('common.save')}</PrimaryButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
