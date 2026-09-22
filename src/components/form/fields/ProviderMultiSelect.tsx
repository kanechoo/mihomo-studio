import { useTranslation } from 'react-i18next';
import { X, AlertTriangle } from 'lucide-react';
import { useIRStore } from '../../../store/irStore';

interface ProviderMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
}

// Picks the proxy providers a group pulls in whole.
//
// Deliberately a separate control from the member picker rather than more
// entries in it. A member is one outbound, named; a `use:` entry is a whole
// subscription whose nodes this app never sees and cannot list. Putting them in
// one list would suggest they were the same kind of thing, and then leave the
// user wondering why the provider does not expand.
export function ProviderMultiSelect({ value = [], onChange }: ProviderMultiSelectProps) {
  const { t } = useTranslation();
  const proxyProviders = useIRStore((state) => state.ir.proxyProviders);

  const available = Object.keys(proxyProviders || {});
  const unselected = available.filter((name) => !value.includes(name));

  const handleAdd = (name: string) => {
    if (!value.includes(name)) onChange([...value, name]);
  };

  const handleRemove = (name: string) => {
    onChange(value.filter((entry) => entry !== name));
  };

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('proxyGroup.selectedProviders')} ({value.length})
          </label>
          <div className="flex flex-wrap gap-2">
            {value.map((name) => {
              // Deleting a provider takes it out of every group's `use:`, so a
              // chip with nothing behind it comes from somewhere the editor did
              // not do the deleting — an imported config, or a hand-edit in the
              // YAML pane. Marked rather than dropped: mihomo will not start
              // until it either resolves or goes, and the name is the only
              // record of what was meant.
              const missing = !available.includes(name);
              return (
                <div
                  key={name}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm ${
                    missing
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  }`}
                  title={missing ? t('proxyGroup.providerMissing', { name }) : undefined}
                >
                  {missing && <AlertTriangle className="w-3 h-3" />}
                  <span>{name}</span>
                  <button
                    onClick={() => handleRemove(name)}
                    className={`ml-1 rounded-full p-0.5 ${
                      missing
                        ? 'hover:bg-red-200 dark:hover:bg-red-800'
                        : 'hover:bg-purple-200 dark:hover:bg-purple-800'
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

      {unselected.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('proxyGroup.availableProviders')}
          </label>
          <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg">
            {unselected.map((name) => (
              <button
                key={name}
                onClick={() => handleAdd(name)}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between"
              >
                <span className="text-sm text-gray-900 dark:text-gray-100">{name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {proxyProviders[name].type}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {available.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          {t('proxyGroup.noProvidersAvailable')}
        </div>
      )}
    </div>
  );
}
