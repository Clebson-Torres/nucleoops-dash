import { useEffect } from "react";

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal-card ${wide ? "modal-card-wide" : ""}`.trim()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-secondary" onClick={onClose} type="button">
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
