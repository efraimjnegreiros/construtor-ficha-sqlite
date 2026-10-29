/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_ADMIN_EMAIL?: string;
  readonly VITE_DEV_USER_EMAIL?: string;
  /** Rota do shell onde o MFE é montado (padrão /records). */
  readonly VITE_MFE_BASENAME?: string;
  /** Prefixo de API dentro do shell (padrão /api/v1/records). */
  readonly VITE_MFE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
