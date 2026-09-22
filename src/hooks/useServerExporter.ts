import { useMemo } from 'react';
import { useServerStore } from '../store/serverStore';
import { ServerYamlExporter } from '../core/server/exporters/serverYaml';

const exporter = new ServerYamlExporter();

export function useServerExporter(): { yaml: string; error: string | null } {
  const config = useServerStore((state) => state.config);

  return useMemo(() => {
    try {
      return { yaml: exporter.export(config), error: null };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'server export failed with an unknown error';
      return {
        yaml: `# export error\n# ${message.replace(/\n/g, '\n# ')}\n`,
        error: message,
      };
    }
  }, [config]);
}
