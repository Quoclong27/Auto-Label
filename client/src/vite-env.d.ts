/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_ADMIN_EMAIL?: string
  // thêm các biến môi trường khác nếu có
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}