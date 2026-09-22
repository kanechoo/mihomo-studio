import { x25519 } from '@noble/curves/ed25519';

// REALITY authenticates with an X25519 keypair whose halves are exchanged as
// standard base64 of the raw 32-byte scalars — `private-key` on the server,
// `public-key` in every client's reality-opts. mihomo generates these with
// Go's crypto/ecdh; X25519 is deterministic, so a keypair produced here is
// interchangeable with one produced by `mihomo generate reality-keypair`.
//
// The private key never leaves this module except as the return value: it must
// not be logged or written into share links (only the public key belongs
// there).

export interface RealityKeypair {
  privateKey: string;
  publicKey: string;
}
// Encode bytes using URL-safe Base64, which is the format expected by
// Mihomo Reality keys.
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';

  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Decode a URL-safe Base64-encoded Reality key into raw bytes.
// Returns undefined when the value is not valid Base64URL.
function fromBase64Url(value: string): Uint8Array | undefined {
  try {
    const base64 = value
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  } catch {
    return undefined;
  }
}

export function generateRealityKeypair(): RealityKeypair {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey: toBase64Url(privateKey), publicKey: toBase64Url(publicKey) };
}

// Derive the public key from a Reality private key using X25519, matching
// the key derivation performed by the server. This allows a public key to
// be regenerated from a manually provided private key without running
// `mihomo generate reality-keypair` again.
//
// Returns undefined when the private key cannot be decoded or is not exactly
// 32 bytes, allowing callers to keep the existing public key unchanged
// instead of replacing it with an invalid value.
export function deriveRealityPublicKey(privateKeyB64: string): string | undefined {
  const bytes = fromBase64Url(privateKeyB64);
  if (!bytes || bytes.length !== 32) return undefined;
  try {
    return toBase64Url(x25519.getPublicKey(bytes));
  } catch {
    return undefined;
  }
}
