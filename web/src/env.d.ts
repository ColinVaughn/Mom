/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_APP_ENV?: string
  readonly VITE_AZURE_LOGIN_HINT?: string
  readonly VITE_AZURE_DOMAIN_HINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
