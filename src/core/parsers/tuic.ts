// TUIC URI parser
// Format: tuic://uuid:password@server:port?key=value#name

import type { ProxyNode } from '../ir/types';
import type { IParser, ParseResult } from './types';
import { generateId, toStringList } from '../ir/factory';

export class TuicURIParser implements IParser {
  name = 'tuic';

  canParse(uri: string): boolean {
    return uri.trim().startsWith('tuic://');
  }

  async parse(uri: string): Promise<ParseResult> {
    try {
      const trimmedUri = uri.trim();

      // Remove tuic:// prefix
      const withoutProtocol = trimmedUri.slice(7);

      // Split by # to separate main part and name
      const [mainPart, encodedName] = withoutProtocol.split('#');
      const name = encodedName ? decodeURIComponent(encodedName) : 'TUIC Node';

      // Split by @ to separate credentials and server part
      const [credentials, serverPart] = mainPart.split('@');

      if (!credentials || !serverPart) {
        return {
          success: false,
          nodes: [],
          errors: ['Invalid TUIC URI format: missing credentials or server'],
        };
      }

      // Split credentials by : to get uuid and password
      const [uuid, password] = credentials.split(':');

      if (!uuid || !password) {
        return {
          success: false,
          nodes: [],
          errors: ['Invalid TUIC URI format: missing UUID or password'],
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
          errors: ['Invalid TUIC URI format: missing or invalid server/port'],
        };
      }

      // Parse query parameters
      const params = new URLSearchParams(paramString || '');

      const sni = params.get('sni') || '';
      const insecure = params.get('insecure') === '1' || params.get('insecure') === 'true';
      const alpn = params.get('alpn') || '';
      const congestionController = params.get('congestion_control') || params.get('cc') || 'bbr';
      const disableSni = params.get('disable_sni') === '1' || params.get('disable_sni') === 'true';

      // Build config object
      const config: Record<string, any> = {
        uuid: decodeURIComponent(uuid),
        password: decodeURIComponent(password),
      };

      if (sni) config.sni = sni;
      if (insecure) config['skip-cert-verify'] = true;
      if (alpn) config.alpn = toStringList(alpn);
      if (congestionController) config['congestion-controller'] = congestionController;
      if (disableSni) config['disable-sni'] = true;

      const node: ProxyNode = {
        id: generateId(),
        name,
        type: 'tuic',
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
