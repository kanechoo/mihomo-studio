// Shared infrastructure consumed by both the client and server domains.
// Nothing in here may import from src/core/ir, src/core/server, or any
// component — shared code stays a leaf so both domains can depend on it
// without creating cycles.

export * from './generators/crypto';
export * from './generators/reality';
export * from './validation/syntax';
