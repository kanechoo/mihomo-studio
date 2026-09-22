import { request } from './client';

// REALITY keypair generation against the Go service.
//
// Contract (router.go):
//
//   POST /api/v1/reality-keypairs
//     auth: bearer token
//     request body: none
//     response 200:
//       { "private_key": "<base64>", "public_key": "<base64>" }
//
// The service generates an X25519 pair — the same algorithm and encoding as
// `mihomo generate reality-keypair` — and records the public half against the
// signed-in user's account, so subscription rendering can keep resolving
// links for configs that were saved from other machines. The private half is
// returned once and never stored server-side.
//
// The editor mirrors the public key into the document itself whenever a
// private key is written, so a saved config is self-contained even if it was
// produced entirely offline; this endpoint is the preferred source when the
// account backend is reachable because the key then exists in two places.
export interface RealityKeypairDto {
  privateKey: string;
  publicKey: string;
}

export async function createRealityKeypair(signal?: AbortSignal): Promise<RealityKeypairDto> {
  const body = await request<{ private_key: string; public_key: string }>(
    '/api/v1/reality-keypairs',
    { method: 'POST', signal }
  );
  return { privateKey: body.private_key, publicKey: body.public_key };
}
