import type { MihomoIR } from '../ir/types';
import { MihomoExporter } from './mihomo';
import { SingBoxExporter } from './singbox';

export interface RenderedFormats {
  mihomo: string;
  singbox: string;
}

// renderAllFormats produces both artifacts from one IR.
//
// Saving to the cloud has to send both, every time, and not just whichever
// format the editor happens to be previewing. The server treats a save as a
// replace: a body omitting `rendered_singbox` drops the stored one, and any
// subscription serving sing-box then has nothing to return — a URL that worked
// this morning starts answering 409 because the user toggled a dropdown before
// pressing save.
//
// Rendering both costs one extra pass over an in-memory document, which is
// nothing next to the round trip that follows it.
export function renderAllFormats(ir: MihomoIR): RenderedFormats {
  return {
    mihomo: new MihomoExporter().export(ir),
    singbox: new SingBoxExporter().export(ir),
  };
}
