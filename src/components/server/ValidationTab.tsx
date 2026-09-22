import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { useServerProblems } from '../../hooks/useServerValidation';

interface ValidationTabProps {
  onGotoListener: (id: string) => void;
}

const SEVERITY_ORDER = ['error', 'warning', 'info'] as const;

const SEVERITY_ICON = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const SEVERITY_COLOR: Record<string, string> = {
  error: '#ef4444',
  warning: '#f59e0b',
  info: 'var(--text-secondary)',
};

export function ValidationTab({ onGotoListener }: ValidationTabProps) {
  const { t } = useTranslation();
  const problems = useServerProblems();

  if (problems.length === 0) {
    return (
      <div className="p-6 h-full overflow-y-auto flex flex-col items-center justify-center gap-2 text-center">
        <CheckCircle2 size={28} style={{ color: 'var(--accent)' }} />
        <p className="text-sm" style={{ color: 'var(--accent)' }}>
          {t('server.validation.allClear')}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-y-auto h-full space-y-3">
      {SEVERITY_ORDER.map((severity) => {
        const group = problems.filter((p) => p.severity === severity);
        if (group.length === 0) return null;
        const Icon = SEVERITY_ICON[severity];
        return (
          <div key={severity}>
            <p
              className="flex items-center gap-1.5 text-xs font-semibold uppercase mb-1"
              style={{ color: SEVERITY_COLOR[severity] }}
            >
              <Icon size={12} />
              {t(`server.validation.${severity}`)} · {group.length}
            </p>
            <ul className="space-y-1">
              {group.map((problem, index) => (
                <li
                  key={`${problem.code}-${problem.listenerId ?? 'doc'}-${index}`}
                  className="flex items-start gap-2 p-2 rounded-md border text-xs"
                  style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
                >
                  <span className="mt-0.5 shrink-0" style={{ color: SEVERITY_COLOR[severity] }}>
                    <Icon size={13} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      disabled={!problem.listenerId}
                      onClick={() => problem.listenerId && onGotoListener(problem.listenerId)}
                      className="text-left w-full disabled:cursor-default"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {problem.listenerName && (
                        <span className="font-medium mr-1.5">{problem.listenerName}</span>
                      )}
                      <span>{t(problem.code, problem.params as Record<string, unknown>)}</span>
                      {(problem.section || problem.field) && (
                        <span className="block font-mono mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {[problem.section, problem.field].filter(Boolean).join(' › ')}
                        </span>
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
