import yaml from 'js-yaml';
import type { IExporter } from './base';
import type {
  MihomoIR,
  ProxyNode,
  ProxyGroup,
  ProxyProvider,
  Rule,
  RuleProvider,
} from '../ir/types';
import { isMatchRule } from '../ir/rules';
import { toStringList, PROXY_PROVIDER_FIELDS, unmodelledKeys } from '../ir/factory';

// The options block each transport reads, for the transports this app knows.
// `tcp` is in the map with nothing against it: it names a transport, and that
// transport has no block.
const TRANSPORT_OPTS: Record<string, string> = {
  tcp: '',
  ws: 'ws-opts',
  grpc: 'grpc-opts',
  h2: 'h2-opts',
  xhttp: 'xhttp-opts',
};

const OPTS_KEYS = new Set(Object.values(TRANSPORT_OPTS).filter(Boolean));

// Config keys that exist only so the form can express a choice mihomo's YAML
// has no key for. `anytlsSecurityLayer` picks which of anytls's three optional
// security layers the form shows; `obfsEnabled` gates snell's obfs-opts block.
// They must never reach the file: mihomo rejects unknown proxy keys.
const UI_ONLY_CONFIG_KEYS = new Set(['anytlsSecurityLayer', 'obfsEnabled', 'trojanSecurityLayer']);

// Which options block a node's `network` entitles it to keep, or null for "no
// opinion" — leave every block alone.
//
// Null is the answer for a node that names no transport, and it matters. Such a
// node is almost always one imported from a config where the block *is* the
// statement of what it speaks, and for a protocol this app has no form for, the
// keys are not ours to reason about at all. Guessing there would delete the only
// working part of somebody's proxy.
function transportOptsFor(network: unknown): string | null {
  if (typeof network !== 'string') return null;
  const named = TRANSPORT_OPTS[network.trim()];
  return named === undefined ? null : named;
}

function isEmptyObject(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

// Recursively drop values that say "the user never filled this in". Unlike the
// shallow `isEmptyObject`, this reaches the nested security blocks inside
// `download-settings` so an untouched `reality-opts: {}` cannot leak into the
// export. `false` and `0` are real answers and survive; undefined/null/'', an
// empty array, and an empty object do not.
function stripEmptyBlocks(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) {
    const kept = value
      .map((entry) => stripEmptyBlocks(entry))
      .filter((entry) => entry !== undefined);
    return kept.length > 0 ? kept : undefined;
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    Object.entries(value as Record<string, any>).forEach(([key, entry]) => {
      const cleaned = stripEmptyBlocks(entry);
      if (cleaned !== undefined) out[key] = cleaned;
    });
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return value;
}

// The proxy-provider keys this exporter writes itself. Anything else a provider
// holds came from someone's imported config and is passed through untouched.
const PROVIDER_KEYS = new Set(PROXY_PROVIDER_FIELDS);

// A block with the keys nobody filled in taken out.
//
// Blocks here are edited a field at a time, so an untouched one holds empty
// strings rather than nothing at all — and an empty string is a value to
// mihomo. Everything that survives is kept whatever its name, which is what
// lets a sub-key this app has no field for ride along.
function withoutBlanks(block: Record<string, any> | undefined): Record<string, any> {
  return unmodelledKeys(block, []);
}

export class MihomoExporter implements IExporter {
  name = 'mihomo';
  version = '1.0.0';

  export(ir: MihomoIR): string {
    const config: any = {};

    // Export general configuration. Each inbound port is independent: a
    // separate `port`/`socks-port`/etc. must survive even when `mixed-port`
    // is unset.
    if (ir.general['port']) config['port'] = ir.general['port'];
    if (ir.general['socks-port']) config['socks-port'] = ir.general['socks-port'];
    if (ir.general['redir-port']) config['redir-port'] = ir.general['redir-port'];
    if (ir.general['tproxy-port']) config['tproxy-port'] = ir.general['tproxy-port'];
    if (ir.general['mixed-port']) config['mixed-port'] = ir.general['mixed-port'];
    config.mode = ir.general.mode;
    config['allow-lan'] = ir.general['allow-lan'];
    config['log-level'] = ir.general['log-level'];
    config.ipv6 = ir.general.ipv6;

    if (ir.general['bind-address']) {
      config['bind-address'] = ir.general['bind-address'];
    }
    if (ir.general['external-controller']) {
      config['external-controller'] = ir.general['external-controller'];
    }
    if (ir.general.secret) {
      config.secret = ir.general.secret;
    }

    // External UI / DOH on the API surface.
    if (ir.general['external-ui']) config['external-ui'] = ir.general['external-ui'];
    if (ir.general['external-ui-name']) config['external-ui-name'] = ir.general['external-ui-name'];
    if (ir.general['external-ui-url']) config['external-ui-url'] = ir.general['external-ui-url'];
    if (ir.general['external-doh-server']) config['external-doh-server'] = ir.general['external-doh-server'];

    // Runtime behaviour switches.
    if (ir.general['find-process-mode']) config['find-process-mode'] = ir.general['find-process-mode'];
    if (ir.general['keep-alive-interval'] !== undefined) config['keep-alive-interval'] = ir.general['keep-alive-interval'];
    if (ir.general['keep-alive-idle'] !== undefined) config['keep-alive-idle'] = ir.general['keep-alive-idle'];
    if (ir.general['disable-keep-alive'] !== undefined) config['disable-keep-alive'] = ir.general['disable-keep-alive'];
    if (ir.general['tcp-concurrent'] !== undefined) config['tcp-concurrent'] = ir.general['tcp-concurrent'];
    if (ir.general['unified-delay'] !== undefined) config['unified-delay'] = ir.general['unified-delay'];
    if (ir.general['interface-name']) config['interface-name'] = ir.general['interface-name'];
    if (ir.general['routing-mark'] !== undefined) config['routing-mark'] = ir.general['routing-mark'];
    // Deprecated upstream — carried so existing configs survive an edit.
    if (ir.general['global-client-fingerprint']) config['global-client-fingerprint'] = ir.general['global-client-fingerprint'];

    // External-resource fetch behaviour.
    if (ir.general['global-ua']) config['global-ua'] = ir.general['global-ua'];
    if (ir.general['etag-support'] !== undefined) config['etag-support'] = ir.general['etag-support'];

    // Export TUN configuration
    if (ir.general.tun?.enable) {
      // Emit every documented TUN key that is set; the deprecated
      // inet4/6-route-* spellings are never produced.
      const tun = ir.general.tun;
      config.tun = { enable: true };
      const tunKeys = [
        'stack',
        'dns-mode',
        'device',
        'auto-route',
        'auto-redirect',
        'auto-detect-interface',
        'strict-route',
        'mtu',
        'gso',
        'gso-max-size',
        'inet6-address',
        'udp-timeout',
        'iproute2-table-index',
        'iproute2-rule-index',
        'endpoint-independent-nat',
      ] as const;
      for (const k of tunKeys) {
        if (tun[k] !== undefined) (config.tun as any)[k] = tun[k];
      }
      const tunLists = [
        'dns-hijack',
        'route-address-set',
        'route-exclude-address-set',
        'route-address',
        'route-exclude-address',
        'include-interface',
        'exclude-interface',
        'include-mac-address',
        'exclude-mac-address',
        'include-android-user',
        'include-package',
        'exclude-package',
      ] as const;
      for (const k of tunLists) {
        const v = tun[k];
        if (v && v.length > 0) (config.tun as any)[k] = v;
      }
      const uidKeys = ['include-uid', 'exclude-uid'] as const;
      for (const k of uidKeys) {
        const v = tun[k];
        if (v && v.length > 0) {
          (config.tun as any)[k] = (v as number[]).map((n) => Number(n));
        }
      }
      const rangeKeys = ['include-uid-range', 'exclude-uid-range'] as const;
      for (const k of rangeKeys) {
        const v = tun[k];
        if (v && v.length > 0) (config.tun as any)[k] = v;
      }
    }

    // Export DNS configuration
    if (ir.dns.enable) {
      config.dns = this.transformDNS(ir);
    }

    // Export sniffer configuration. IR camelCase protocol keys become the
    // official upper-case entries; ui-* form flags are stripped.
    if (ir.sniffer?.enable) {
      const snf: any = { enable: true };
      for (const [k, v] of Object.entries(ir.sniffer)) {
        if (k.startsWith('ui-') || k === 'enable' || k === 'sniff') continue;
        // Booleans may legitimately be false (override-destination defaults
        // true upstream), so only undefined/null and empty lists are dropped.
        if (v === undefined || v === null) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        snf[k] = v;
      }
      const sniffOut: any = {};
      for (const proto of ['http', 'tls', 'quic']) {
        const entry = (ir.sniffer.sniff ?? {})[proto];
        const enabled =
          (entry as any)?.enabled === true ||
          ((entry as any)?.enabled === undefined && entry !== undefined);
        if (!enabled) continue;
        const block: any = {};
        const ports = (entry as any)?.ports;
        if (ports && ports.length > 0) block.ports = ports;
        const od = (entry as any)?.['override-destination'];
        if (od !== undefined) block['override-destination'] = od;
        sniffOut[proto.toUpperCase()] = block;
      }
      if (Object.keys(sniffOut).length > 0) snf.sniff = sniffOut;
      config.sniffer = snf;
    }

    // Phase-7 top-level sections.
    if (ir.hosts && Object.keys(ir.hosts).length > 0) config.hosts = ir.hosts;
    if (ir.ntp?.enable) {
      config.ntp = { ...ir.ntp };
    }
    if (ir.profile && Object.values(ir.profile).some((v) => v !== undefined)) {
      config.profile = { ...ir.profile };
    }
    if (ir.experimental && Object.values(ir.experimental).some((v) => v === true)) {
      config.experimental = { ...ir.experimental };
    }
    const ac = ir.accessControl;
    if (ac?.authentication && ac.authentication.length > 0) config.authentication = ac.authentication;
    if (ac?.['skip-auth-prefixes'] && ac['skip-auth-prefixes'].length > 0)
      config['skip-auth-prefixes'] = ac['skip-auth-prefixes'];
    if (ac?.['lan-allowed-ips'] && ac['lan-allowed-ips'].length > 0)
      config['lan-allowed-ips'] = ac['lan-allowed-ips'];
    if (ac?.['lan-disallowed-ips'] && ac['lan-disallowed-ips'].length > 0)
      config['lan-disallowed-ips'] = ac['lan-disallowed-ips'];
    const gd = ir.geodata;
    if (gd) {
      if (gd['geodata-mode'] !== undefined) config['geodata-mode'] = gd['geodata-mode'];
      if (gd['geodata-loader']) config['geodata-loader'] = gd['geodata-loader'];
      if (gd['geosite-matcher']) config['geosite-matcher'] = gd['geosite-matcher'];
      if (gd['geo-auto-update'] !== undefined) config['geo-auto-update'] = gd['geo-auto-update'];
      if (gd['geo-update-interval']) config['geo-update-interval'] = gd['geo-update-interval'];
      if (gd['geox-url'] && Object.values(gd['geox-url']).some(Boolean)) {
        config['geox-url'] = { ...gd['geox-url'] };
      }
    }
    // Export proxies
    if (ir.proxies.length > 0) {
      config.proxies = this.transformProxies(ir.proxies);
    }

    // Export proxy providers, ahead of the groups that pull them in — the same
    // order the editor's tabs are in, and the order the file reads best in.
    if (Object.keys(ir.proxyProviders || {}).length > 0) {
      config['proxy-providers'] = this.transformProxyProviders(ir.proxyProviders);
    }

    // Export proxy groups
    if (ir.proxyGroups.length > 0) {
      config['proxy-groups'] = this.transformProxyGroups(ir.proxyGroups);
    }

    // Export rules
    if (ir.rules.length > 0) {
      config.rules = this.transformRules(ir.rules);
    }

    // Export rule providers
    if (Object.keys(ir.ruleProviders).length > 0) {
      config['rule-providers'] = this.transformRuleProviders(ir.ruleProviders);
    }

    // Unknown-but-preserved top-level sections go last so the document's
    // known key order never moves.
    if (ir.extensions) {
      for (const [k, v] of Object.entries(ir.extensions)) {
        if (!(k in config)) config[k] = v;
      }
    }

    return yaml.dump(config, {
      lineWidth: -1, // No line wrapping
      noRefs: true,  // Disable YAML anchors/aliases
    });
  }

  private transformDNS(ir: MihomoIR): any {
    const dns: any = {
      enable: true,
      ipv6: ir.dns.ipv6,
      'enhanced-mode': ir.dns['enhanced-mode'],
    };

    if (ir.dns['fake-ip-range']) {
      dns['fake-ip-range'] = ir.dns['fake-ip-range'];
    }
    if (ir.dns['fake-ip-filter'] && ir.dns['fake-ip-filter'].length > 0) {
      dns['fake-ip-filter'] = ir.dns['fake-ip-filter'];
    }
    if (ir.dns['default-nameserver'] && ir.dns['default-nameserver'].length > 0) {
      dns['default-nameserver'] = ir.dns['default-nameserver'];
    }
    if (ir.dns.nameserver && ir.dns.nameserver.length > 0) {
      dns.nameserver = ir.dns.nameserver;
    }
    if (ir.dns.fallback && ir.dns.fallback.length > 0) {
      dns.fallback = ir.dns.fallback;
    }
    if (ir.dns['fallback-filter']) {
      const filter = ir.dns['fallback-filter'];
      const out: any = {};
      if (filter.geoip !== undefined) out.geoip = filter.geoip;
      if (filter['geoip-code']) out['geoip-code'] = filter['geoip-code'];
      // Only emit the list filters that actually have entries — an empty list
      // is not the same as an absent one to mihomo.
      if (filter.geosite && filter.geosite.length > 0) out.geosite = filter.geosite;
      if (filter.ipcidr && filter.ipcidr.length > 0) out.ipcidr = filter.ipcidr;
      if (filter.domain && filter.domain.length > 0) out.domain = filter.domain;
      if (Object.keys(out).length > 0) {
        dns['fallback-filter'] = out;
      }
    }
    if (ir.dns['nameserver-policy'] && Object.keys(ir.dns['nameserver-policy']).length > 0) {
      dns['nameserver-policy'] = ir.dns['nameserver-policy'];
    }

    // Phase-8 DNS surface.
    if (ir.dns.listen) dns.listen = ir.dns.listen;
    if (ir.dns['prefer-h3'] !== undefined) dns['prefer-h3'] = ir.dns['prefer-h3'];
    if (ir.dns['cache-algorithm']) dns['cache-algorithm'] = ir.dns['cache-algorithm'];
    if (ir.dns['fake-ip-range6']) dns['fake-ip-range6'] = ir.dns['fake-ip-range6'];
    if (ir.dns['fake-ip-filter-mode'] && ir.dns['fake-ip-filter-mode'] !== 'blacklist') {
      dns['fake-ip-filter-mode'] = ir.dns['fake-ip-filter-mode'];
    }
    if (ir.dns['fake-ip-ttl'] !== undefined) dns['fake-ip-ttl'] = ir.dns['fake-ip-ttl'];
    if (ir.dns['use-hosts'] !== undefined) dns['use-hosts'] = ir.dns['use-hosts'];
    if (ir.dns['use-system-hosts'] !== undefined) dns['use-system-hosts'] = ir.dns['use-system-hosts'];
    if (ir.dns['respect-rules'] === true) dns['respect-rules'] = true;
    const psn = ir.dns['proxy-server-nameserver'];
    if (psn && psn.length > 0) dns['proxy-server-nameserver'] = psn;
    const dnsDirect = ir.dns['direct-nameserver'];
    if (dnsDirect && dnsDirect.length > 0) dns['direct-nameserver'] = dnsDirect;
    if (ir.dns['direct-nameserver-follow-policy'] !== undefined) {
      dns['direct-nameserver-follow-policy'] = ir.dns['direct-nameserver-follow-policy'];
    }
    if (ir.dns['fallback-lazy-query'] !== undefined) {
      dns['fallback-lazy-query'] = ir.dns['fallback-lazy-query'];
    }

    return dns;
  }

  private transformProxies(proxies: ProxyNode[]): any[] {
    return proxies.map(proxy => {
      const result: any = {
        name: proxy.name,
        type: proxy.type,
      };

      // `direct` has no remote endpoint; emitting empty server/port keys would
      // make mihomo reject the proxy.
      if (proxy.server) result.server = proxy.server;
      if (proxy.port !== undefined) result.port = proxy.port;

      const keptOpts = transportOptsFor(proxy.config.network);

      // Merge protocol-specific config
      // Remove internal UI properties (like 'id') and flatten nested config
      Object.entries(proxy.config).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;

        // Form-only selectors carry no YAML meaning — see UI_ONLY_CONFIG_KEYS.
        if (UI_ONLY_CONFIG_KEYS.has(key)) return;

        // `security` is a proxy-URI parameter that this app used to store on
        // vless nodes. mihomo has no such key and refuses a config carrying
        // it, and configs saved before that was fixed still hold one.
        if (key === 'security' && proxy.type === 'vless') return;

        // The transport this node is not using. A node keeps the option blocks
        // of transports it used before — switching one from WebSocket to XHTTP
        // leaves `ws-opts` behind — and that is deliberate, so switching back
        // finds the path still typed in. It just does not belong in the file.
        //
        // mihomo reads the block its `network` names and ignores the others, so
        // this is noise rather than a fault; but the export is what people read
        // to check their own config, and a node claiming three transports reads
        // like a mistake whether or not it behaves like one.
        if (keptOpts !== null && OPTS_KEYS.has(key) && key !== keptOpts) return;

        // mihomo wants alpn as a list. It was edited here as a comma-separated
        // text box for a long time, so old configs hold a string.
        if (key === 'alpn') {
          const alpn = toStringList(value);
          if (alpn.length > 0) result.alpn = alpn;
          return;
        }

        // A REALITY block with no public key is not a REALITY node — it is an
        // empty form. Emitting it would turn one into the other.
        if (key === 'reality-opts') {
          if (value && typeof value === 'object' && (value as any)['public-key']) {
            result['reality-opts'] = value;
          }
          return;
        }

        // Transport blocks are filled a field at a time, so one nobody finished
        // typing into holds empty strings — and an `h2-opts` whose `host` list
        // was never touched holds an empty list, which is not the same as an
        // absent key. Whatever is left after dropping those is the block; with
        // nothing left, the block goes too. `download-settings` needs the deep
        // cleanup instead of a one-level strip because it nests its own TLS and
        // security blocks.
        if (key === 'h2-opts' || key === 'xhttp-opts') {
          if (!value || typeof value !== 'object') return;
          const opts = stripEmptyBlocks(value) as Record<string, any> | undefined;
          if (!opts) return;

          if (key === 'xhttp-opts') {
            const download = opts['download-settings'];
            if (download && typeof download === 'object') {
              const reality = download['reality-opts'];
              // The same rule as top-level REALITY: a block with no public key
              // is an empty form, not a REALITY node.
              if (reality && typeof reality === 'object' && !reality['public-key']) {
                delete download['reality-opts'];
              }
              if (isEmptyObject(download)) delete opts['download-settings'];
            }
          }

          if (Object.keys(opts).length > 0) result[key] = opts;
          return;
        }

        // An empty list is not the same as an absent key to mihomo, and it is
        // never what an untouched multi-select meant.
        if (Array.isArray(value) && value.length === 0) return;

        result[key] = value;
      });

      return result;
    });
  }

  private transformProxyGroups(groups: ProxyGroup[]): any[] {
    return groups.map(group => {
      const result: any = {
        name: group.name,
        type: group.type,
      };

      // Written only when there is something in it. A group backed by a
      // subscription has no members of its own, and `proxies: []` above a
      // `use:` reads as a group that lost its nodes rather than one that never
      // had any.
      const members = Array.isArray(group.config.proxies) ? group.config.proxies : [];
      if (members.length > 0) result.proxies = members;

      const used = Array.isArray(group.config.use) ? group.config.use : [];
      if (used.length > 0) result.use = used;

      if (group.config.url) result.url = group.config.url;
      // `interval: 0` disables periodic testing and `tolerance: 0` means switch
      // on any improvement — both are meaningful, so test for presence, not truth.
      if (group.config.interval !== undefined) result.interval = group.config.interval;
      if (group.config.timeout !== undefined) result.timeout = group.config.timeout;
      if (group.config.tolerance !== undefined) result.tolerance = group.config.tolerance;
      if (group.config.lazy !== undefined) result.lazy = group.config.lazy;
      if (group.config['default-selected']) {
        result['default-selected'] = group.config['default-selected'];
      }
      if (group.config['disable-udp']) result['disable-udp'] = group.config['disable-udp'];
      if (group.config.filter) result.filter = group.config.filter;
      if (group.config['exclude-filter']) result['exclude-filter'] = group.config['exclude-filter'];
      if (group.config.strategy) result.strategy = group.config.strategy;

      // Phase-8 common fields. Booleans are emitted even when false where the
      // upstream default differs (include-all family defaults false, so only
      // true matters; hidden likewise).
      if (group.config['exclude-type']) result['exclude-type'] = group.config['exclude-type'];
      if (group.config['expected-status']) result['expected-status'] = group.config['expected-status'];
      if (group.config['max-failed-times'] !== undefined) result['max-failed-times'] = group.config['max-failed-times'];
      if (group.config['empty-fallback']) result['empty-fallback'] = group.config['empty-fallback'];
      if (group.config.hidden) result.hidden = group.config.hidden;
      if (group.config.icon) result.icon = group.config.icon;
      if (group.config['include-all-proxies']) result['include-all-proxies'] = true;
      if (group.config['include-all-providers']) result['include-all-providers'] = true;

      return result;
    });
  }

  private transformRules(rules: Rule[]): string[] {
    return rules.map(rule => {
      // MATCH is written `MATCH,POLICY` — it takes no payload, and emitting the
      // empty field anyway produced `MATCH,,DIRECT`, which mihomo reads as a
      // rule with an empty payload and no policy.
      let ruleStr = isMatchRule(rule)
        ? `${rule.type},${rule.policy}`
        : `${rule.type},${rule.payload},${rule.policy}`;
      if (rule['no-resolve']) {
        ruleStr += ',no-resolve';
      }
      if (rule.src) {
        ruleStr += ',src';
      }
      return ruleStr;
    });
  }

  // Everything a provider of either kind shares: it is fetched from somewhere,
  // and how it is fetched is optional. Emitted the same way in both, so a
  // `proxy:` or a `header:` reads identically wherever it appears.
  private transformProviderFetch(
    out: Record<string, any>,
    provider: { url?: string; path?: string; interval?: number; proxy?: string;
                'size-limit'?: number; header?: Record<string, string[]> }
  ): void {
    out.url = provider.url;
    if (provider.path) out.path = provider.path;
    if (provider.interval !== undefined) out.interval = provider.interval;
    if (provider.proxy) out.proxy = provider.proxy;
    if (provider['size-limit'] !== undefined) out['size-limit'] = provider['size-limit'];
    if (provider.header && Object.keys(provider.header).length > 0) {
      out.header = provider.header;
    }
  }

  private transformProxyProviders(
    providers: Record<string, ProxyProvider>
  ): Record<string, any> {
    const result: Record<string, any> = {};

    Object.entries(providers).forEach(([name, provider]) => {
      const out: any = { type: provider.type };

      if (provider.type === 'http') {
        this.transformProviderFetch(out, provider);
      } else if (provider.type === 'file') {
        out.path = provider.path;
      } else if (provider.type === 'inline') {
        out.payload = provider.payload ?? [];
      }

      // Turned off is the same as absent to mihomo, and `enable: false` on its
      // own says nothing a missing block does not. What is inside the block is
      // copied rather than picked over: an `expected-status` that came in with
      // someone's config is not a field this app offers, and not a reason to
      // drop it either.
      const health = provider['health-check'];
      if (health?.enable) {
        out['health-check'] = { enable: true, ...withoutBlanks(health) };
      }

      // An override block is a list of things to change; with nothing left in
      // it, there is nothing to change and no reason to write the key.
      const override = withoutBlanks(provider.override);
      if (Object.keys(override).length > 0) out.override = override;

      // Node selection applies whatever the provider's type is: an inline list
      // can be filtered down the same way a fetched one can.
      if (provider.filter) out.filter = provider.filter;
      if (provider['exclude-filter']) out['exclude-filter'] = provider['exclude-filter'];
      if (provider['exclude-type']) out['exclude-type'] = provider['exclude-type'];

      // Everything above is what this app has a form for; a provider takes a
      // good deal more. Whatever came in that is not on that list is written
      // back out here, after the familiar keys — an imported `override-expr` or
      // `age-secret-key` is not something the editor can help with, but losing
      // it on the way through would be a worse answer than not offering it.
      //
      // Only keys off the list: the handled ones have already been written in
      // their cleaned-up form, and re-adding them would put back the stale
      // `url` a provider keeps after being switched to `file`.
      Object.entries(provider).forEach(([key, value]) => {
        if (PROVIDER_KEYS.has(key)) return;
        if (value === undefined || value === null || value === '') return;
        out[key] = value;
      });

      result[name] = out;
    });

    return result;
  }

  // Emit only the keys that are meaningful for a provider's type, dropping any
  // optional argument the user left disabled or blank.
  private transformRuleProviders(providers: Record<string, RuleProvider>): Record<string, any> {
    const result: Record<string, any> = {};

    Object.entries(providers).forEach(([name, provider]) => {
      const out: any = {
        type: provider.type,
        behavior: provider.behavior,
      };

      if (provider.format) out.format = provider.format;

      if (provider.type === 'http') {
        this.transformProviderFetch(out, provider);
      } else if (provider.type === 'file') {
        out.path = provider.path;
      } else if (provider.type === 'inline') {
        out.payload = provider.payload ?? [];
      }

      result[name] = out;
    });

    return result;
  }
}
