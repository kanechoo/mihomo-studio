// Trojan URI parser
// Format: trojan://password@server:port?key=value#name

import type { ProxyNode } from '../ir/types';
import type { IParser, ParseResult } from './types';
import { generateId, toStringList } from '../ir/factory';

export class TrojanURIParser implements IParser {
  name = 'trojan';

  canParse(uri: string): boolean {
    return uri.trim().startsWith('trojan://');
  }

  async parse(uri: string): Promise<ParseResult> {
    try {
      const trimmedUri = uri.trim();

      // Remove trojan:// prefix
      const withoutProtocol = trimmedUri.slice(9);

      // Split by # to separate main part and name
      const [mainPart, encodedName] = withoutProtocol.split('#');
      const name = encodedName ? decodeURIComponent(encodedName) : 'Trojan Node';

      // Split by @ to separate password and server part
      const [password, serverPart] = mainPart.split('@');

      if (!password || !serverPart) {
        return {
          success: false,
          nodes: [],
          errors: ['Invalid Trojan URI format: missing password or server'],
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
          errors: ['Invalid Trojan URI format: missing or invalid server/port'],
        };
      }

      // Parse query parameters
      const params = new URLSearchParams(paramString || '');

      const type = params.get('type') || 'tcp';
      const sni = params.get('sni') || '';
      const insecure = params.get('allowInsecure') === '1' || params.get('allowInsecure') === 'true';
      const alpn = params.get('alpn') || '';
      const fp = params.get('fp') || '';

      // Refused for the same reason the vless parser refuses it: `http` names
      // one protocol in a share link and a different one in mihomo. mihomo's
      // trojan has neither — its transports are tcp, ws and grpc — so a link
      // asking for it is describing a node no client here can run.
      if (type === 'http') {
        return {
          success: false,
          nodes: [],
          errors: [`${name}: \`type=http\` is not supported for trojan`],
        };
      }

      // WebSocket params
      const wsPath = params.get('path') || '';
      const wsHost = params.get('host') || '';

      // gRPC params
      const serviceName = params.get('serviceName') || '';

      // Build config object
      const config: Record<string, any> = {
        password: decodeURIComponent(password),
        network: type,
      };

      if (sni) config.sni = sni;
      if (insecure) config['skip-cert-verify'] = true;
      if (alpn) config.alpn = toStringList(alpn);
      if (fp) config['client-fingerprint'] = fp;

      // Transport-specific configuration
      if (type === 'ws') {
        config['ws-opts'] = {
          path: wsPath || '/',
          headers: wsHost ? { Host: wsHost } : {},
        };
      } else if (type === 'grpc') {
        config['grpc-opts'] = {
          'grpc-service-name': serviceName,
        };
      }

      const node: ProxyNode = {
        id: generateId(),
        name,
        type: 'trojan',
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
