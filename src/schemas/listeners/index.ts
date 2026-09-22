import type { ListenerKind, TuicVersion } from '../../core/server/types';
import type {
  CapabilityFlags,
  ListenerSchema,
  SchemaSeed,
} from './dsl';
import { COMMON_FIELDS } from './common';

const NO_CAPABILITY: CapabilityFlags = {
  tls: false,
  reality: false,
  mtls: false,
  ech: false,
  ws: false,
  grpc: false,
  xhttp: false,
  udp: false,
  quic: false,
};

function capability(partial: Partial<CapabilityFlags>): CapabilityFlags {
  return { ...NO_CAPABILITY, ...partial };
}

function buildSchema(seed: SchemaSeed): ListenerSchema {
  return {
    kind: seed.kind,
    yamlType: seed.kind === 'tuic' ? 'tuic' : seed.kind,
    tuicVersion: seed.tuicVersion,
    category: seed.category,
    labelKey: seed.labelKey,
    descriptionKey: seed.descriptionKey,
    portMode: seed.portMode ?? 'ports',
    supportsUdpField: seed.supportsUdpField ?? false,
    capability: capability(seed.capability ?? {}),
    shareUri: seed.shareUri ?? 'unsupported',
    docUrl: seed.docUrl,
    // Per-schema verification date when a seed declares one; the registry
    // default only covers seeds that have not been re-audited since.
    lastVerifiedAt: seed.lastVerifiedAt ?? '2026-08-25',
    fields: [...COMMON_FIELDS, ...(seed.fields ?? [])],
  };
}

const LISTENERS_BASE = '/config/inbound/listeners';
export function docUrl(name: string): string {
  return `https://wiki.metacubex.one${LISTENERS_BASE}/${name}/`;
}

export const listenerSchemas: Record<string, ListenerSchema> = {};

export function schemaKey(kind: ListenerKind, version?: TuicVersion): string {
  return kind === 'tuic' ? `tuic-${version ?? 'v5'}` : kind;
}

export function registerSchemas(seeds: SchemaSeed[]): void {
  for (const seed of seeds) {
    listenerSchemas[schemaKey(seed.kind, seed.tuicVersion)] = buildSchema(seed);
  }
}

export function getListenerSchema(
  kind: ListenerKind,
  version?: TuicVersion
): ListenerSchema | undefined {
  return listenerSchemas[schemaKey(kind, version)];
}

export function availableListenerSchemas(): ListenerSchema[] {
  return Object.values(listenerSchemas);
}

import {
  HTTP_SEED,
  MIXED_SEED,
  REDIR_SEED,
  SOCKS_SEED,
  TPROXY_SEED,
  TUNNEL_SEED,
} from './simple';
import { TROJAN_SEED, VLESS_SEED, VMESS_SEED } from './encrypted';
import {
  ANYTLS_SEED,
  SHADOWSOCKS_SEED,
  SNELL_SEED,
} from './shadowsocksFamily';
import {
  HYSTERIA2_REALM_SEED,
  HYSTERIA2_SEED,
  SHADOWQUIC_SEED,
  TUIC_V4_SEED,
  TUIC_V5_SEED,
} from './quic';
import {
  MIERU_SEED,
  SUDOKU_SEED,
  TRUSTTUNNEL_SEED,
  TUN_SEED,
} from './misc';

registerSchemas([
  HTTP_SEED,
  SOCKS_SEED,
  MIXED_SEED,
  REDIR_SEED,
  TPROXY_SEED,
  TUNNEL_SEED,
  VLESS_SEED,
  VMESS_SEED,
  TROJAN_SEED,
  SHADOWSOCKS_SEED,
  ANYTLS_SEED,
  SNELL_SEED,
  TUIC_V4_SEED,
  TUIC_V5_SEED,
  HYSTERIA2_SEED,
  HYSTERIA2_REALM_SEED,
  SHADOWQUIC_SEED,
  MIERU_SEED,
  SUDOKU_SEED,
  TRUSTTUNNEL_SEED,
  TUN_SEED,
]);
