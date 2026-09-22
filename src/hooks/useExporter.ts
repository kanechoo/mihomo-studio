import { useMemo } from 'react';
import { useIRStore } from '../store/irStore';
import { useUIStore } from '../store/uiStore';
import { MihomoExporter, SingBoxExporter } from '../core/exporters';

// Hook to get the export of current IR
export function useExporter() {
  const ir = useIRStore((state) => state.ir);
  const exportFormat = useUIStore((state) => state.exportFormat);

  const output = useMemo(() => {
    if (exportFormat === 'singbox') {
      const exporter = new SingBoxExporter();
      return exporter.export(ir);
    } else {
      const exporter = new MihomoExporter();
      return exporter.export(ir);
    }
  }, [ir, exportFormat]);

  return output;
}

// Hook to download config as file. The filename and MIME type follow the
// selected export format, so a sing-box export never lands as a .yaml file.
export function useDownloadConfig() {
  const output = useExporter();
  const exportFormat = useUIStore((state) => state.exportFormat);

  return (filename?: string) => {
    const defaultFilename = exportFormat === 'singbox' ? 'singbox-config.json' : 'mihomo-config.yaml';
    const contentType = exportFormat === 'singbox' ? 'application/json' : 'text/yaml';

    const blob = new Blob([output], { type: `${contentType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
}

// Hook to copy config to clipboard
export function useCopyConfig() {
  const output = useExporter();

  return async () => {
    try {
      await navigator.clipboard.writeText(output);
      return true;
    } catch (error) {
      console.error('Failed to copy:', error);
      return false;
    }
  };
}
