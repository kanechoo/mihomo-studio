// Hysteria2 URI parser
// Format: hysteria2://password@server:port?key=value#name

import type { ProxyNode } from '../ir/types';
import type { IParser, ParseResult } from './types';
import { generateId } from '../ir/factory';

export class Hysteria2URIParser implements IParser {
  name = 'hysteria2';

  canParse(uri: string): boolean {
    return uri.trim().startsWith('hysteria2://') || uri.trim().startsWith('hy2://');
  }

  async parse(uri: string): Promise<ParseResult> {
    try {
      const trimmedUri = uri.trim();

      // Remove protocol prefix
      const withoutProtocol = trimmedUri.replace(/^(hysteria2|hy2):\/\//, '');

      // Split by # to separate main part and name
      const [mainPart, encodedName] = withoutProtocol.split('#');
      const name = encodedName ? decodeURIComponent(encodedName) : 'Hysteria2 Node';

      // Split by @ to separate password and server part
      const [password, serverPart] = mainPart.split('@');

      if (!password || !serverPart) {
        return {
          success: false,
          nodes: [],
          errors: ['Invalid Hysteria2 URI format: missing password or server'],
        };
      }

      // Split server part by ? to separate server:port and params
      const [serverPort, paramString] = serverPart.split('?');
      const [server, portStr] = serverPort.split(':');
      const port = parseInt(portStr, 10);

      if (!server || isNaN(port)) {
        return {
          success: false,
          nodes: [],
          errors: ['Invalid Hysteria2 URI format: missing or invalid server/port'],
        };
      }

      // Parse query parameters
      const params = new URLSearchParams(paramString || '');

      const obfs = params.get('obfs') || '';
      const obfsPassword = params.get('obfs-password') || params.get('obfsPassword') || '';
      const sni = params.get('sni') || '';
      const insecure = params.get('insecure') === '1' || params.get('insecure') === 'true';
      const up = params.get('up') || params.get('upmbps') || '';
      const down = params.get('down') || params.get('downmbps') || '';

      // Build config object
      const config: Record<string, any> = {
        password: decodeURIComponent(password),
      };

      if (obfs) config.obfs = obfs;
      if (obfsPassword) config['obfs-password'] = obfsPassword;
      if (sni) config.sni = sni;
      if (insecure) config['skip-cert-verify'] = true;
      if (up) config.up = up;
      if (down) config.down = down;

      const node: ProxyNode = {
        id: generateId(),
        name,
        type: 'hysteria2',
        server,
        port,
        config,
      };

      return {
        success: true,
        nodes: [node],
      };
    } catch (error) {
      return {
        success: false,
        nodes: [],
        errors: [error instanceof Error ? error.message : 'Unknown parsing error'],
      };
    }
  }
}
