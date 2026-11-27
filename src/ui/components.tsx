'use client';
/**
 * Shared UI pieces following design-system/MASTER.md: page shell, Button,
 * TextField, TopBar, PlayerRow and ConfirmSheet. Styles live in `globals.css`.
 */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

/** Chevron-left icon (1.8px-ish stroke, decorative). */
export function ChevronLeft() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/** Check icon (decorative). */
export function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

/** A centred single column, at least one viewport tall. `footer` holds the primary actions. */
export function PageShell({ children, footer, center = false }: { children: ReactNode; footer?: ReactNode; center?: boolean }) {
  return (
    <main className={center ? 'shell shell--center' : 'shell'}>
      {children}
      {footer ? (
        <>
          <div className="shell__spacer" />
          <div className="shell__footer">{footer}</div>
        </>
      ) : null}
    </main>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'surface' | 'ready' | 'danger';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  /** Shows `busyLabel` (if any), disables the button and blocks a second tap. */
  busy?: boolean;
  busyLabel?: string;
}

/** A real `<button>`. While `busy` it cannot be activated again. */
export function Button({ variant = 'primary', busy = false, busyLabel, children, type = 'button', disabled, onClick, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`btn btn--${variant}`}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={(event) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> {
  label: string;
  helper?: string;
  error?: string | null;
  /** Big centred room-code styling. */
  code?: boolean;
}

/** Label above the input, helper text and an error linked with `aria-describedby`. */
export function TextField({ label, helper, error, code = false, ...input }: TextFieldProps) {
  const id = useId();
  const helperId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, helper ? helperId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        {...input}
        id={id}
        className={code ? 'field__input field__input--code' : 'field__input'}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {helper ? (
        <p id={helperId} className="field__help">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Back button on the left (44px) and an optional label on the right. */
export function TopBar({ onBack, children }: { onBack?: () => void; children?: ReactNode }) {
  return (
    <div className="topbar">
      {onBack ? (
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <ChevronLeft />
        </button>
      ) : (
        <span />
      )}
      {children}
    </div>
  );
}

export interface PlayerRowProps {
  name: string;
  ready: boolean;
  isYou?: boolean;
  /** Smaller row without an avatar (host list). */
  compact?: boolean;
  /** Replaces the Ready / Not ready text (e.g. "Host"). */
  statusText?: string;
  /** Something after the status, e.g. a remove button. */
  action?: ReactNode;
}

/** One player: avatar with the initial, the name (plain text), and Ready / Not ready as text. */
export function PlayerRow({ name, ready, isYou = false, compact = false, statusText, action }: PlayerRowProps) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?';
  return (
    <li className={compact ? 'row row--compact' : 'row'}>
      {compact ? null : (
        <span className="row__avatar" aria-hidden="true">
          {initial}
        </span>
      )}
      <span className="row__name">
        {name}
        {isYou ? <span className="row__you"> (you)</span> : null}
      </span>
      <span className={ready ? 'row__status row__status--ready' : 'row__status'}>{statusText ?? (ready ? 'Ready' : 'Not ready')}</span>
      {action}
    </li>
  );
}

export interface ConfirmSheetProps {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Bottom-sheet confirmation: Escape and the backdrop cancel; focus moves in and returns. */
export function ConfirmSheet({ title, body, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmSheetProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus();
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = sheetRef.current?.querySelectorAll<HTMLElement>('button');
    if (!items || items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel} onKeyDown={onKeyDown}>
      <div ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grabber" aria-hidden="true" />
        <h2 id={titleId} className="title title--md">
          {title}
        </h2>
        {body ? <p className="lede">{body}</p> : null}
        <div className="sheet__actions">
          <button ref={cancelRef} type="button" className="btn btn--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn--primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
