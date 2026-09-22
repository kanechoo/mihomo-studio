import { SchemaForm } from '../form/SchemaForm';
import { generalSchema } from '../../schemas/modules/general';
import { useServerStore } from '../../store/serverStore';

// The server general editor is the client general form bound to the server
// store, the same way DnsTab reuses the client DNS form.
//
// mihomo is one binary, so `mode`, the inbound ports, `allow-lan`, `tun`,
// etc. mean the same on a relay box as on a laptop; the client schema module
// (ports, mode, log level, TUN block, external controller/UI, runtime
// switches) is the reference implementation and is mounted here unchanged.
// The only server-specific piece is the adapter below: values read from the
// server draft, writes go to it.
export function GeneralTab() {
  const general = useServerStore((s) => s.config.general);
  const updateGeneralField = useServerStore((s) => s.updateGeneralField);

  return (
    <div className="p-6 overflow-y-auto h-full">
      <SchemaForm
        schema={generalSchema}
        values={general as unknown as Record<string, any>}
        onChange={(fieldKey, value) => updateGeneralField(fieldKey, value)}
      />
    </div>
  );
}