import type { FieldSchema } from '../types';

// Profile / cache persistence (store-selected, store-fake-ip).
export const profileSchema: FieldSchema[] = [
  {
    fieldKey: 'store-selected',
    label: 'profile.storeSelected.label',
    type: 'boolean',
    default: false,
    description: 'profile.storeSelected.description',
  },
  {
    fieldKey: 'store-fake-ip',
    label: 'profile.storeFakeIp.label',
    type: 'boolean',
    default: false,
    description: 'profile.storeFakeIp.description',
  },
];
