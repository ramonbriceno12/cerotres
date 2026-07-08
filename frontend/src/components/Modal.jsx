export default function Modal({ title, onClose, children, width }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
