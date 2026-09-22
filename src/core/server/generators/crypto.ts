// Re-exports the shared generators. The implementations live in
// src/core/shared/generators/crypto.ts so both domains can use them; this
// module keeps every existing server-side import path working unchanged.
export * from '../../shared/generators/crypto';
