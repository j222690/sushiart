import { forwardRef, useEffect } from 'react';
import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
const VARIANTS = {
  primary: 'bg-vinho-500 text-cream hover:bg-vinho-600 active:bg-vinho-700 disabled:bg-vinho-800',
  secondary: 'bg-ink-200 text-cream hover:bg-ink-100 border border-line',
  ghost: 'bg-transparent text-cream-muted hover:text-cream hover:bg-ink-200',
  outline: 'border border-vinho-500 text-vinho-200 hover:bg-vinho-900/40',
  danger: 'bg-danger/90 text-white hover:bg-danger',
  ember: 'bg-ember text-ink-900 hover:brightness-110 font-semibold',
};

const SIZES = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-sm rounded-xl gap-2',
  lg: 'h-[52px] px-6 text-base rounded-xl gap-2',
  icon: 'h-10 w-10 rounded-xl justify-center',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
const BADGE_TONES = {
  vinho: 'bg-vinho-500 text-cream',
  ember: 'bg-ember/15 text-ember border border-ember/30',
  success: 'bg-success/15 text-success border border-success/30',
  warning: 'bg-warning/15 text-warning border border-warning/30',
  danger: 'bg-danger/15 text-danger border border-danger/30',
  info: 'bg-vinho-900/60 text-vinho-100 border border-vinho-500/40',
  cash: 'bg-success/20 text-success border border-success/40',
  neutral: 'bg-ink-100 text-cream-muted border border-line',
};

export function Badge({ tone = 'neutral', className, children, ...props }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight',
        BADGE_TONES[tone] ?? BADGE_TONES.neutral,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ className, children, ...props }) {
  return (
    <div
      className={clsx('rounded-card border border-line bg-ink-500 shadow-card', className)}
      {...props}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
const FIELD_BASE =
  'w-full rounded-xl border border-line bg-ink-300 px-3.5 text-cream placeholder:text-cream-faint ' +
  'transition-colors focus:border-vinho-400 disabled:opacity-60';

export const Input = forwardRef(function Input({ label, hint, error, className, id, ...props }, ref) {
  const fieldId = id || props.name;
  return (
    <label className="block" htmlFor={fieldId}>
      {label && <span className="mb-1.5 block text-sm font-medium text-cream-muted">{label}</span>}
      <input
        ref={ref}
        id={fieldId}
        className={clsx(FIELD_BASE, 'h-11', error && 'border-danger', className)}
        {...props}
      />
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-cream-faint">{hint}</span>
      )}
    </label>
  );
});

export const Textarea = forwardRef(function Textarea({ label, hint, className, id, ...props }, ref) {
  const fieldId = id || props.name;
  return (
    <label className="block" htmlFor={fieldId}>
      {label && <span className="mb-1.5 block text-sm font-medium text-cream-muted">{label}</span>}
      <textarea
        ref={ref}
        id={fieldId}
        className={clsx(FIELD_BASE, 'min-h-[88px] py-2.5 resize-y', className)}
        {...props}
      />
      {hint && <span className="mt-1 block text-xs text-cream-faint">{hint}</span>}
    </label>
  );
});

export const Select = forwardRef(function Select({ label, children, className, id, ...props }, ref) {
  const fieldId = id || props.name;
  return (
    <label className="block" htmlFor={fieldId}>
      {label && <span className="mb-1.5 block text-sm font-medium text-cream-muted">{label}</span>}
      <select ref={ref} id={fieldId} className={clsx(FIELD_BASE, 'h-11', className)} {...props}>
        {children}
      </select>
    </label>
  );
});

export function Switch({ checked, onChange, label, description, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 text-left disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-cream">{label}</span>
        {description && <span className="block text-xs text-cream-faint">{description}</span>}
      </span>
      <span
        className={clsx(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-vinho-500' : 'bg-ink-50'
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-cream transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          )}
        />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Bottom sheet / modal
// ---------------------------------------------------------------------------
export function Sheet({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 animate-fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden bg-ink-500 shadow-raised',
          'rounded-t-sheet sm:rounded-sheet animate-slide-up border border-line',
          size === 'lg' ? 'sm:max-w-2xl' : size === 'xl' ? 'sm:max-w-4xl' : 'sm:max-w-md'
        )}
      >
        {title && (
          <header className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-brand text-lg text-cream">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="rounded-lg p-1 text-cream-muted hover:bg-ink-200 hover:text-cream"
            >
              <X size={20} />
            </button>
          </header>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

        {footer && <footer className="border-t border-line bg-ink-600 px-5 py-4 safe-bottom">{footer}</footer>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estados de carregamento e vazio
// ---------------------------------------------------------------------------
export function Skeleton({ className }) {
  return <div className={clsx('skeleton rounded-xl', className)} />;
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {Icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-300 text-cream-faint">
          <Icon size={26} />
        </span>
      )}
      <h3 className="font-brand text-lg text-cream">{title}</h3>
      {description && <p className="max-w-xs text-sm text-cream-muted">{description}</p>}
      {action}
    </div>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={clsx('animate-spin text-vinho-300', className)} size={22} />;
}

// ---------------------------------------------------------------------------
// Controle de quantidade (usado no produto e no carrinho)
// ---------------------------------------------------------------------------
export function QuantityStepper({ value, onChange, min = 1, max = 99, size = 'md' }) {
  const btn =
    size === 'sm'
      ? 'h-7 w-7 text-base'
      : 'h-9 w-9 text-lg';

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-ink-300 p-1">
      <button
        type="button"
        aria-label="Diminuir quantidade"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={clsx(btn, 'rounded-lg text-cream disabled:opacity-30 hover:bg-ink-100')}
      >
        −
      </button>
      <span className="min-w-[1.75rem] text-center text-sm font-semibold tabular-nums text-cream">
        {value}
      </span>
      <button
        type="button"
        aria-label="Aumentar quantidade"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={clsx(btn, 'rounded-lg text-cream disabled:opacity-30 hover:bg-ink-100')}
      >
        +
      </button>
    </div>
  );
}
