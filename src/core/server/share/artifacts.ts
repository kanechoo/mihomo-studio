// The two YAML artifacts a server config save carries alongside its IR.
//
// The Go server stores these verbatim and serves them byte for byte through
// /share/:token (the same arrangement as client configs and /sub/:token), so
// what a visitor downloads is exactly what the editor previewed. Both are
// rendered here, at save time, by the same code paths as the editor preview:
// ServerYamlExporter for the document itself, generateClientProxiesShare for
// the aggregated proxies fragment.
import type { ServerConfigIR } from '../types';
import { ServerYamlExporter } from '../exporters/serverYaml';
import { generateClientProxiesShare } from './aggregate';

export interface ServerRenderedArtifacts {
  /** The config's own mihomo document: listeners, outbounds, dns, rules. */
  rendered_server_yaml: string;
  /** Every convertible listener aggregated into one `proxies:` fragment. */
  rendered_client_proxies: string;
}

const exporter = new ServerYamlExporter();

export function computeServerRenderedArtifacts(config: ServerConfigIR): ServerRenderedArtifacts {
  const proxies = generateClientProxiesShare(config);
  return {
    rendered_server_yaml: exporter.export(config),
    rendered_client_proxies: proxies.yaml,
  };
}
