import { SchemaForm } from '../form/SchemaForm';
import { dnsSchema } from '../../schemas/modules/dns';
import { useServerStore } from '../../store/serverStore';

// The server DNS editor is the client DNS form bound to a different store.
//
// mihomo is one binary, so the `dns:` section means the same thing on either
// side of this app; the client schema module (27 documented fields, provider
// pickers, conditional fake-ip gating) is the reference implementation and is
// mounted here unchanged. The only server-specific piece is the adapter
// below: values read from the server draft, writes go to it.
//
// SchemaForm routes through the provided `onChange` whenever one is given, so
// the shared widgets never touch the client IR store from here.
export function DnsTab() {
  const dns = useServerStore((s) => s.config.dns);
  const updateDnsField = useServerStore((s) => s.updateDnsField);

  return (
    <div className="p-6 overflow-y-auto h-full">
      <SchemaForm
        schema={dnsSchema}
        values={dns as unknown as Record<string, any>}
        onChange={(fieldKey, value) => updateDnsField(fieldKey, value)}
      />
    </div>
  );
}
