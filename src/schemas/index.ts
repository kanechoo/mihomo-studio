import type { ConfigSchema, ModuleSchema } from './types';
import { generalSchema } from './modules/general';
import { dnsSchema } from './modules/dns';
import { proxyGroupsSchema } from './modules/groups';
import { rulesSchema } from './modules/rules';
import { ntpSchema } from './modules/ntp';
import { profileSchema } from './modules/profile';
import { experimentalSchema } from './modules/experimental';
import { geodataSchema } from './modules/geodata';
import { accessControlSchema } from './modules/accessControl';
import { hostsSchema } from './modules/hosts';
import { snifferSchema } from './modules/sniffer';

function module(
  moduleKey: string,
  label: string,
  fields: ModuleSchema['fields']
): ModuleSchema {
  return { moduleKey, label, fields };
}

// Main schema registry
export const configSchema: ConfigSchema = {
  version: '1.0.0',
  modules: [
    generalSchema,
    dnsSchema,
    module('ntp', 'ntp.title', ntpSchema),
    module('profile', 'profile.title', profileSchema),
    module('experimental', 'experimental.title', experimentalSchema),
    module('geodata', 'geodata.title', geodataSchema),
    module('accessControl', 'accessControl.title', accessControlSchema),
    module('hosts', 'hosts.title', hostsSchema),
    module('sniffer', 'sniffer.title', snifferSchema),
    // proxies and proxyGroups are handled separately with dynamic lists
    // rulesSchema is also handled with dynamic list
  ],
};

// Export schemas for use in dedicated list components
export { proxyGroupsSchema, rulesSchema };

// Get schema for a specific module
export function getModuleSchema(moduleKey: string) {
  return configSchema.modules.find(m => m.moduleKey === moduleKey);
}

// Export all schemas
export * from './types';
export * from './modules/general';
export * from './modules/dns';
export * from './modules/groups';
export * from './modules/rules';
export * from './modules/proxies';
