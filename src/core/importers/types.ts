// Importer types for reverse parsing YAML to IR

import type { MihomoIR } from '../ir';

export interface ImportResult {
  success: boolean;
  ir?: MihomoIR;
  errors?: string[];
  warnings?: string[];
}

export interface IImporter {
  name: string;
  canImport(content: string): boolean;
  import(content: string): Promise<ImportResult>;
}
