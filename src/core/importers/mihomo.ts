// Mihomo YAML importer - reverse parser from YAML to IR

import yaml from 'js-yaml';
import type { MihomoIR, ProxyGroup, Rule, GeneralConfig, DnsConfig } from '../ir';
import { createDefaultIR } from '../ir';
import { proxyNodesFromClash } from '../parsers/clash';
import type { IImporter, ImportResult } from './types';

/**
 * Generate a unique ID for imported items
 */
function generateId(): string {
  return `imported_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class MihomoYAMLImporter implements IImporter {
  name = 'mihomo-yaml';

  canImport(content: string): boolean {
    try {
      const parsed = yaml.load(content);
      return typeof parsed === 'object' && parsed !== null;
    } catch {
      return false;
    }
  }

  async import(content: string): Promise<ImportResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const parsed = yaml.load(content) as any;

      if (!parsed || typeof parsed !== 'object') {
        return {
          success: false,
          errors: ['Invalid YAML format'],
        };
      }

      const ir: MihomoIR = createDefaultIR();

      // Import General config
      try {
        ir.general = this.importGeneral(parsed);
      } catch (error) {
        warnings.push(`General config: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Import DNS config
      try {
        ir.dns = this.importDns(parsed);
      } catch (error) {
        warnings.push(`DNS config: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Import Proxies. Shared with the subscription importer, which reads the
      // same section out of the same kind of document — the difference between
      // the two is what happens to the rest of the file, not how a proxy is read.
      try {
        const { nodes, skipped } = proxyNodesFromClash(parsed.proxies);
        ir.proxies = nodes;
        skipped.forEach((reason) => warnings.push(`Proxies: ${reason}`));
      } catch (error) {
        errors.push(`Proxies: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Import Proxy Groups
      try {
        ir.proxyGroups = this.importProxyGroups(parsed['proxy-groups'] || []);
      } catch (error) {
        errors.push(`Proxy groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Import Proxy Providers. Taken verbatim, the way rule providers are: the
      // form covers the fields people commonly set, but a config that arrived
      // with `override-expr` or an `age-secret-key` keeps them and exports them
      // back out. Losing part of someone's provider because there is no field
      // for it would be worse than not offering the field.
      try {
        ir.proxyProviders = parsed['proxy-providers'] || {};
      } catch (error) {
        warnings.push(`Proxy providers: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Import Rules
      try {
        ir.rules = this.importRules(parsed.rules || []);
      } catch (error) {
        errors.push(`Rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Import Rule Providers
      try {
        ir.ruleProviders = parsed['rule-providers'] || {};
      } catch (error) {
        warnings.push(`Rule providers: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Phase-7 top-level sections. Anything absent stays undefined so the
      // exporter omits it — importing a plain config must not grow new keys.
      // Anything this file does not model lands in extensions verbatim, with
      // one warning naming every preserved key. Known keys were consumed
      // above; `version` is IR-internal and never comes from YAML.
      const knownTopLevel = new Set([
        'mixed-port', 'port', 'socks-port', 'redir-port', 'tproxy-port',
        'mode', 'allow-lan', 'bind-address', 'log-level', 'ipv6',
        'external-controller', 'external-ui', 'external-ui-name',
        'external-ui-url', 'external-doh-server', 'secret', 'find-process-mode',
        'keep-alive-interval', 'keep-alive-idle', 'disable-keep-alive',
        'tcp-concurrent', 'unified-delay', 'interface-name', 'routing-mark',
        'global-client-fingerprint', 'global-ua', 'etag-support',
        'geodata-mode', 'geodata-loader', 'geosite-matcher', 'geo-auto-update',
        'geo-update-interval', 'geox-url',
        'tun', 'dns', 'hosts', 'ntp', 'profile', 'experimental', 'sniffer',
        'authentication', 'skip-auth-prefixes', 'lan-allowed-ips',
        'lan-disallowed-ips',
        'proxies', 'proxy-providers', 'proxy-groups', 'rules', 'rule-providers',
      ]);
      const extensionKeys = Object.keys(parsed).filter((k) => !knownTopLevel.has(k));
      if (extensionKeys.length > 0) {
        ir.extensions = {};
        for (const k of extensionKeys) {
          ir.extensions[k] = parsed[k];
        }
        warnings.push(
          `Unknown sections preserved as-is: ${extensionKeys.join(', ')}`
        );
      }

      if (parsed.hosts && typeof parsed.hosts === 'object') ir.hosts = parsed.hosts;
      if (parsed.ntp?.enable) ir.ntp = { enable: true, ...parsed.ntp };
      if (parsed.profile && typeof parsed.profile === 'object') ir.profile = parsed.profile;
      if (parsed.sniffer && typeof parsed.sniffer === 'object') {
        const rawSniff = parsed.sniffer.sniff ?? {};
        const sniff: Record<string, any> = {};
        for (const [proto, entry] of Object.entries(rawSniff)) {
          if (!entry || typeof entry !== 'object') continue;
          sniff[proto.toLowerCase()] = { ...(entry as object), enabled: true };
        }
        ir.sniffer = { enable: true, ...parsed.sniffer, sniff };
      }
      if (parsed.experimental && typeof parsed.experimental === 'object') {
        ir.experimental = parsed.experimental;
      }
      if (
        parsed['geodata-mode'] !== undefined ||
        parsed['geodata-loader'] ||
        parsed['geosite-matcher'] ||
        parsed['geo-auto-update'] !== undefined ||
        parsed['geo-update-interval'] ||
        parsed['geox-url']
      ) {
        ir.geodata = {
          'geodata-mode': parsed['geodata-mode'],
          'geodata-loader': parsed['geodata-loader'],
          'geosite-matcher': parsed['geosite-matcher'],
          'geo-auto-update': parsed['geo-auto-update'],
          'geo-update-interval': parsed['geo-update-interval'],
          'geox-url': parsed['geox-url'],
        };
      }
      if (
        parsed.authentication ||
        parsed['skip-auth-prefixes'] ||
        parsed['lan-allowed-ips'] ||
        parsed['lan-disallowed-ips']
      ) {
        ir.accessControl = {
          authentication: parsed.authentication,
          'skip-auth-prefixes': parsed['skip-auth-prefixes'],
          'lan-allowed-ips': parsed['lan-allowed-ips'],
          'lan-disallowed-ips': parsed['lan-disallowed-ips'],
        };
      }

      return {
        success: true,
        ir,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to parse YAML: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  private importGeneral(parsed: any): GeneralConfig {
    const general: GeneralConfig = {
      mode: parsed.mode || 'rule',
    };

    if (parsed['mixed-port']) general['mixed-port'] = parsed['mixed-port'];
    if (parsed['allow-lan'] !== undefined) general['allow-lan'] = parsed['allow-lan'];
    if (parsed['bind-address']) general['bind-address'] = parsed['bind-address'];
    if (parsed['log-level']) general['log-level'] = parsed['log-level'];
    if (parsed.ipv6 !== undefined) general.ipv6 = parsed.ipv6;
    if (parsed['external-controller']) general['external-controller'] = parsed['external-controller'];
    if (parsed['external-ui']) general['external-ui'] = parsed['external-ui'];
    if (parsed.secret) general.secret = parsed.secret;

    // Phase-7 general fields. Assigned only when present: an absent key must
    // stay absent so a re-export does not grow new lines (and so persisted
    // IR keeps the shape the editor expects).
    const assignIfPresent = (key: string) => {
      if (parsed[key] !== undefined && parsed[key] !== null) {
        (general as any)[key] = parsed[key];
      }
    };
    [
      'port',
      'socks-port',
      'redir-port',
      'tproxy-port',
      'external-ui-name',
      'external-ui-url',
      'external-doh-server',
      'find-process-mode',
      'keep-alive-interval',
      'keep-alive-idle',
      'disable-keep-alive',
      'tcp-concurrent',
      'unified-delay',
      'interface-name',
      'routing-mark',
      'global-client-fingerprint',
      'global-ua',
      'etag-support',
    ].forEach(assignIfPresent);

    // TUN config
    if (parsed.tun) {
      general.tun = {
        enable: parsed.tun.enable || false,
        stack: parsed.tun.stack,
        'dns-mode': parsed.tun['dns-mode'] || undefined,
        device: parsed.tun.device,
        'dns-hijack': parsed.tun['dns-hijack'],
        'auto-route': parsed.tun['auto-route'],
        'auto-redirect': parsed.tun['auto-redirect'],
        'auto-detect-interface': parsed.tun['auto-detect-interface'],
        'strict-route': parsed.tun['strict-route'],
        mtu: parsed.tun.mtu,
        gso: parsed.tun.gso,
        'gso-max-size': parsed.tun['gso-max-size'],
        'inet6-address': parsed.tun['inet6-address'],
        'udp-timeout': parsed.tun['udp-timeout'],
        'iproute2-table-index': parsed.tun['iproute2-table-index'],
        'iproute2-rule-index': parsed.tun['iproute2-rule-index'],
        'endpoint-independent-nat': parsed.tun['endpoint-independent-nat'],
        'route-address-set': parsed.tun['route-address-set'],
        'route-exclude-address-set': parsed.tun['route-exclude-address-set'],
        'route-address': parsed.tun['route-address'],
        'route-exclude-address': parsed.tun['route-exclude-address'],
        'include-interface': parsed.tun['include-interface'],
        'exclude-interface': parsed.tun['exclude-interface'],
        'include-uid': parsed.tun['include-uid'],
        'include-uid-range': parsed.tun['include-uid-range'],
        'exclude-uid': parsed.tun['exclude-uid'],
        'exclude-uid-range': parsed.tun['exclude-uid-range'],
        'include-mac-address': parsed.tun['include-mac-address'],
        'exclude-mac-address': parsed.tun['exclude-mac-address'],
        'include-android-user': parsed.tun['include-android-user'],
        'include-package': parsed.tun['include-package'],
        'exclude-package': parsed.tun['exclude-package'],
      };
      // Drop keys the document never set so the IR holds exactly what was
      // there (and a re-export does not grow lines).
      for (const k of Object.keys(general.tun as object)) {
        if ((general.tun as any)[k] === undefined) delete (general.tun as any)[k];
      }
    }

    return general;
  }

  private importDns(parsed: any): DnsConfig {
    const dns: DnsConfig = {
      enable: parsed.dns?.enable !== undefined ? parsed.dns.enable : false,
    };

    if (!parsed.dns) return dns;

    if (parsed.dns.ipv6 !== undefined) dns.ipv6 = parsed.dns.ipv6;
    if (parsed.dns['enhanced-mode']) dns['enhanced-mode'] = parsed.dns['enhanced-mode'];
    if (parsed.dns['fake-ip-range']) dns['fake-ip-range'] = parsed.dns['fake-ip-range'];
    if (parsed.dns['fake-ip-filter']) dns['fake-ip-filter'] = parsed.dns['fake-ip-filter'];
    if (parsed.dns['default-nameserver']) dns['default-nameserver'] = parsed.dns['default-nameserver'];
    if (parsed.dns.nameserver) dns.nameserver = parsed.dns.nameserver;
    if (parsed.dns.fallback) dns.fallback = parsed.dns.fallback;
    if (parsed.dns['fallback-filter']) dns['fallback-filter'] = parsed.dns['fallback-filter'];
    if (parsed.dns['nameserver-policy']) dns['nameserver-policy'] = parsed.dns['nameserver-policy'];

    // Phase-8 DNS surface.
    if (parsed.dns.listen) dns.listen = parsed.dns.listen;
    if (parsed.dns['prefer-h3'] !== undefined) dns['prefer-h3'] = parsed.dns['prefer-h3'];
    if (parsed.dns['cache-algorithm']) dns['cache-algorithm'] = parsed.dns['cache-algorithm'];
    if (parsed.dns['fake-ip-range6']) dns['fake-ip-range6'] = parsed.dns['fake-ip-range6'];
    if (parsed.dns['fake-ip-filter-mode']) dns['fake-ip-filter-mode'] = parsed.dns['fake-ip-filter-mode'];
    if (parsed.dns['fake-ip-ttl'] !== undefined) dns['fake-ip-ttl'] = parsed.dns['fake-ip-ttl'];
    if (parsed.dns['use-hosts'] !== undefined) dns['use-hosts'] = parsed.dns['use-hosts'];
    if (parsed.dns['use-system-hosts'] !== undefined) dns['use-system-hosts'] = parsed.dns['use-system-hosts'];
    if (parsed.dns['respect-rules'] !== undefined) dns['respect-rules'] = parsed.dns['respect-rules'];
    if (Array.isArray(parsed.dns['proxy-server-nameserver'])) {
      dns['proxy-server-nameserver'] = parsed.dns['proxy-server-nameserver'];
    }
    if (Array.isArray(parsed.dns['direct-nameserver'])) {
      dns['direct-nameserver'] = parsed.dns['direct-nameserver'];
    }
    if (parsed.dns['direct-nameserver-follow-policy'] !== undefined) {
      dns['direct-nameserver-follow-policy'] = parsed.dns['direct-nameserver-follow-policy'];
    }
    if (parsed.dns['fallback-lazy-query'] !== undefined) {
      dns['fallback-lazy-query'] = parsed.dns['fallback-lazy-query'];
    }

    return dns;
  }

  private importProxyGroups(groups: any[]): ProxyGroup[] {
    return groups.map((group) => {
      const { name, type, proxies, use, url, interval, tolerance, lazy, 'disable-udp': disableUdp, filter, 'exclude-filter': excludeFilter, strategy, ...rest } = group;

      return {
        id: generateId(),
        name: name || 'Unnamed Group',
        type: type || 'select',
        config: {
          proxies: proxies || [],
          // Named rather than left to `...rest` so it lands as a list whatever
          // the file held. A group with `use: provider1` written as a bare
          // string parses as one, and the picker would then be editing a
          // string a character at a time.
          ...(use === undefined ? {} : { use: Array.isArray(use) ? use : [use] }),
          url,
          interval,
          tolerance,
          lazy,
          'disable-udp': disableUdp,
          filter,
          'exclude-filter': excludeFilter,
          strategy,
          ...rest,
        },
      };
    });
  }

  private importRules(rules: any[]): Rule[] {
    return rules.map((rule) => {
      if (typeof rule === 'string') {
        // String format: TYPE,PAYLOAD,POLICY with optional trailing params.
        // PAYLOAD may itself contain commas (logic rules like
        // `AND,((DOMAIN,a),(NETWORK,UDP)),REJECT`), so the type comes off the
        // left and the policy/params come off the right — never a blind split.
        let body = rule.trim();
        const flags: { 'no-resolve': boolean; src: boolean } = {
          'no-resolve': false,
          src: false,
        };
        for (;;) {
          if (body.endsWith(',no-resolve')) {
            flags['no-resolve'] = true;
            body = body.slice(0, -',no-resolve'.length);
          } else if (body.endsWith(',src')) {
            flags.src = true;
            body = body.slice(0, -',src'.length);
          } else break;
        }

        const first = body.indexOf(',');
        const type = first === -1 ? body : body.slice(0, first);
        if (type === 'MATCH') {
          return {
            id: generateId(),
            type: 'MATCH',
            payload: '',
            policy: first === -1 ? 'DIRECT' : body.slice(first + 1),
          };
        }

        const last = body.lastIndexOf(',');
        return {
          id: generateId(),
          type: type as Rule['type'],
          payload: last > first ? body.slice(first + 1, last) : '',
          policy: last > first ? body.slice(last + 1) : first === -1 ? 'DIRECT' : body.slice(first + 1),
          // Historical contract: no-resolve is always a boolean on imported
          // rules; src only exists when the rule carries it.
          'no-resolve': flags['no-resolve'],
          ...(flags.src ? { src: true } : {}),
        };
      }

      // Object format
      return {
        id: generateId(),
        type: rule.type || 'DOMAIN',
        payload: rule.payload || '',
        policy: rule.policy || 'DIRECT',
        'no-resolve': rule['no-resolve'],
        ...(rule.src ? { src: true } : {}),
      };
    });
  }
}
