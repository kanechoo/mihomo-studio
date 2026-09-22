import type { ListenerIR } from '../../types';
import type { ServerProblem } from '../problems';

type Layer = 'certPair' | 'shadowTls' | 'resTls' | 'jls' | 'reality' | 'tlsmirror' | 'decryption' | 'ssOption';

function presentLayers(listener: ListenerIR): Layer[] {
  const layers: Layer[] = [];
  const { tls, security, protocol } = listener;

  if (tls.mode === 'tls' && tls.certificate?.value && tls.privateKey?.value) {
    layers.push('certPair');
  }
  if (security.shadowTls?.enable) layers.push('shadowTls');
  if (security.resTls?.enable) layers.push('resTls');
  if (security.jls?.enable) layers.push('jls');

  if (tls.mode === 'reality' && tls.reality && tls.reality.dest && tls.reality.privateKey) {
    layers.push('reality');
  }
  if (tls.mode === 'tlsmirror' && typeof tls.tlsmirror?.dest === 'string' && tls.tlsmirror.dest !== '' && typeof tls.tlsmirror['primary-key'] === 'string' && tls.tlsmirror['primary-key'] !== '') {
    layers.push('tlsmirror');
  }

  const decryption = protocol.decryption;
  if (typeof decryption === 'string' && decryption.trim() !== '') layers.push('decryption');

  const ssOption = protocol['ss-option'] as Record<string, unknown> | undefined;
  if (
    ssOption &&
    ssOption.enabled === true &&
    typeof ssOption.password === 'string' &&
    ssOption.password !== ''
  ) {
    layers.push('ssOption');
  }

  return layers;
}

function allowInsecureEnabled(listener: ListenerIR): boolean {
  return listener.protocol['allow-insecure'] === true;
}

export type AllowedLayer =
  | Layer
  | 'anyOfTheAbove';

const LAYER_SETS: Partial<Record<ListenerIR['type'], Layer[]>> = {
  vless: ['certPair', 'shadowTls', 'resTls', 'jls', 'reality', 'decryption'],
  vmess: ['certPair', 'shadowTls', 'resTls', 'jls', 'reality', 'tlsmirror'],
  trojan: ['certPair', 'shadowTls', 'resTls', 'jls', 'reality', 'ssOption'],
  anytls: ['certPair', 'shadowTls', 'resTls', 'jls'],
};

export function validateSecurityLayer(
  listener: ListenerIR,
  allowed: Layer[]
): ServerProblem[] {
  if (allowInsecureEnabled(listener)) return [];
  const layers = presentLayers(listener).filter((layer) => allowed.includes(layer));
  if (layers.length === 0) {
    return [
      {
        severity: 'error',
        code: 'server.problem.insecureLayerRequired',
        params: { protocol: listener.type },
        listenerId: listener.id,
        listenerName: listener.name,
        section: 'tls',
      },
    ];
  }
  return [];
}

export function validateEncrypted(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];
  const allowed = LAYER_SETS[listener.type];
  if (allowed) {
    problems.push(...validateSecurityLayer(listener, allowed));
  }

  if (listener.type === 'vless') {
    problems.push(...validateXhttpSessionLength(listener));
  }

  return problems;
}

const ZERO_START_RE = /^0(?![.\d])/;

function validateXhttpSessionLength(listener: ListenerIR): ServerProblem[] {
  const transport = listener.transport;
  if (transport.kind !== 'xhttp' || !transport.xhttp) return [];

  const table = transport.xhttp.sessionTable;
  const length = transport.xhttp.sessionLength;
  if (!table || !length) return [];

  const start = length.split('-')[0]?.trim() ?? '';
  if (ZERO_START_RE.test(start)) {
    return [
      {
        severity: 'error',
        code: 'server.problem.xhttpSessionLengthZero',
        listenerId: listener.id,
        listenerName: listener.name,
        section: 'transport',
        field: 'transport.xhttp.sessionLength',
      },
    ];
  }
  return [];
}

/** Weak structural hint for the VLESS decryption composite string. */
export function looksLikeDecryptionConfig(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  return /^[A-Za-z0-9_.+-]+([(/][A-Za-z0-9_.:+-]*[/)])*([.(][^\s()]+)*\(.*\).*/.test(trimmed) ||
    trimmed.includes('(');
}
