import type { ListenerIR } from '../../types';
import type { ServerProblem } from '../problems';
import { validateBlocks } from './blocks';
import { validateEncrypted } from './encrypted';
import { validateShadowsocks } from './shadowsocks';
import { validateHysteria2, validateHysteria2Realm } from './quic';
import {
  validateMieru,
  validateSudoku,
  validateTrustTunnel,
  validateTunListener,
} from './misc';

export function isWildcardListen(listener: ListenerIR): boolean {
  const listen = listener.listen.trim();
  return listen === '0.0.0.0' || listen === '::' || listen === '*';
}

function appProxySemantic(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];
  const base = { listenerId: listener.id, listenerName: listener.name, section: 'auth' as const };

  if (listener.auth.mode === 'inherit') {
    problems.push({
      severity: 'info',
      code: 'server.problem.globalAuthFallback',
      ...base,
    });
    if (isWildcardListen(listener) && listener.tls.mode === 'none') {
      problems.push({
        severity: 'warning',
        code: 'server.problem.plaintextPublicNoAuth',
        params: { protocol: listener.type },
        section: 'common',
        listenerId: listener.id,
        listenerName: listener.name,
        field: 'listen',
      });
    }
  }

  if (isWildcardListen(listener) && listener.tls.mode === 'none' && listener.auth.mode !== 'inherit') {
    problems.push({
      severity: 'warning',
      code: 'server.problem.plaintextPublicBind',
      params: { protocol: listener.type },
      section: 'common',
      listenerId: listener.id,
      listenerName: listener.name,
      field: 'listen',
    });
  }

  return problems;
}

function tunnelSemantic(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];
  const base = {
    listenerId: listener.id,
    listenerName: listener.name,
    section: 'protocol' as const,
  };

  const target = typeof listener.protocol.target === 'string' ? listener.protocol.target : '';
  if (target.trim() === '') {
    problems.push({ severity: 'error', code: 'server.problem.targetRequired', ...base, field: 'protocol.target' });
  }

  const network = Array.isArray(listener.protocol.network)
    ? (listener.protocol.network as unknown[])
    : undefined;
  if (!network || network.length === 0) {
    problems.push({ severity: 'error', code: 'server.problem.networkRequired', ...base, field: 'protocol.network' });
  } else if (network.some((entry) => entry !== 'tcp' && entry !== 'udp')) {
    problems.push({
      severity: 'error',
      code: 'server.problem.networkInvalid',
      ...base,
      field: 'protocol.network',
    });
  }

  return problems;
}

export function validateSemantic(listener: ListenerIR): ServerProblem[] {
  let problems: ServerProblem[];
  switch (listener.type) {
    case 'http':
    case 'socks':
    case 'mixed':
      problems = appProxySemantic(listener);
      break;
    case 'tunnel':
      problems = tunnelSemantic(listener);
      break;
    case 'vless':
    case 'vmess':
    case 'trojan':
    case 'anytls':
      problems = validateEncrypted(listener);
      break;
    case 'shadowsocks':
      problems = validateShadowsocks(listener);
      break;
    case 'hysteria2':
      problems = validateHysteria2(listener);
      break;
    case 'hysteria2-realm':
      problems = validateHysteria2Realm(listener);
      break;
    case 'mieru':
      problems = validateMieru(listener);
      break;
    case 'sudoku':
      problems = validateSudoku(listener);
      break;
    case 'trusttunnel':
      problems = validateTrustTunnel(listener);
      break;
    case 'tun':
      problems = validateTunListener(listener);
      break;
    default:
      problems = [];
  }
  return [...problems, ...validateBlocks(listener)];
}
