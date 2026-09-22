import { describe, it, expect } from 'vitest';
import { SingBoxExporter } from '../singbox';
import { createDefaultIR } from '../../ir/factory';
import type { MihomoIR, ProxyNode } from '../../ir/types';

const exporter = new SingBoxExporter();

function node(partial: Omit<ProxyNode, 'id'>): ProxyNode {
  return { id: 'test-id', ...partial };
}

function outboundsOf(ir: MihomoIR): any[] {
  return JSON.parse(exporter.export(ir)).outbounds;
}

function irWith(proxies: ProxyNode[]): MihomoIR {
  const ir = createDefaultIR();
  ir.dns.enable = false;
  ir.proxies = proxies;
  return ir;
}

describe('SingBoxExporter phase-3 mappings', () => {
  it('maps a plain shadowsocks node and drops plugin-carrying ones', () => {
    const outbounds = outboundsOf(
      irWith([
        node({
          name: 'plain',
          type: 'ss',
          server: 's.example.com',
          port: 8388,
          config: { cipher: 'aes-128-gcm', password: 'pw', udp: true },
        }),
        node({
          name: 'with-plugin',
          type: 'ss',
          server: 's.example.com',
          port: 443,
          config: {
            cipher: 'chacha20-ietf-poly1305',
            password: 'pw',
            plugin: 'obfs',
            'plugin-opts': { mode: 'http' },
          },
        }),
      ])
    );
    const tags = outbounds.map((o) => o.tag);
    expect(outbounds.find((o) => o.tag === 'plain')).toMatchObject({
      type: 'shadowsocks',
      server: 's.example.com',
      server_port: 8388,
      method: 'aes-128-gcm',
      password: 'pw',
    });
    expect(tags).not.toContain('with-plugin');
  });

  it('maps vmess with alterId as alter_id and drops mkcp/mekya transports', () => {
    const outbounds = outboundsOf(
      irWith([
        node({
          name: 'vm-tcp',
          type: 'vmess',
          server: 'v.example.com',
          port: 443,
          config: { uuid: 'u1', alterId: 32, cipher: 'auto' },
        }),
        node({
          name: 'vm-mkcp',
          type: 'vmess',
          server: 'v.example.com',
          port: 443,
          config: { uuid: 'u2', alterId: 0, cipher: 'auto', network: 'mkcp', 'mkcp-opts': {} },
        }),
      ])
    );
    expect(outbounds.find((o) => o.tag === 'vm-tcp')).toMatchObject({
      type: 'vmess',
      security: 'auto',
      alter_id: 32,
    });
    expect(outbounds.map((o) => o.tag)).not.toContain('vm-mkcp');
  });

  it('maps plain socks5/http and refuses TLS-wrapped hops', () => {
    const outbounds = outboundsOf(
      irWith([
        node({
          name: 'socks',
          type: 'socks5',
          server: 'a.example.com',
          port: 1080,
          config: { username: 'u', password: 'p', udp: true },
        }),
        node({
          name: 'https-hop',
          type: 'http',
          server: 'b.example.com',
          port: 8080,
          config: { tls: true },
        }),
      ])
    );
    expect(outbounds.find((o) => o.tag === 'socks')).toMatchObject({
      type: 'socks',
      version: '5',
      username: 'u',
    });
    expect(outbounds.map((o) => o.tag)).not.toContain('https-hop');
  });
});
