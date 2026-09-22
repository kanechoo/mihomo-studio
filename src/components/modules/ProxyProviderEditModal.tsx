import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import yaml from 'js-yaml';
import { useIRStore } from '../../store/irStore';
import { Select } from '../common/Select';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';
import {
  PROXY_PROVIDER_FIELDS,
  PROXY_PROVIDER_OVERRIDE_FIELDS,
  unmodelledKeys,
} from '../../core/ir';
import type { ProxyProvider } from '../../core/ir';

interface ProxyProviderEditModalProps {
  name?: string;
  provider?: ProxyProvider;
  onClose: () => void;
  onSave: (name: string, provider: ProxyProvider) => void;
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
    <div className="rounded-md border p-3" style={{ borderColor: 'var(--border-color)' }}>
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

// One labelled row inside a block that is already gated by a toggle above it.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function ProxyProviderEditModal({
  name,
  provider,
  onClose,
  onSave,
}: ProxyProviderEditModalProps) {
  const { t } = useTranslation();
  const isEditing = !!name;
  const proxies = useIRStore((state) => state.ir.proxies);
  const proxyGroups = useIRStore((state) => state.ir.proxyGroups);

  const [providerName, setProviderName] = useState(name || '');
  const [type, setType] = useState<ProxyProvider['type']>(provider?.type || 'http');
  const [url, setUrl] = useState(provider?.url || '');
  const [path, setPath] = useState(provider?.type === 'file' ? provider?.path || '' : '');
  // Inline proxies are mappings, not one-liners the way an inline rule is, so
  // this is the YAML itself rather than a line-per-entry box. Held as text
  // between edits: a half-typed node is not parseable, and reformatting the
  // box on every keystroke would fight whoever is typing into it.
  const [payload, setPayload] = useState(
    provider?.payload?.length ? yaml.dump(provider.payload, { lineWidth: -1 }) : ''
  );

  // Fetch arguments, http only, each gated by its own toggle.
  const [useInterval, setUseInterval] = useState(provider?.interval !== undefined);
  const [interval, setIntervalValue] = useState(provider?.interval?.toString() || '3600');
  const [useCachePath, setUseCachePath] = useState(
    !!(provider?.type === 'http' && provider?.path)
  );
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

  // Health check. A new provider arrives with this on, which is why the toggle
  // reads from the value rather than defaulting to off.
  const health = provider?.['health-check'];
  const [useHealth, setUseHealth] = useState(health?.enable ?? false);
  const [healthUrl, setHealthUrl] = useState(
    health?.url || 'https://www.gstatic.com/generate_204'
  );
  const [healthInterval, setHealthInterval] = useState(health?.interval?.toString() || '300');
  const [healthTimeout, setHealthTimeout] = useState(health?.timeout?.toString() || '5000');
  const [healthLazy, setHealthLazy] = useState(health?.lazy ?? true);

  // Override.
  const override = provider?.override;
  const [useOverride, setUseOverride] = useState(
    !!override && Object.keys(override).length > 0
  );
  const [prefix, setPrefix] = useState(override?.['additional-prefix'] || '');
  const [suffix, setSuffix] = useState(override?.['additional-suffix'] || '');
  const [overrideUdp, setOverrideUdp] = useState<string>(
    override?.udp === undefined ? '' : String(override.udp)
  );
  const [overrideSkipCert, setOverrideSkipCert] = useState<string>(
    override?.['skip-cert-verify'] === undefined ? '' : String(override['skip-cert-verify'])
  );
  const [ipVersion, setIpVersion] = useState(override?.['ip-version'] || '');

  // Node selection.
  const [filter, setFilter] = useState(provider?.filter || '');
  const [excludeFilter, setExcludeFilter] = useState(provider?.['exclude-filter'] || '');
  const [excludeType, setExcludeType] = useState(provider?.['exclude-type'] || '');

  const [error, setError] = useState('');

  useEffect(() => {
    if (!provider) return;
    setType(provider.type);
    setUrl(provider.url || '');
    setPath(provider.type === 'file' ? provider.path || '' : '');
    setPayload(provider.payload?.length ? yaml.dump(provider.payload, { lineWidth: -1 }) : '');
    setUseInterval(provider.interval !== undefined);
    setIntervalValue(provider.interval?.toString() || '3600');
    setUseCachePath(provider.type === 'http' && !!provider.path);
    setCachePath(provider.type === 'http' ? provider.path || '' : '');
    setUseProxy(!!provider.proxy);
    setProxy(provider.proxy || '');
    setUseSizeLimit(provider['size-limit'] !== undefined);
    setSizeLimit(provider['size-limit']?.toString() || '0');
    setUseHeader(!!provider.header && Object.keys(provider.header).length > 0);
    const hc = provider['health-check'];
    setUseHealth(hc?.enable ?? false);
    setHealthUrl(hc?.url || 'https://www.gstatic.com/generate_204');
    setHealthInterval(hc?.interval?.toString() || '300');
    setHealthTimeout(hc?.timeout?.toString() || '5000');
    setHealthLazy(hc?.lazy ?? true);
    const ov = provider.override;
    setUseOverride(!!ov && Object.keys(ov).length > 0);
    setPrefix(ov?.['additional-prefix'] || '');
    setSuffix(ov?.['additional-suffix'] || '');
    setOverrideUdp(ov?.udp === undefined ? '' : String(ov.udp));
    setOverrideSkipCert(
      ov?.['skip-cert-verify'] === undefined ? '' : String(ov['skip-cert-verify'])
    );
    setIpVersion(ov?.['ip-version'] || '');
    setFilter(provider.filter || '');
    setExcludeFilter(provider['exclude-filter'] || '');
    setExcludeType(provider['exclude-type'] || '');
  }, [provider]);

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
      setError(t('proxyProvider.error.nameRequired'));
      return;
    }
    if (type === 'http' && !url.trim()) {
      setError(t('proxyProvider.error.urlRequired'));
      return;
    }
    if (type === 'file' && !path.trim()) {
      setError(t('proxyProvider.error.pathRequired'));
      return;
    }

    let inlinePayload: any[] = [];
    if (type === 'inline') {
      let parsed: unknown;
      try {
        parsed = yaml.load(payload);
      } catch {
        setError(t('proxyProvider.error.payloadInvalid'));
        return;
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setError(t('proxyProvider.error.payloadRequired'));
        return;
      }
      inlinePayload = parsed;
    }

    // Whatever this form has no control for is put back exactly as it came in.
    // An imported provider can carry an `age-secret-key` or an `override-expr`,
    // and a save from a dialog that never showed them should not be the thing
    // that deletes them.
    const next: ProxyProvider = {
      ...unmodelledKeys(provider as Record<string, any>, PROXY_PROVIDER_FIELDS),
      type,
    };

    if (type === 'http') {
      next.url = url.trim();
      if (useCachePath && cachePath.trim()) next.path = cachePath.trim();
      if (useInterval) next.interval = parseInt(interval, 10) || 3600;
      if (useProxy && proxy) next.proxy = proxy;
      if (useSizeLimit) next['size-limit'] = parseInt(sizeLimit, 10) || 0;
      if (useHeader) {
        const header = parseHeader();
        if (Object.keys(header).length > 0) next.header = header;
      }
    } else if (type === 'file') {
      next.path = path.trim();
    } else {
      next.payload = inlinePayload;
    }

    if (useHealth) {
      next['health-check'] = {
        // Sub-keys with no control of their own — `expected-status` is the one
        // that turns up in real configs — ride across the edit unchanged.
        ...unmodelledKeys(health as Record<string, any>, [
          'enable',
          'url',
          'interval',
          'timeout',
          'lazy',
        ]),
        enable: true,
        url: healthUrl.trim() || undefined,
        interval: parseInt(healthInterval, 10) || 300,
        timeout: parseInt(healthTimeout, 10) || 5000,
        lazy: healthLazy,
      };
    }

    if (useOverride) {
      const ov: Record<string, any> = unmodelledKeys(
        override as Record<string, any>,
        PROXY_PROVIDER_OVERRIDE_FIELDS
      );
      if (prefix) ov['additional-prefix'] = prefix;
      if (suffix) ov['additional-suffix'] = suffix;
      // Three states, not two: unset means "leave the node as the subscription
      // wrote it", which is not the same as forcing it off.
      if (overrideUdp !== '') ov.udp = overrideUdp === 'true';
      if (overrideSkipCert !== '') ov['skip-cert-verify'] = overrideSkipCert === 'true';
      if (ipVersion) ov['ip-version'] = ipVersion as NonNullable<
        NonNullable<ProxyProvider['override']>['ip-version']
      >;
      if (Object.keys(ov).length > 0) next.override = ov;
    }

    if (filter.trim()) next.filter = filter.trim();
    if (excludeFilter.trim()) next['exclude-filter'] = excludeFilter.trim();
    if (excludeType.trim()) next['exclude-type'] = excludeType.trim();

    onSave(providerName.trim(), next);
  };

  const policyOptions = [
    ...proxyGroups.map((g) => g.name),
    ...proxies.map((p) => p.name),
  ];

  // Set when the proxy this provider downloads through has since been deleted.
  // DIRECT is always available and is not one of the config's own names.
  const proxyMissing = !!proxy && proxy !== 'DIRECT' && !policyOptions.includes(proxy);

  const boolItems = [
    { value: '', label: t('proxyProvider.overrideUnset') },
    { value: 'true', label: t('common.yes') },
    { value: 'false', label: t('common.no') },
  ];

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
            {isEditing ? t('proxyProvider.edit') : t('proxyProvider.add')}
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
              {t('proxyProvider.name')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              disabled={isEditing}
              placeholder={t('proxyProvider.namePlaceholder')}
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
              {t('proxyProvider.type')}
            </label>
            <Select<ProxyProvider['type']>
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

          {/* URL */}
          {type === 'http' && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                {t('proxyProvider.url')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/subscription"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          )}

          {/* Path */}
          {type === 'file' && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                {t('proxyProvider.path')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="./providers/local.yaml"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          )}

          {/* Inline payload */}
          {type === 'inline' && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                {t('proxyProvider.payload')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                rows={8}
                placeholder={
                  '- name: "node-1"\n  type: ss\n  server: example.com\n  port: 443\n  cipher: chacha20-ietf-poly1305\n  password: "secret"'
                }
                className={`${inputClass} font-mono`}
                style={inputStyle}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {t('proxyProvider.payloadDescription')}
              </p>
            </div>
          )}

          {/* Node selection. Applies whatever the type is: an inline list can
              be filtered down the same way a fetched one can. */}
          <div className="pt-2">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
              {t('proxyProvider.selection')}
            </h3>
            <div className="space-y-3">
              <Row label={t('proxyProvider.filter')}>
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="(?i)港|hk|hongkong"
                  className={inputClass}
                  style={inputStyle}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {t('proxyProvider.filterDescription')}
                </p>
              </Row>
              <Row label={t('proxyProvider.excludeFilter')}>
                <input
                  type="text"
                  value={excludeFilter}
                  onChange={(e) => setExcludeFilter(e.target.value)}
                  placeholder="到期|剩余|官网"
                  className={inputClass}
                  style={inputStyle}
                />
              </Row>
              <Row label={t('proxyProvider.excludeType')}>
                <input
                  type="text"
                  value={excludeType}
                  onChange={(e) => setExcludeType(e.target.value)}
                  placeholder="ss|http"
                  className={inputClass}
                  style={inputStyle}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {t('proxyProvider.excludeTypeDescription')}
                </p>
              </Row>
            </div>
          </div>

          {/* Health check and override, then the fetch arguments. */}
          <div className="pt-2">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
              {t('proxyProvider.optionalArgs')}
            </h3>
            <div className="space-y-3">
              <OptionalArg
                label={t('proxyProvider.healthCheck')}
                hint={t('proxyProvider.healthCheckDescription')}
                enabled={useHealth}
                onToggle={setUseHealth}
              >
                <div className="space-y-3">
                  <Row label={t('proxyProvider.healthUrl')}>
                    <input
                      type="text"
                      value={healthUrl}
                      onChange={(e) => setHealthUrl(e.target.value)}
                      placeholder="https://www.gstatic.com/generate_204"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </Row>
                  <Row label={t('proxyProvider.healthInterval')}>
                    <input
                      type="number"
                      value={healthInterval}
                      onChange={(e) => setHealthInterval(e.target.value)}
                      placeholder="300"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </Row>
                  <Row label={t('proxyProvider.healthTimeout')}>
                    <input
                      type="number"
                      value={healthTimeout}
                      onChange={(e) => setHealthTimeout(e.target.value)}
                      placeholder="5000"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </Row>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={healthLazy}
                      onChange={(e) => setHealthLazy(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {t('proxyProvider.healthLazy')}
                    </span>
                  </label>
                </div>
              </OptionalArg>

              <OptionalArg
                label={t('proxyProvider.override')}
                hint={t('proxyProvider.overrideDescription')}
                enabled={useOverride}
                onToggle={setUseOverride}
              >
                <div className="space-y-3">
                  <Row label={t('proxyProvider.overridePrefix')}>
                    <input
                      type="text"
                      value={prefix}
                      onChange={(e) => setPrefix(e.target.value)}
                      placeholder="HK | "
                      className={inputClass}
                      style={inputStyle}
                    />
                  </Row>
                  <Row label={t('proxyProvider.overrideSuffix')}>
                    <input
                      type="text"
                      value={suffix}
                      onChange={(e) => setSuffix(e.target.value)}
                      placeholder=" | v2"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </Row>
                  <Row label={t('proxyProvider.overrideUdp')}>
                    <Select value={overrideUdp} onChange={setOverrideUdp} className={inputClass} items={boolItems} />
                  </Row>
                  <Row label={t('proxyProvider.overrideSkipCertVerify')}>
                    <Select
                      value={overrideSkipCert}
                      onChange={setOverrideSkipCert}
                      className={inputClass}
                      items={boolItems}
                    />
                  </Row>
                  <Row label={t('proxyProvider.overrideIpVersion')}>
                    <Select
                      value={ipVersion}
                      onChange={(v) => setIpVersion(v as typeof ipVersion)}
                      className={inputClass}
                      items={[
                        { value: '', label: t('proxyProvider.overrideUnset') },
                        { value: 'dual', label: 'dual' },
                        { value: 'ipv4', label: 'ipv4' },
                        { value: 'ipv6', label: 'ipv6' },
                        { value: 'ipv4-prefer', label: 'ipv4-prefer' },
                        { value: 'ipv6-prefer', label: 'ipv6-prefer' },
                      ]}
                    />
                  </Row>
                </div>
              </OptionalArg>

              {type === 'http' && (
                <>
                  <OptionalArg
                    label={t('proxyProvider.interval')}
                    hint={t('proxyProvider.intervalDescription')}
                    enabled={useInterval}
                    onToggle={setUseInterval}
                  >
                    <input
                      type="number"
                      value={interval}
                      onChange={(e) => setIntervalValue(e.target.value)}
                      placeholder="3600"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </OptionalArg>

                  <OptionalArg
                    label={t('proxyProvider.cachePath')}
                    hint={t('proxyProvider.cachePathDescription')}
                    enabled={useCachePath}
                    onToggle={setUseCachePath}
                  >
                    <input
                      type="text"
                      value={cachePath}
                      onChange={(e) => setCachePath(e.target.value)}
                      placeholder="./providers/sub1.yaml"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </OptionalArg>

                  <OptionalArg
                    label={t('proxyProvider.proxy')}
                    hint={t('proxyProvider.proxyDescription')}
                    enabled={useProxy}
                    onToggle={setUseProxy}
                  >
                    <Select
                      value={proxy}
                      onChange={setProxy}
                      className={inputClass}
                      invalid={proxyMissing}
                      items={[
                        { value: '', label: t('proxyProvider.selectProxy') },
                        { value: 'DIRECT', label: 'DIRECT' },
                        // Kept as an option so the control shows what is
                        // actually stored, rather than reading "Select a
                        // proxy" over a config that still carries a dead name.
                        ...(proxyMissing ? [{ value: proxy, label: proxy }] : []),
                        ...policyOptions.map((p) => ({ value: p, label: p })),
                      ]}
                    />
                    {proxyMissing && (
                      <p className="text-xs mt-1 text-red-500">
                        {t('common.nameMissing', { name: proxy })}
                      </p>
                    )}
                  </OptionalArg>

                  <OptionalArg
                    label={t('proxyProvider.sizeLimit')}
                    hint={t('proxyProvider.sizeLimitDescription')}
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
                    label={t('proxyProvider.header')}
                    hint={t('proxyProvider.headerDescription')}
                    enabled={useHeader}
                    onToggle={setUseHeader}
                  >
                    <textarea
                      value={headerText}
                      onChange={(e) => setHeaderText(e.target.value)}
                      rows={3}
                      placeholder={'User-Agent: clash.meta\nAuthorization: token 123'}
                      className={`${inputClass} font-mono`}
                      style={inputStyle}
                    />
                  </OptionalArg>
                </>
              )}
            </div>
          </div>
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
