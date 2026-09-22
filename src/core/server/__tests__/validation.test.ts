import { describe, it, expect } from 'vitest';
import { validateListenerFields } from '../validation/fields';
import { isRequiredNow, findConflicts, validateCrossField, validateDefsCrossField } from '../validation/crossField';
import { redactSecrets, REDACTED } from '../validation/problems';
import type { ServerFieldDef } from '../../../schemas/listeners/dsl';
import type { ListenerIR } from '../types';
import { createListener } from '../factory';

function def(partial: Partial<ServerFieldDef>): ServerFieldDef {
  return {
    key: 'protocol.k',
    labelKey: 'l',
    section: 'protocol',
    type: 'text',
    ...partial,
  };
}

const base = createListener('http');

describe('L2 validateListenerFields', () => {
  it('flags static required emptiness', () => {
    const problems = validateListenerFields([def({ required: true })], {
      ...base,
      protocol: {},
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].code).toBe('server.problem.fieldRequired');
    expect(problems[0].severity).toBe('error');
    expect(problems[0].field).toBe('protocol.k');
  });

  it('checks numeric bounds and NaN', () => {
    const numDef = def({ type: 'number', min: 1, max: 100 });
    expect(validateListenerFields([numDef], { ...base, protocol: { k: 0 } })[0]?.code).toBe(
      'server.problem.belowMin'
    );
    expect(validateListenerFields([numDef], { ...base, protocol: { k: 101 } })[0]?.code).toBe(
      'server.problem.aboveMax'
    );
    expect(validateListenerFields([numDef], { ...base, protocol: { k: 50 } })).toHaveLength(0);
    expect(validateListenerFields([numDef], { ...base, protocol: { k: Number.NaN } })[0]?.code).toBe(
      'server.problem.notANumber'
    );
  });

  it('applies text patterns only to non-empty values', () => {
    const pat = def({ pattern: '^[a-z]+$' });
    expect(validateListenerFields([pat], { ...base, protocol: { k: 'ABC' } })[0]?.code).toBe(
      'server.problem.patternMismatch'
    );
    expect(validateListenerFields([pat], { ...base, protocol: { k: '' } })).toHaveLength(0);
    expect(validateListenerFields([pat], { ...base, protocol: { k: 'ok' } })).toHaveLength(0);
  });

  it('warns on unknown select values without discarding them', () => {
    const sel = def({
      type: 'select',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    });
    expect(validateListenerFields([sel], { ...base, protocol: { k: 'z' } })).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'server.problem.unknownOption' }),
    ]);
    expect(validateListenerFields([sel], { ...base, protocol: { k: 'a' } })).toHaveLength(0);
    expect(validateListenerFields([sel], { ...base, protocol: {} })).toHaveLength(0);
  });

  it('requires string arrays for multiselect/tag-list', () => {
    const listDef = def({ type: 'tag-list' });
    expect(validateListenerFields([listDef], { ...base, protocol: { k: ['x'] } })).toHaveLength(0);
    expect(validateListenerFields([listDef], { ...base, protocol: { k: 'x' } })[0]?.code).toBe(
      'server.problem.notStringList'
    );
    expect(validateListenerFields([listDef], { ...base, protocol: { k: [1] } })[0]?.code).toBe(
      'server.problem.notStringList'
    );
  });

  it('delegates port expressions and PEM bodies', () => {
    expect(
      validateListenerFields([def({ type: 'port-expression' })], { ...base, protocol: { k: '99999' } })[0]
        ?.code
    ).toBe('server.problem.portBounds');
    expect(
      validateListenerFields([def({ type: 'pem' })], { ...base, protocol: { k: 'junk' } })[0]?.code
    ).toBe('server.problem.pemInvalid');
    expect(
      validateListenerFields([def({ type: 'pem' })], { ...base, protocol: { k: '' } })
    ).toHaveLength(0);
  });

  it('skips hidden fields (showIf false) but checks visible ones', () => {
    const hidden = def({ showIf: [{ field: 'tls.mode', operator: 'eq', value: 'reality' }] });
    const listener: ListenerIR = { ...base, tls: { ...base.tls, mode: 'none' }, protocol: {} };
    expect(validateListenerFields([{ ...hidden, required: true }], listener)).toHaveLength(0);

    const realityListener: ListenerIR = {
      ...base,
      tls: { ...base.tls, mode: 'reality' },
      protocol: {},
    };
    const problems = validateListenerFields([{ ...hidden, required: true }], realityListener);
    expect(problems[0]?.code).toBe('server.problem.fieldRequired');
  });
});

const COND_DEF = def({
  requiredWhen: [{ field: 'tls.mode', operator: 'eq', value: 'tls' }],
});

describe('L3 cross-field validation', () => {
  it('isRequiredNow honours static required first, then conditional evaluation', () => {
    expect(isRequiredNow(def({}), { ...base })).toBe(false);
    expect(isRequiredNow(COND_DEF, { ...base, tls: { ...base.tls, mode: 'none' } })).toBe(false);
    expect(isRequiredNow(COND_DEF, { ...base, tls: { ...base.tls, mode: 'tls' } })).toBe(true);
  });

  it('emits conditional-required problems only when the field is visible and empty', () => {
    const emptyTls: ListenerIR = { ...base, tls: { ...base.tls, mode: 'tls' } };
    const problems = validateDefsCrossField([COND_DEF], emptyTls);
    expect(problems).toHaveLength(1);
    expect(problems[0].code).toBe('server.problem.fieldRequiredConditionally');

    const filled: ListenerIR = { ...emptyTls, protocol: { k: 'v' } };
    expect(validateDefsCrossField([COND_DEF], filled)).toHaveLength(0);

    const hiddenButEmpty: ListenerIR = { ...base, tls: { ...base.tls, mode: 'none' } };
    const hiddenDef = def({
      showIf: [{ field: 'transport.kind', operator: 'eq', value: 'ws' }],
      requiredWhen: [{ field: 'tls.mode', operator: 'eq', value: 'tls' }],
    });
    expect(validateDefsCrossField([hiddenDef], hiddenButEmpty)).toHaveLength(0);
  });

  it('detects conflicts only when both sides hold values, deduplicating pairs', () => {
    const defs = [
      def({ key: 'protocol.a', conflictsWith: ['protocol.b'] }),
      def({ key: 'protocol.b' }),
    ];
    const both: ListenerIR = { ...base, protocol: { a: '1', b: '2' } };
    const one: ListenerIR = { ...base, protocol: { a: '1' } };

    const problems = validateDefsCrossField(defs, both);
    expect(problems).toHaveLength(1);
    expect(problems[0].code).toBe('server.problem.conflictingFields');
    expect(findConflicts(defs, one)).toHaveLength(0);
    expect(validateDefsCrossField([...defs, def({ key: 'protocol.b', conflictsWith: ['protocol.a'] })], both))
      .toHaveLength(1);
  });

  it('requires certificate/private-key to appear as a pair when TLS is active', () => {
    const certOnly: ListenerIR = {
      ...base,
      tls: {
        ...base.tls,
        certificate: { source: 'path', value: '/certs/c.pem' },
      },
    };
    const keyOnly: ListenerIR = {
      ...base,
      tls: { ...base.tls, privateKey: { source: 'path', value: '/certs/k.pem' } },
    };
    const paired: ListenerIR = {
      ...base,
      tls: {
        ...base.tls,
        certificate: { source: 'pem', value: 'X' },
        privateKey: { source: 'pem', value: 'Y' },
      },
    };
    const none: ListenerIR = { ...base };

    expect(validateCrossField(certOnly)[0]?.code).toBe('server.problem.certPairMismatch');
    expect(validateCrossField(keyOnly)[0]?.field).toBe('certificate');
    expect(validateCrossField(paired)).toHaveLength(0);
    expect(validateCrossField(none)).toHaveLength(0);
  });

  it('demands client-auth-cert under verify-if-given / require-and-verify', () => {
    const make = (type: typeof base.tls.clientAuthType): ListenerIR => ({
      ...base,
      tls: { ...base.tls, clientAuthType: type },
    });
    expect(validateCrossField(make('require-and-verify'))[0]?.code).toBe(
      'server.problem.clientAuthCertRequired'
    );
    expect(validateCrossField(make('verify-if-given'))[0]?.code).toBe(
      'server.problem.clientAuthCertRequired'
    );
    expect(validateCrossField(make('request'))).toHaveLength(0);
    expect(validateCrossField(make(undefined))).toHaveLength(0);

    const satisfied: ListenerIR = {
      ...base,
      tls: {
        ...base.tls,
        clientAuthType: 'require-and-verify',
        clientAuthCert: { source: 'path', value: '/ca.pem' },
        certificate: { source: 'path', value: '/c.pem' },
        privateKey: { source: 'path', value: '/k.pem' },
      },
    };
    expect(validateCrossField(satisfied)).toHaveLength(0);
  });

  it('skips TLS-pair logic entirely in none mode', () => {
    const strayKey: ListenerIR = {
      ...base,
      tls: { ...base.tls, mode: 'none', privateKey: { source: 'pem', value: 'K' } },
    };
    expect(validateCrossField(strayKey)).toHaveLength(0);
  });
});

describe('redactSecrets', () => {
  it('redacts sensitive string keys recursively without mutating input', () => {
    const ir = {
      auth: { token: ['tok-1'], users: [{ username: 'u', password: 'pw' }] },
      tls: { echKey: 'ech', reality: { privateKey: 'rk' } },
      keep: { deep: 'value' },
      numbers: { port: 443 },
    };
    const snapshot = JSON.stringify(ir);
    const out = redactSecrets(ir);

    expect((out.auth.token as string[])[0]).toBe(REDACTED);
    expect(out.auth.users[0].username).toBe('u');
    expect(out.auth.users[0].password).toBe(REDACTED);
    expect(out.tls.echKey).toBe(REDACTED);
    expect(out.tls.reality.privateKey).toBe(REDACTED);
    expect(out.keep.deep).toBe('value');
    expect(out.numbers.port).toBe(443);
    expect(JSON.stringify(ir)).toBe(snapshot);
  });

  it('leaves arrays of primitives and empty sensitive values alone', () => {
    const out = redactSecrets({
      names: ['a', 'b'],
      password: '',
      nested: [{ obfsPassword: 'obfs' }],
    });
    expect(out.names).toEqual(['a', 'b']);
    expect(out.password).toBe('');
    expect((out.nested[0] as Record<string, unknown>).obfsPassword).toBe(REDACTED);
  });
});
