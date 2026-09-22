// Parser interface and types
import type { ProxyNode } from '../ir/types';

export interface ParseResult {
  success: boolean;
  nodes: ProxyNode[];
  errors?: string[];
}

export interface IParser {
  name: string;
  canParse(uri: string): boolean;
  parse(uri: string): Promise<ParseResult>;
}
