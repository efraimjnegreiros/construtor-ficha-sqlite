// =============================================================================
// Modal — janela modal reutilizável (fecha com Esc e clique no fundo)
// Mesmo visual dos modais da form-templates-page.
// =============================================================================
import { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  title: string;
  subtitle?: string;
  size?: 'md' | 'lg' | 'xl';
  onClose: () => void;
  children: React.ReactNode;
}

const SIZES = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({ title, subtitle, size = 'md', onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl w-full p-6 relative max-h-[90vh] overflow-y-auto ${SIZES[size]}`}
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 pr-6">{title}</h3>
        {subtitle ? <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{subtitle}</p> : <div className="mb-3" />}
        {children}
      </div>
    </div>
  );
}
