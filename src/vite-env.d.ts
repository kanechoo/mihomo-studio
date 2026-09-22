/// <reference types="vite/client" />

// The environment variables this app reads. Declaring them means a typo in
// `import.meta.env.VITE_API_BSAE_URL` is a compile error rather than an
// undefined that silently falls through to a default.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GITHUB_CLIENT_ID?: string;
  readonly VITE_OAUTH_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
