import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { LETTERS } from '../utils/format';

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Đang tải" />;
}

export function Loading({ text = 'Đang tải...' }) {
  return (
    <div className="center-page">
      <div className="row muted"><Spinner /> {text}</div>
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function BrandMark({ className = 'brand-mark' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0f5f58" />
      <circle cx="10" cy="11" r="4" fill="#fff" />
      <circle cx="22" cy="11" r="4" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="10" cy="22" r="4" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="22" cy="22" r="4" fill="#fff" />
    </svg>
  );
}

export function Bubble({ index, filled }) {
  return <span className={`bubble${filled ? ' filled' : ''}`}><span>{LETTERS[index]}</span></span>;
}

export function Modal({ title, onClose, children, footer, width }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={width ? { width: `min(${width}px, 100%)` } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Đóng">✕</button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Toast ----------
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);
  const push = useCallback((message, type = 'info', ttl = 4000) => {
    const id = ++idRef.current;
    setItems((xs) => [...xs.slice(-3), { id, message, type }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), ttl);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function Stat({ value, label, tone }) {
  return (
    <div className="card stat">
      <div className="stat-value" style={tone ? { color: tone } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
