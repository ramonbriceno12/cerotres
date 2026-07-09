export default function Modal({ title, onClose, children, width }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontWeight: 950, letterSpacing: "-0.01em" }}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
