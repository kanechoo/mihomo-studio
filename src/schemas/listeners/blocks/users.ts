import type { ServerFieldDef } from '../dsl';

export const AUTH_ITEM_USERNAME_PASSWORD: ServerFieldDef[] = [
  { key: 'username', labelKey: 'server.fields.user.username', section: 'auth', type: 'text' },
  {
    key: 'password',
    labelKey: 'server.fields.user.password',
    section: 'auth',
    type: 'text',
    sensitive: true,
    generator: 'password',
  },
];

export const AUTH_ITEM_USERNAME_UUID_PASSWORD: ServerFieldDef[] = [
  { key: 'username', labelKey: 'server.fields.user.username', section: 'auth', type: 'text' },
  {
    key: 'uuid',
    labelKey: 'server.fields.user.uuid',
    section: 'auth',
    type: 'text',
    generator: 'uuid',
  },
  {
    key: 'password',
    labelKey: 'server.fields.user.password',
    section: 'auth',
    type: 'text',
    sensitive: true,
    generator: 'password',
  },
];

export const AUTH_ITEM_USERNAME_UUID_ALTERID: ServerFieldDef[] = [
  { key: 'username', labelKey: 'server.fields.user.username', section: 'auth', type: 'text' },
  {
    key: 'uuid',
    labelKey: 'server.fields.user.uuid',
    section: 'auth',
    type: 'text',
    generator: 'uuid',
  },
  { key: 'alterId', labelKey: 'server.fields.user.alterId', section: 'auth', type: 'number' },
];

export const AUTH_ITEM_USERNAME_UUID_FLOW: ServerFieldDef[] = [
  { key: 'username', labelKey: 'server.fields.user.username', section: 'auth', type: 'text' },
  {
    key: 'uuid',
    labelKey: 'server.fields.user.uuid',
    section: 'auth',
    type: 'text',
    generator: 'uuid',
  },
  { key: 'flow', labelKey: 'server.fields.user.flow', section: 'auth', type: 'text' },
];

export const AUTH_ITEM_NAME_PASSWORD: ServerFieldDef[] = [
  { key: 'name', labelKey: 'server.fields.user.name', section: 'auth', type: 'text' },
  {
    key: 'password',
    labelKey: 'server.fields.user.password',
    section: 'auth',
    type: 'text',
    sensitive: true,
    generator: 'password',
  },
];

export function userListDef(
  key: string,
  labelKey: string,
  itemFields: ServerFieldDef[],
  extra?: Partial<ServerFieldDef>
): ServerFieldDef {
  return {
    key,
    labelKey,
    section: 'auth',
    type: 'user-list',
    itemFields,
    ...extra,
  };
}
