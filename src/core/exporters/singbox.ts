// Sing-Box exporter - transforms IR to Sing-Box format

import type { MihomoIR, ProxyNode, ProxyGroup, Rule } from '../ir';
import { toStringList } from '../ir';
import type { IExporter } from './base';

export class SingBoxExporter implements IExporter {
  name = 'sing-box';
  version = '1.0.0';

  export(ir: MihomoIR): string {
    const config = {
      log: this.transformLog(ir.general['log-level']),
      dns: this.transformDNS(ir.dns),
      inbounds: this.transformInbounds(ir.general),
      outbounds: this.transformOutbounds(ir.proxies, ir.proxyGroups),
      route: this.transformRoute(ir.rules),
    };

    return JSON.stringify(config, null, 2);
  }

  private transformLog(logLevel?: string): any {
    const levelMap: Record<string, string> = {
      silent: 'panic',
      error: 'error',
      warning: 'warn',
      info: 'info',
      debug: 'debug',
    };

    return {
      level: levelMap[logLevel || 'info'] || 'info',
      timestamp: true,
    };
  }

  private transformDNS(dns: any): any {
    if (!dns.enable) {
      return {
        servers: [
          {
            tag: 'default',
            address: '8.8.8.8',
          },
        ],
      };
    }

    const servers: any[] = [];

    // Default nameservers
    if (dns['default-nameserver']?.length > 0) {
      dns['default-nameserver'].forEach((ns: string) => {
        servers.push({
          tag: 'default',
          address: ns,
        });
      });
    }

    // Primary nameservers
    if (dns.nameserver?.length > 0) {
      dns.nameserver.forEach((ns: string, idx: number) => {
        servers.push({
          tag: `nameserver-${idx}`,
          address: ns,
        });
      });
    }

    // Fallback nameservers
    if (dns.fallback?.length > 0) {
      dns.fallback.forEach((ns: string, idx: number) => {
        servers.push({
          tag: `fallback-${idx}`,
          address: ns,
          detour: 'proxy',
        });
      });
    }

    return {
      servers: servers.length > 0 ? servers : [{ tag: 'default', address: '8.8.8.8' }],
      strategy: dns.ipv6 ? 'prefer_ipv4' : 'ipv4_only',
    };
  }

  private transformInbounds(general: any): any[] {
    const inbounds: any[] = [];

    if (general['mixed-port']) {
      inbounds.push({
        type: 'mixed',
        tag: 'mixed-in',
        listen: general['bind-address'] || '::',
        listen_port: general['mixed-port'],
      });
    }

    // TUN inbound
    if (general.tun?.enable) {
      inbounds.push({
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'tun0',
        inet4_address: '172.19.0.1/30',
        auto_route: general.tun['auto-route'] !== false,
        stack: general.tun.stack || 'system',
      });
    }

    return inbounds;
  }

  private transformOutbounds(proxies: ProxyNode[], groups: ProxyGroup[]): any[] {
    const outbounds: any[] = [];

    // Transform proxy nodes
    proxies.forEach((proxy) => {
      const outbound = this.transformProxy(proxy);
      if (outbound) {
        outbounds.push(outbound);
      }
    });

    // Transform proxy groups
    groups.forEach((group) => {
      const outbound = this.transformProxyGroup(group);
      if (outbound) {
        outbounds.push(outbound);
      }
    });

    // Add direct and block outbounds
    outbounds.push(
      {
        type: 'direct',
        tag: 'direct',
      },
      {
        type: 'block',
        tag: 'block',
      }
    );

    return outbounds;
  }

  private transformProxy(proxy: ProxyNode): any | null {
    switch (proxy.type) {
      case 'vless':
        return this.transformVLESS(proxy);
      case 'trojan':
        return this.transformTrojan(proxy);
      case 'hysteria2':
        return this.transformHysteria2(proxy);
      case 'tuic':
        return this.transformTUIC(proxy);
      case 'direct':
        // sing-box's direct outbound takes no endpoint either.
        return { type: 'direct', tag: proxy.name };
      case 'ss':
        return this.transformSS(proxy);
      case 'vmess':
        return this.transformVMess(proxy);
      case 'socks5':
        return this.transformSocksHttp(proxy, 'socks');
      case 'http':
        return this.transformSocksHttp(proxy, 'http');
      default:
        return null;
    }
  }

  private transformSS(proxy: ProxyNode): any | null {
    const config = proxy.config;
    if (!config.cipher || !config.password) return null;
    // sing-box has no equivalent for mihomo's ss plugins or UDP-over-TCP; a
    // plugin-carrying node would export as a bare shadowsocks outbound and
    // speak the wrong protocol, so those are left out instead.
    if (config.plugin || config['udp-over-tcp']) return null;
    return {
      type: 'shadowsocks',
      tag: proxy.name,
      server: proxy.server,
      server_port: proxy.port,
      method: config.cipher,
      password: config.password,
    };
  }

  private transformVMess(proxy: ProxyNode): any | null {
    const config = proxy.config;
    if (!config.uuid) return null;
    // The exotic transports have no faithful sing-box mapping — mkcp/mekya
    // especially — and a silent downgrade is worse than absence.
    if (config.network === 'mkcp' || config.network === 'mekya') return null;

    const outbound: any = {
      type: 'vmess',
      tag: proxy.name,
      server: proxy.server,
      server_port: proxy.port,
      uuid: config.uuid,
      security: config.cipher || 'auto',
      alter_id: Number(config.alterId) || 0,
    };
    if (config.tls) {
      outbound.tls = {
        enabled: true,
        server_name: config.servername || proxy.server,
        insecure: config['skip-cert-verify'] || false,
      };
      const alpn = toStringList(config.alpn);
      if (alpn.length > 0) outbound.tls.alpn = alpn;
    }
    const network = config.network || '';
    if (network === 'ws' || (!network && config['ws-opts'])) {
      outbound.transport = {
        type: 'ws',
        path: config['ws-opts']?.path || '/',
        headers: config['ws-opts']?.headers || {},
      };
    } else if (network === 'grpc' || (!network && config['grpc-opts'])) {
      outbound.transport = {
        type: 'grpc',
        service_name: config['grpc-opts']?.['grpc-service-name'] || '',
      };
    } else if (network === 'h2' || (!network && config['h2-opts'])) {
      const host = toStringList(config['h2-opts']?.host);
      outbound.transport = {
        type: 'http',
        ...(host.length > 0 ? { host } : {}),
        path: config['h2-opts']?.path || '/',
      };
    }
    return outbound;
  }

  private transformSocksHttp(proxy: ProxyNode, type: 'socks' | 'http'): any | null {
    const config = proxy.config;
    // A TLS-wrapped socks/http hop has no sing-box equivalent with the same
    // semantics (its socks/http outbound dials plain); leaving it out beats a
    // node that stops speaking TLS.
    if (config.tls) return null;
    const outbound: any = {
      type,
      tag: proxy.name,
      server: proxy.server,
      server_port: proxy.port,
    };
    if (config.username || config.password) {
      outbound.version = type === 'socks' ? '5' : '1';
      outbound.username = config.username || '';
      outbound.password = config.password || '';
    }
    return outbound;
  }

  private transformVLESS(proxy: ProxyNode): any | null {
    const config = proxy.config;

    // XHTTP has no sing-box equivalent. Its transports are ws, http, quic,
    // grpc and httpupgrade — there is nothing to map this onto, and the closest
    // thing available is silence: an outbound with no transport block, which a
    // client reads as plain TCP and dials straight at an XHTTP server.
    //
    // So the node is left out, the way an unsupported protocol already is. A
    // group listing it keeps the name, which is a visible loose end rather than
    // an invisible wrong one. The mihomo export is untouched and complete.
    if (config.network === 'xhttp') return null;

    const outbound: any = {
      type: 'vless',
      tag: proxy.name,
      server: proxy.server,
      server_port: proxy.port,
      uuid: config.uuid,
      flow: config.flow || '',
    };

    // TLS configuration
    if (config.tls) {
      const tls: any = {
        enabled: true,
        server_name: config.servername || proxy.server,
        insecure: config['skip-cert-verify'] || false,
      };

      // REALITY support. There is no flag for it: a node is a REALITY node when
      // it carries a public key, which is how mihomo reads it too.
      const reality = config['reality-opts'];
      if (reality && reality['public-key']) {
        tls.reality = {
          enabled: true,
          public_key: reality['public-key'],
          short_id: reality['short-id'] || '',
        };
      }

      // ALPN
      const alpn = toStringList(config.alpn);
      if (alpn.length > 0) {
        tls.alpn = alpn;
      }

      outbound.tls = tls;
    }

    // Transport configuration. A node keeps the option blocks of transports it
    // used before — switching one from WebSocket to HTTP/2 leaves `ws-opts`
    // behind — so `network` decides whenever it names one, and the bare block
    // checks are only reached by an imported config that named none.
    const network = config.network || '';
    if (network === 'ws' || (!network && config['ws-opts'])) {
      outbound.transport = {
        type: 'ws',
        path: config['ws-opts']?.path || '/',
        headers: config['ws-opts']?.headers || {},
      };
    } else if (network === 'grpc' || (!network && config['grpc-opts'])) {
      outbound.transport = {
        type: 'grpc',
        service_name: config['grpc-opts']?.['grpc-service-name'] || '',
      };
    } else if (network === 'h2' || (!network && config['h2-opts'])) {
      // sing-box has no `h2` transport: its HTTP one speaks HTTP/2 whenever TLS
      // is on, and mihomo refuses to run h2 without TLS — so the two agree.
      const host = toStringList(config['h2-opts']?.host);
      outbound.transport = {
        type: 'http',
        ...(host.length > 0 ? { host } : {}),
        path: config['h2-opts']?.path || '/',
      };
    }

    return outbound;
  }

  private transformTrojan(proxy: ProxyNode): any {
    const config = proxy.config;
    const outbound: any = {
      type: 'trojan',
      tag: proxy.name,
      server: proxy.server,
      server_port: proxy.port,
      password: config.password,
    };

    // TLS configuration
    const tls: any = {
      enabled: true,
      server_name: config.sni || proxy.server,
      insecure: config['skip-cert-verify'] || false,
    };

    const alpn = toStringList(config.alpn);
    if (alpn.length > 0) {
      tls.alpn = alpn;
    }

    outbound.tls = tls;

    // Transport configuration
    if (config.network === 'ws' || config['ws-opts']) {
      outbound.transport = {
        type: 'ws',
        path: config['ws-opts']?.path || '/',
        headers: config['ws-opts']?.headers || {},
      };
    } else if (config.network === 'grpc' || config['grpc-opts']) {
      outbound.transport = {
        type: 'grpc',
        service_name: config['grpc-opts']?.['grpc-service-name'] || '',
      };
    }

    return outbound;
  }

  private transformHysteria2(proxy: ProxyNode): any {
    const config = proxy.config;
    return {
      type: 'hysteria2',
      tag: proxy.name,
      server: proxy.server,
      server_port: proxy.port,
      password: config.password,
      tls: {
        enabled: true,
        server_name: config.sni || proxy.server,
        insecure: config['skip-cert-verify'] || false,
      },
      obfs: config.obfs
        ? {
            type: config.obfs,
            password: config['obfs-password'] || '',
          }
        : undefined,
    };
  }

  private transformTUIC(proxy: ProxyNode): any {
    const config = proxy.config;
    return {
      type: 'tuic',
      tag: proxy.name,
      server: proxy.server,
      server_port: proxy.port,
      uuid: config.uuid,
      password: config.password,
      congestion_control: config['congestion-controller'] || 'cubic',
      tls: {
        enabled: true,
        server_name: config.sni || proxy.server,
        insecure: config['skip-cert-verify'] || false,
        // TUIC is QUIC-only, so h3 is the sensible fallback when the node does
        // not name one.
        alpn: toStringList(config.alpn).length > 0 ? toStringList(config.alpn) : ['h3'],
      },
    };
  }

  private transformProxyGroup(group: ProxyGroup): any {
    const config = group.config;

    switch (group.type) {
      case 'select':
        return {
          type: 'selector',
          tag: group.name,
          outbounds: config.proxies || [],
          // sing-box's `default` is the same idea as mihomo's default-selected.
          default: config['default-selected'] || config.proxies?.[0] || 'direct',
        };

      case 'url-test': {
        const outbound: any = {
          type: 'urltest',
          tag: group.name,
          outbounds: config.proxies || [],
          url: config.url || 'https://www.gstatic.com/generate_204',
        };
        // mihomo's `interval: 0` means "no periodic testing". sing-box has no
        // equivalent switch, so drop the key and let it apply its own default
        // rather than writing back a schedule the user explicitly turned off.
        if (config.interval !== 0) outbound.interval = `${config.interval ?? 300}s`;
        // 0 is a real tolerance — switch on any improvement — so keep it.
        outbound.tolerance = config.tolerance ?? 50;
        return outbound;
      }

      case 'fallback': {
        const outbound: any = {
          type: 'urltest',
          tag: group.name,
          outbounds: config.proxies || [],
          url: config.url || 'https://www.gstatic.com/generate_204',
        };
        if (config.interval !== 0) outbound.interval = `${config.interval ?? 300}s`;
        return outbound;
      }

      default: {
        // load-balance and relay both degrade to a selector here. Only emit
        // `default` when one was actually chosen, so existing output for groups
        // that never set it is unchanged.
        const selector: any = {
          type: 'selector',
          tag: group.name,
          outbounds: config.proxies || [],
        };
        if (config['default-selected']) selector.default = config['default-selected'];
        return selector;
      }
    }
  }

  private transformRoute(rules: Rule[]): any {
    const routeRules: any[] = [];

    rules.forEach((rule) => {
      const ruleObj = this.transformRule(rule);
      if (ruleObj) {
        routeRules.push(ruleObj);
      }
    });

    return {
      rules: routeRules,
      auto_detect_interface: true,
    };
  }

  private transformRule(rule: Rule): any | null {
    const outbound = this.mapPolicyToOutbound(rule.policy);

    switch (rule.type) {
      case 'DOMAIN':
        return {
          domain: [rule.payload],
          outbound,
        };

      case 'DOMAIN-SUFFIX':
        return {
          domain_suffix: [rule.payload],
          outbound,
        };

      case 'DOMAIN-KEYWORD':
        return {
          domain_keyword: [rule.payload],
          outbound,
        };

      case 'IP-CIDR':
      case 'IP-CIDR6':
        return {
          ip_cidr: [rule.payload],
          outbound,
        };

      case 'GEOIP':
        return {
          geoip: [rule.payload],
          outbound,
        };

      case 'GEOSITE':
        return {
          geosite: [rule.payload],
          outbound,
        };

      case 'MATCH':
        return {
          outbound,
        };

      default:
        return null;
    }
  }

  private mapPolicyToOutbound(policy: string): string {
    const policyMap: Record<string, string> = {
      DIRECT: 'direct',
      REJECT: 'block',
      'REJECT-DROP': 'block',
      PASS: 'direct',
    };

    return policyMap[policy] || policy;
  }
}
