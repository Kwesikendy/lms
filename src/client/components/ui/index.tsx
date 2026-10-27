import React, {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  AlertCircle,
  ChevronDown,
  Inbox,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const EASE = [0.16, 1, 0.3, 1] as const;

/* ============================================================================
   BUTTONS
   ============================================================================ */
type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'dark' | 'light';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none cursor-pointer transition-[background-color,color,border-color,box-shadow,transform,opacity] duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-on-ink hover:opacity-85 shadow-sm',
  accent: 'bg-accent text-on-accent hover:brightness-110 shadow-sm',
  secondary: 'border border-line-strong bg-card text-ink hover:border-ink',
  ghost: 'text-ink-2 hover:bg-ink/6 hover:text-ink',
  danger: 'border border-danger/30 bg-card text-danger hover:bg-danger-soft',
  dark: 'border border-white/15 bg-white/10 text-white hover:bg-white/20',
  light: 'bg-white text-[#15171c] hover:bg-white/90',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-7 text-[15px]',
  icon: 'h-10 w-10',
};

export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string
) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, className, children, disabled, type, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export interface LinkButtonProps {
  to?: string;
  href?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  className?: string;
  children?: ReactNode;
  download?: boolean;
  target?: string;
  onClick?: () => void;
  'aria-label'?: string;
}

/** Anchor styled as a button. Avoids invalid <a><button/></a> nesting. */
export function LinkButton({
  to,
  href,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  className,
  children,
  download,
  target,
  onClick,
  ...rest
}: LinkButtonProps) {
  const cls = buttonClass(variant, size, className);
  const content = (
    <>
      {icon}
      {children}
      {iconRight}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} onClick={onClick} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={cls}
      download={download}
      target={target}
      rel={target === '_blank' ? 'noreferrer' : undefined}
      onClick={onClick}
      {...rest}
    >
      {content}
    </a>
  );
}

/* ============================================================================
   SURFACES
   ============================================================================ */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'plain' | 'glass' | 'tint' | 'night' | 'flat';
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const cardTones: Record<NonNullable<CardProps['tone']>, string> = {
  plain: 'border border-line bg-card shadow-soft',
  flat: 'border border-line bg-card',
  tint: 'border border-line bg-canvas',
  glass: 'glass',
  night: 'bg-night text-white border border-white/5',
};

export function Card({
  tone = 'plain',
  interactive,
  padding = 'md',
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'relative rounded-3xl',
        cardTones[tone],
        padding === 'sm' && 'p-4',
        padding === 'md' && 'p-5 sm:p-6',
        padding === 'lg' && 'p-6 sm:p-8',
        interactive &&
          'transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-line-strong hover:shadow-lift focus-within:border-line-strong',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ============================================================================
   BADGES, CHIPS, AVATARS
   ============================================================================ */
type Tone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'sage' | 'sky' | 'sand' | 'plum' | 'ink';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-ink/6 text-ink-2',
  accent: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  sage: 'bg-sage text-sage-ink',
  sky: 'bg-sky text-sky-ink',
  sand: 'bg-sand text-sand-ink',
  plum: 'bg-plum text-plum-ink',
  ink: 'bg-ink text-on-ink',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap',
        toneClasses[tone],
        className
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-9 shrink-0 rounded-full border px-4 text-[13px] font-medium transition-all duration-200 active:scale-[0.97]',
        active
          ? 'border-ink bg-ink text-on-ink'
          : 'border-line-strong bg-card text-ink-2 hover:border-ink hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const avatarTones = ['bg-sage text-sage-ink', 'bg-sky text-sky-ink', 'bg-sand text-sand-ink', 'bg-plum text-plum-ink', 'bg-accent-soft text-accent-ink'];

export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .replace(/^(Dr\.|Prof\.)\s+/i, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        avatarTones[hashString(name) % avatarTones.length],
        className
      )}
    >
      {initials || '?'}
    </span>
  );
}

/* ============================================================================
   COVER ARTWORK: deterministic abstract compositions (no stock photos)
   ============================================================================ */
const palettes = [
  { bg: '#DCE7D8', a: '#2C5A38', b: '#F4F1EA', c: '#B8CFB2' },
  { bg: '#DAE7F2', a: '#1E4C78', b: '#FAF8F4', c: '#B5CEE3' },
  { bg: '#F0E2C6', a: '#74500F', b: '#FFF8EA', c: '#E2C88F' },
  { bg: '#E7DCEB', a: '#583663', b: '#FBF6FD', c: '#CDB6D6' },
  { bg: '#FBDDD1', a: '#B0340F', b: '#FFF5F0', c: '#F2B3A0' },
  { bg: '#1A1C22', a: '#F0E2C6', b: '#2C2F38', c: '#D6431A' },
];

export function Cover({
  seed,
  label,
  className,
}: {
  seed: string;
  label?: string | null;
  className?: string;
}) {
  const h = hashString(seed);
  const p = palettes[h % palettes.length];
  const pattern = (h >> 3) % 4;
  const bars = Array.from({ length: 7 }, (_, i) => 70 + (((h >> (i * 2)) & 7) * 18 + i * 6));

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', className)} style={{ backgroundColor: p.bg }}>
      <svg
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        {pattern === 0 && (
          <>
            <circle cx="290" cy="116" r="118" fill={p.a} />
            <circle cx="290" cy="116" r="62" fill={p.b} />
            <path d="M0 240A170 170 0 0 1 170 70V240Z" fill={p.c} />
          </>
        )}
        {pattern === 1 && (
          <>
            {bars.map((height, i) => (
              <rect
                key={i}
                x={34 + i * 52}
                y={240 - height}
                width="36"
                height={height + 20}
                rx="18"
                fill={i % 2 ? p.c : p.a}
              />
            ))}
            <circle cx="330" cy="52" r="22" fill={p.b} />
          </>
        )}
        {pattern === 2 && (
          <>
            <circle cx="120" cy="120" r="108" fill={p.c} />
            <circle cx="120" cy="120" r="76" fill={p.a} />
            <circle cx="120" cy="120" r="44" fill={p.b} />
            <rect x="250" y="40" width="110" height="160" rx="55" fill={p.a} />
            <circle cx="305" cy="95" r="26" fill={p.b} />
          </>
        )}
        {pattern === 3 && (
          <>
            {Array.from({ length: 5 }).map((_, r) =>
              Array.from({ length: 8 }).map((__, c) => (
                <circle key={`${r}-${c}`} cx={28 + c * 30} cy={36 + r * 40} r="4.5" fill={p.a} opacity="0.55" />
              ))
            )}
            <rect x="238" y="34" width="130" height="130" rx="30" fill={p.c} transform="rotate(12 303 99)" />
            <circle cx="296" cy="168" r="48" fill={p.a} />
            <circle cx="296" cy="168" r="20" fill={p.b} />
          </>
        )}
      </svg>
      {label && (
        <span className="glass absolute bottom-3 left-3 max-w-[85%] truncate rounded-full px-3 py-1 text-[11px] font-medium text-ink">
          {label}
        </span>
      )}
    </div>
  );
}

/* ============================================================================
   FORM CONTROLS
   ============================================================================ */
const controlBase =
  'w-full rounded-xl border bg-card px-3.5 text-sm text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-200 outline-none focus:border-ink focus:ring-4 focus:ring-ink/8 disabled:cursor-not-allowed disabled:opacity-50';

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-[13px] font-medium text-ink">
          {label}
        </label>
      )}
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-center gap-1.5 text-xs text-danger">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

export interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  wrapperClassName?: string;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField(
  { label, hint, error, leading, trailing, className, wrapperClassName, id, ...props },
  ref
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} className={wrapperClassName}>
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-3">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            controlBase,
            'h-11',
            error ? 'border-danger' : 'border-line-strong',
            leading && 'pl-10',
            trailing && 'pr-11',
            className
          )}
          {...props}
        />
        {trailing && <span className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</span>}
      </div>
    </FieldShell>
  );
});

export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
  wrapperClassName?: string;
}

export function SelectField({
  label,
  hint,
  error,
  options,
  className,
  wrapperClassName,
  id,
  ...props
}: SelectFieldProps) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <FieldShell id={selectId} label={label} hint={hint} error={error} className={wrapperClassName}>
      <div className="relative">
        <select
          id={selectId}
          className={cn(controlBase, 'h-11 appearance-none pr-10', error ? 'border-danger' : 'border-line-strong', className)}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3"
          aria-hidden="true"
        />
      </div>
    </FieldShell>
  );
}

export interface TextAreaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export function TextAreaField({
  label,
  hint,
  error,
  className,
  wrapperClassName,
  id,
  ...props
}: TextAreaFieldProps) {
  const auto = useId();
  const areaId = id ?? auto;
  return (
    <FieldShell id={areaId} label={label} hint={hint} error={error} className={wrapperClassName}>
      <textarea
        id={areaId}
        aria-invalid={Boolean(error) || undefined}
        className={cn(controlBase, 'min-h-24 resize-y py-3 leading-relaxed', error ? 'border-danger' : 'border-line-strong', className)}
        {...props}
      />
    </FieldShell>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl py-1.5 text-left"
    >
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-3">{description}</span>}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-ink' : 'bg-line-strong'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-card shadow transition-[left] duration-200 ease-out',
            checked ? 'left-[22px]' : 'left-0.5'
          )}
        />
      </span>
    </button>
  );
}

/* ============================================================================
   TABS (animated pill)
   ============================================================================ */
export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  id,
  className,
  label,
}: {
  items: Array<TabItem<T>>;
  value: T;
  onChange: (v: T) => void;
  id: string;
  className?: string;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = items.findIndex((i) => i.id === value);
    if (e.key === 'ArrowRight') onChange(items[(idx + 1) % items.length].id);
    else if (e.key === 'ArrowLeft') onChange(items[(idx - 1 + items.length) % items.length].id);
    else return;
    e.preventDefault();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-ink/6 p-1', className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative h-9 shrink-0 rounded-full px-4 text-[13px] font-medium transition-colors duration-200',
              active ? 'text-ink' : 'text-ink-3 hover:text-ink'
            )}
          >
            {active && (
              <motion.span
                layoutId={`${id}-pill`}
                className="absolute inset-0 rounded-full border border-line bg-card shadow-sm"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-2">
              {item.icon}
              {item.label}
              {item.count !== undefined && (
                <span className="text-[11px] tabular-nums text-ink-3">{item.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   MODAL (focus trap, scroll lock, Esc, restore focus) + POPOVER
   ============================================================================ */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      const target =
        panel?.querySelector<HTMLElement>('[data-autofocus]') ??
        panel?.querySelector<HTMLElement>('input,select,textarea') ??
        panel;
      target?.focus();
    }, 40);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 backdrop-blur-sm"
            style={{ background: 'var(--scrim)' }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.28, ease: EASE }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-card shadow-lift outline-none sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl',
              widths[size]
            )}
          >
            <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-6">
              <div className="min-w-0">
                <h2 id={titleId} className="display text-2xl">
                  {title}
                </h2>
                {description && <p className="mt-1.5 text-sm text-ink-3">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2">{children}</div>
            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function Popover({
  trigger,
  children,
  align = 'right',
  side = 'bottom',
  className,
}: {
  trigger: (api: { open: boolean; toggle: () => void }) => ReactNode;
  children: (api: { close: () => void }) => ReactNode;
  align?: 'left' | 'right';
  side?: 'bottom' | 'top';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: side === 'bottom' ? -6 : 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.16, ease: EASE }}
            style={{ transformOrigin: `${side === 'bottom' ? 'top' : 'bottom'} ${align}` }}
            className={cn(
              'absolute z-50 w-72 rounded-2xl border border-line bg-card p-2 shadow-lift',
              align === 'right' ? 'right-0' : 'left-0',
              side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-3',
              className
            )}
          >
            {children({ close: () => setOpen(false) })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================================
   DISCLOSURE, PROGRESS
   ============================================================================ */
export function Disclosure({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-ink/3"
      >
        <span className="min-w-0">
          <span className="block font-medium text-ink">{title}</span>
          {meta && <span className="mt-0.5 block text-xs text-ink-3">{meta}</span>}
        </span>
        <ChevronDown
          className={cn('size-5 shrink-0 text-ink-3 transition-transform duration-300', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="border-t border-line">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  showValue = true,
  className,
}: {
  value: number;
  label?: string;
  showValue?: boolean;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-ink-2">{label}</span>
          {showValue && <span className="tabular-nums text-ink-3">{v}%</span>}
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

export function ProgressRing({
  value,
  size = 72,
  stroke = 6,
  tone = 'accent',
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: 'accent' | 'light';
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${v}% complete`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={tone === 'light' ? 'rgba(255,255,255,0.15)' : 'var(--line)'}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="var(--accent)"
          strokeDasharray={c}
          strokeDashoffset={c - (c * v) / 100}
          style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <span
        className={cn(
          'absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums',
          tone === 'light' ? 'text-white' : 'text-ink'
        )}
      >
        {v}%
      </span>
    </div>
  );
}

/* ============================================================================
   STATES
   ============================================================================ */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-xl bg-ink/8', className)} />;
}

export function CardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-4 rounded-3xl border border-line bg-card p-4">
          <Skeleton className="h-44 rounded-2xl" />
          <div className="space-y-3 px-1 pb-1">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-28 rounded-3xl" />
      </div>
      <Skeleton className="h-64 rounded-3xl" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-dashed border-line-strong px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-ink/6 text-ink-2">
        {icon ?? <Inbox className="size-6" aria-hidden="true" />}
      </div>
      <h3 className="display text-xl">{title}</h3>
      {description && <p className="mt-2 text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Couldn't load this",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-danger/25 bg-danger-soft/60 px-6 py-12 text-center"
    >
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
        <AlertCircle className="size-6" aria-hidden="true" />
      </div>
      <h3 className="display text-xl">{title}</h3>
      <p className="mt-2 text-sm text-ink-2">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-6" onClick={onRetry} icon={<RefreshCw className="size-4" />}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ============================================================================
   LAYOUT HELPERS
   ============================================================================ */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="display text-4xl sm:text-[2.75rem]">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-[15px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card padding="sm" className="flex items-start justify-between gap-3 p-5">
      <div className="min-w-0">
        <p className="text-[13px] text-ink-3">{label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
        {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      </div>
      {icon && <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-ink/6 text-ink-2">{icon}</div>}
    </Card>
  );
}

export function SectionHeading({
  title,
  action,
  description,
}: {
  title: string;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="display text-[1.75rem] sm:text-3xl">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ============================================================================
   RICH TEXT: tiny, safe markdown subset (headings, lists, bold, code)
   ============================================================================ */
function renderInline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      blocks.push(<h3 key={key++}>{renderInline(heading[1])}</h3>);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={key++}>
          {items.map((t, n) => (
            <li key={n}>{renderInline(t)}</li>
          ))}
        </ul>
      );
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={key++}>
          {items.map((t, n) => (
            <li key={n}>{renderInline(t)}</li>
          ))}
        </ol>
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push(<p key={key++}>{renderInline(para.join(' '))}</p>);
  }
  return <div className={cn('rich', className)}>{blocks}</div>;
}
