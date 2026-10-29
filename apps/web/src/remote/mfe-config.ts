// =============================================================================
// Configuração do Construtor de Fichas como microfrontend (remote "recordsMfe")
// -----------------------------------------------------------------------------
// O shell Clínica Digital carrega este módulo em /records/* e encaminha
// /api/v1/records/* para o servidor deste MFE (vite.config do shell).
// Os valores podem ser trocados por variáveis VITE_* sem mexer no código.
// =============================================================================

/** Rota do shell onde o módulo é montado (Route path="/records/*"). */
export const MFE_BASENAME = import.meta.env.VITE_MFE_BASENAME || '/records';

/** Prefixo de API usado dentro do shell (proxy '/api/v1/records' → este MFE). */
export const MFE_API_BASE = import.meta.env.VITE_MFE_API_BASE || '/api/v1/records';
