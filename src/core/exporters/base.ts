import type { MihomoIR } from '../ir/types';

// Base exporter interface for pluggable export formats
export interface IExporter {
  name: string;
  version: string;
  export(ir: MihomoIR): string;
}
