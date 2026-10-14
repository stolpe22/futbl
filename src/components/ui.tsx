"use client";

import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertTriangle, ArrowLeft, HelpCircle, Loader2, RotateCw } from "lucide-react";
import { initials } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Botões                                                              */
/* ------------------------------------------------------------------ */

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variantClass: Record<Variant, string> = {
  primary: "bg-gold text-[#1a160e] hover:bg-gold-deep hover:text-white border-transparent font-semibold",
  secondary: "bg-surface text-ink border-line hover:bg-surface-2",
  ghost: "bg-transparent text-ink border-transparent hover:bg-surface-2",
  danger: "bg-transparent text-danger border-danger/40 hover:bg-danger-bg",
};
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl border px-4 min-h-11 text-[15px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  size?: "md" | "sm";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", loading, size = "md", className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(btnBase, variantClass[variant], size === "sm" && "min-h-9 px-3 text-sm", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  external,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: "md" | "sm";
  className?: string;
  children: ReactNode;
  external?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  const cls = cx(btnBase, variantClass[variant], size === "sm" && "min-h-9 px-3 text-sm", className);
  if (external)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...rest}>
        {children}
      </a>
    );
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Formulários                                                         */
/* ------------------------------------------------------------------ */

/** Se quem usa passar uma largura (w-…), ela substitui o w-full padrão */
const sized = (base: string, className?: string) => (/(^|\s)w-/.test(className ?? "") ? base.replace("w-full ", "") : base);

const inputBase =
  "w-full rounded-xl border bg-surface px-3.5 min-h-11 text-[15px] text-ink placeholder:text-muted/70 border-line focus:border-ink focus:outline-none aria-[invalid=true]:border-danger";

export function FormField({
  label,
  hint,
  error,
  optional,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {optional && <span className="font-normal text-muted"> (opcional)</span>}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-danger" role="alert">
          <AlertTriangle className="size-4 shrink-0" aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(sized(inputBase, className), className)} {...rest} />;
});

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(sized(inputBase, className), "py-2.5 min-h-24", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(sized(inputBase, className), "appearance-auto pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

/** Grupo de opções tipo "segmented control" */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  label: string;
  size?: "md" | "sm";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-lg px-3 text-sm transition-colors",
            size === "md" ? "min-h-9" : "min-h-8",
            value === o.value ? "bg-ink text-bg font-semibold" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Layout e estados                                                    */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6 flex flex-col gap-3">
      {back && (
        <Link href={back.href} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-2xl border border-line bg-surface p-4 sm:p-5", className)} {...rest}>
      {children}
    </div>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "gold" | "green" | "red" | "ink"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    gold: "bg-talvez-bg text-gold-ink",
    green: "bg-confirma-bg text-confirma",
    red: "bg-danger-bg text-danger",
    ink: "bg-ink text-bg",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Avatar({ name, size = 32, title }: { name: string; size?: number; title?: string }) {
  // cor estável por nome
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      title={title ?? name}
      className="inline-grid shrink-0 place-items-center rounded-full text-[11px] font-bold text-[#1a160e] ring-2 ring-surface"
      style={{ width: size, height: size, background: `hsl(${h} 70% 78%)`, fontSize: size * 0.36 }}
      aria-hidden={!title}
    >
      {initials(name)}
    </span>
  );
}

export function Spinner({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-surface-2", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-4xl" aria-hidden>{icon}</div>}
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="max-w-md text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-danger/40 bg-danger-bg p-5">
      <p className="flex items-start gap-2 font-semibold text-danger">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden /> {message}
      </p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          <RotateCw className="size-4" aria-hidden /> Tentar de novo
        </Button>
      )}
    </div>
  );
}

/** Ajuda contextual, recolhida por padrão (heurística 10) */
export function HelpTip({ title = "Como funciona?", children }: { title?: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-line bg-surface-2/60 px-4 py-2.5 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-muted hover:text-ink">
        <HelpCircle className="size-4" aria-hidden /> {title}
      </summary>
      <div className="mt-2 space-y-1.5 text-muted">{children}</div>
    </details>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink">{children}</kbd>
  );
}

/* ------------------------------------------------------------------ */
/* Diálogo                                                             */
/* ------------------------------------------------------------------ */

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      <div className="p-5">
        <h2 id={titleId} className="text-xl font-bold">
          {title}
        </h2>
        <div className="mt-3 text-muted">{children}</div>
      </div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = true,
  loading,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} autoFocus>
            Voltar
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Dialog>
  );
}

/** Aviso amarelo de "algo parou, e por quê" (heurísticas 1 e 9) */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-gold/50 bg-talvez-bg px-3.5 py-3 text-sm text-ink" role="status">
      <span aria-hidden className="mt-px">⚠️</span>
      <span>{children}</span>
    </div>
  );
}
