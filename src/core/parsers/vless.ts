// VLESS URI parser
// Format: vless://uuid@server:port?key1=value1&key2=value2#name

import { generateId, toStringList } from '../ir/factory';
import type { ProxyNode } from '../ir/types';
import type { IParser, ParseResult } from './types';
import { xhttpOptsFromExtra } from './xhttpExtra';

// The XHTTP transport modes mihomo accepts. Kept here rather than imported from
// the form schema: this parser reads links, and what a link is allowed to say
// should not move when a dropdown does.
const XHTTP_MODES = ['auto', 'stream-one', 'stream-up', 'packet-up'];

export class VlessURIParser implements IParser {
  name = 'vless';

  canParse(uri: string): boolean {
    return uri.trim().startsWith('vless://');
  }

  async parse(uri: string): Promise<ParseResult> {
    try {
      const trimmedUri = uri.trim();

      // Remove vless:// prefix
      const withoutProtocol = trimmedUri.slice(8);

      // Split by # to separate main part and name
      const [mainPart, encodedName] = withoutProtocol.split('#');
      const name = encodedName ? decodeURIComponent(encodedName) : 'VLESS Node';

      // Split by @ to separate uuid and server part
      const [uuid, serverPart] = mainPart.split('@');

      if (!uuid || !serverPart) {
        return {
          success: false,
          nodes: [],
          errors: ['Invalid VLESS URI format: missing UUID or server'],
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
          errors: ['Invalid VLESS URI format: missing or invalid server/port'],
        };
      }

      // Parse query parameters
      const params = new URLSearchParams(paramString || '');

      const type = params.get('type') || 'tcp';
      const security = params.get('security') || 'none';
      const flow = params.get('flow') || '';
      const sni = params.get('sni') || '';
      const fp = params.get('fp') || '';
      const alpn = params.get('alpn') || '';
      const pbk = params.get('pbk') || '';
      const sid = params.get('sid') || '';

      // `type=http` is refused rather than translated.
      //
      // The word means two different protocols depending on who wrote it: a
      // share link says `http` and means HTTP/2, mihomo says `http` and means
      // HTTP/1.1 obfuscation over plain TCP. Guessing between them on the
      // strength of the word is how a node ends up quietly speaking the wrong
      // one — so the link has to say which, and `type=h2` says it.
      if (type === 'http') {
        return {
          success: false,
          nodes: [],
          errors: [
            `${name}: \`type=http\` is not supported — use \`type=h2\` for an HTTP/2 node`,
          ],
        };
      }

      // Shared by the WebSocket and HTTP/2 forms of the link, so named for
      // neither.
      const path = params.get('path') || '';
      const host = params.get('host') || '';

      // gRPC params
      const serviceName = params.get('serviceName') || '';

      // mihomo will not run h2 over plain TCP, so `type=h2&security=none`
      // describes a node that cannot connect. TLS goes on: the alternative is
      // importing a config that is guaranteed to fail on first use, over a
      // parameter the link never really had a choice about.
      const tls = security !== 'none' || type === 'h2';

      // Build config object
      const config: Record<string, any> = {
        uuid,
        flow,
        network: type,
        tls,
      };

      // `security` is a URI parameter, not a mihomo key. It is read here to
      // decide what to build, and never stored: mihomo's vless proxy has no
      // such field and rejects it.
      if (tls) {
        if (sni) config.servername = sni;
        if (fp) config['client-fingerprint'] = fp;
        if (alpn) config.alpn = toStringList(alpn);

        // REALITY configuration. Its presence is what marks the node, so it is
        // only written when there is actually a key to write.
        if (security === 'reality' && pbk) {
          config['reality-opts'] = {
            'public-key': pbk,
            'short-id': sid || '',
          };
        }
      }

      // Transport-specific configuration
      if (type === 'ws') {
        config['ws-opts'] = {
          path: path || '/',
          headers: host ? { Host: host } : {},
        };
      } else if (type === 'grpc') {
        config['grpc-opts'] = {
          'grpc-service-name': serviceName,
        };
      } else if (type === 'h2') {
        // The same `host` parameter, read differently: here it is a
        // comma-separated list, because mihomo takes several hosts and sends one
        // of them, where the WebSocket block above wants a single header value.
        const hosts = toStringList(host);
        config['h2-opts'] = {
          ...(hosts.length > 0 ? { host: hosts } : {}),
          path: path || '/',
        };
      } else if (type === 'xhttp') {
        // `extra` is the whole settings object in Xray's spelling, so it can
        // name the same three things the dedicated parameters do. Those win:
        // they are what a client that has never heard of `extra` reads, which
        // makes them the pair the server must already accept.
        const {
          path: extraPath,
          host: extraHost,
          mode: extraMode,
          ...extra
        } = xhttpOptsFromExtra(params.get('extra'));

        // A mode mihomo does not know is a node that will not start, so an
        // unrecognised one becomes `auto` — mihomo's own default, and the one
        // the form offers. The link keeps everything else it said.
        const mode = params.get('mode') || '';
        const chosen = XHTTP_MODES.includes(mode)
          ? mode
          : XHTTP_MODES.includes(extraMode)
            ? extraMode
            : 'auto';
        const chosenHost = host || (typeof extraHost === 'string' ? extraHost : '');

        // The three the form shows come first, and the advanced settings after
        // them, because the exported file is something people read.
        config['xhttp-opts'] = {
          path: path || (typeof extraPath === 'string' ? extraPath : '') || '/',
          ...(chosenHost ? { host: chosenHost } : {}),
          mode: chosen,
          ...extra,
        };
      }

      const node: ProxyNode = {
        id: generateId(),
        name,
        type: 'vless',
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
