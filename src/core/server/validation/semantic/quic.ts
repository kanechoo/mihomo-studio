import type { ListenerIR } from '../../types';
import type { ServerProblem } from '../problems';
import { isValidRegex, isValidUrl } from '../syntax';

function base(listener: ListenerIR, field: string) {
  return {
    listenerId: listener.id,
    listenerName: listener.name,
    section: 'protocol' as const,
    field,
  };
}

function hasCertPair(listener: ListenerIR): boolean {
  return Boolean(
    (listener.tls.certificate?.value ?? '') !== '' &&
      (listener.tls.privateKey?.value ?? '') !== ''
  );
}

export function validateHysteria2(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];

  if (!hasCertPair(listener)) {
    problems.push({
      severity: 'error',
      code: 'server.problem.hy2CertRequired',
      ...base(listener, 'tls.certificate'),
    });
  }

  const masquerade = listener.protocol.masquerade;
  if (typeof masquerade === 'string' && masquerade.trim() !== '') {
    const isFile = /^file:\/\/\//.test(masquerade);
    const isHttp = isValidUrl(masquerade, ['http', 'https']);
    if (!isFile && !isHttp) {
      problems.push({
        severity: 'error',
        code: 'server.problem.masqueradeInvalid',
        params: { value: masquerade },
        ...base(listener, 'protocol.masquerade'),
      });
    }
  }

  return problems;
}

export function validateHysteria2Realm(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];

  const pattern = listener.protocol['realm-name-pattern'];
  if (typeof pattern === 'string' && pattern.trim() !== '' && !isValidRegex(pattern)) {
    problems.push({
      severity: 'error',
      code: 'server.problem.realmPatternInvalid',
      ...base(listener, 'protocol.realm-name-pattern'),
    });
  }

  const realmOpts = listener.protocol['realm-opts'];
  const optsRecord =
    realmOpts && typeof realmOpts === 'object'
      ? (realmOpts as Record<string, unknown>)
      : undefined;
  const serverUrlValue = optsRecord?.['server-url'];
  if (typeof serverUrlValue === 'string' && serverUrlValue.trim() !== '') {
    if (!isValidUrl(serverUrlValue, ['http', 'https'])) {
      problems.push({
        severity: 'error',
        code: 'server.problem.realmServerUrlInvalid',
        ...base(listener, 'protocol.realm-opts.server-url'),
      });
    }
  }

  return problems;
}
