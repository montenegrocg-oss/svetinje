/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_MAPTILER_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
