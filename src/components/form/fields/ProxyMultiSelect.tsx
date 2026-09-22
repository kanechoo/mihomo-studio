import { useTranslation } from 'react-i18next';
import { X, AlertTriangle } from 'lucide-react';
import { useIRStore } from '../../../store/irStore';
import { BUILT_IN_OUTBOUNDS } from '../../../core/ir/references';

interface ProxyMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  // The group being edited, so it can be kept out of its own member list.
  allValues: Record<string, any>;
}

// What a member is, said in the one word the list has room for.
const MEMBER_KINDS = {
  proxy: 'proxyGroup.proxyNode',
  group: 'proxyGroup.proxyGroup',
  builtin: 'proxyGroup.builtIn',
} as const;

export function ProxyMultiSelect({ value = [], onChange, allValues }: ProxyMultiSelectProps) {
  const { t } = useTranslation();
  const proxies = useIRStore((state) => state.ir.proxies);
  const proxyGroups = useIRStore((state) => state.ir.proxyGroups);

  // Combine proxies and proxy groups for selection
  const editingGroupId = allValues?.id;
  const configured = [
    ...proxies.map((p) => ({ name: p.name, type: 'proxy' as const })),
    // A group cannot be its own member — mihomo rejects the config outright.
    // Excluded by id rather than by name, because a rename typed into the field
    // above has not reached the store yet: the entry to drop is still listed
    // under the old name.
    ...proxyGroups
      .filter((g) => g.id !== editingGroupId)
      .map((g) => ({ name: g.name, type: 'group' as const })),
  ];

  // mihomo's own outbounds are members like any other. Offered last because
  // that is where they belong in a group — DIRECT and REJECT are what a list of
  // nodes ends with, not what it is for.
  const availableProxies = [
    ...configured,
    ...BUILT_IN_OUTBOUNDS.map((name) => ({ name, type: 'builtin' as const })),
  ];

  const handleAdd = (proxyName: string) => {
    if (!value.includes(proxyName)) {
      onChange([...value, proxyName]);
    }
  };

  const handleRemove = (proxyName: string) => {
    onChange(value.filter((name) => name !== proxyName));
  };

  const unselectedProxies = availableProxies.filter(
    (p) => !value.includes(p.name)
  );

  return (
    <div className="space-y-3">
      {/* Selected proxies */}
      {value.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('proxyGroup.selectedProxies')} ({value.length})
          </label>
          <div className="flex flex-wrap gap-2">
            {value.map((proxyName) => {
              const proxy = availableProxies.find((p) => p.name === proxyName);
              // Deleting a member takes its name out of the list, so a chip
              // with nothing behind it means the member was renamed rather
              // than removed. Marked rather than dropped: the name is the only
              // record of what was meant, and mihomo will not start until it
              // either resolves or goes.
              const missing = !proxy;
              return (
                <div
                  key={proxyName}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm ${
                    missing
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  }`}
                  title={missing ? t('common.nameMissing', { name: proxyName }) : undefined}
                >
                  {missing && <AlertTriangle className="w-3 h-3" />}
                  <span>{proxyName}</span>
                  {proxy && (
                    <span className="text-xs opacity-75">
                      ({t(MEMBER_KINDS[proxy.type])})
                    </span>
                  )}
                  <button
                    onClick={() => handleRemove(proxyName)}
                    className={`ml-1 rounded-full p-0.5 ${
                      missing
                        ? 'hover:bg-red-200 dark:hover:bg-red-800'
                        : 'hover:bg-blue-200 dark:hover:bg-blue-800'
                    }`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available proxies */}
      {unselectedProxies.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('proxyGroup.availableProxies')}
          </label>
          <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg">
            {unselectedProxies.map((proxy) => (
              <button
                key={proxy.name}
                onClick={() => handleAdd(proxy.name)}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between group"
              >
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  {proxy.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t(MEMBER_KINDS[proxy.type])}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The list above is never empty — the built-ins are always in it — so
          this says what is missing rather than that there is nothing to pick. */}
      {configured.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          {t('proxyGroup.noProxiesAvailable')}
        </div>
      )}
    </div>
  );
}
