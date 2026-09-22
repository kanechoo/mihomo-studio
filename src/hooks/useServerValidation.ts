import { useMemo } from 'react';
import { useServerStore } from '../store/serverStore';
import { validateServerConfig, hasErrors } from '../core/server/validation';
import type { ServerProblem } from '../core/server/validation/problems';

export function useServerProblems(): ServerProblem[] {
  const config = useServerStore((state) => state.config);
  return useMemo(() => validateServerConfig(config), [config]);
}

export function useServerHasErrors(): boolean {
  return hasErrors(useServerProblems());
}
