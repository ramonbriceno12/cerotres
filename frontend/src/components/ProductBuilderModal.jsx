import { useMemo, useState } from "react";
import Modal from "./Modal";
import { useCurrency } from "../contexts/CurrencyContext";

/**
 * Subway-style product builder: pick the product's option groups in order
 * (e.g. Tamano -> Extras -> Salsas), single or multi-select per group,
 * then add to the order with the computed price. Shared by the storefront
 * cart and the admin "Nuevo pedido" screen.
 */
export default function ProductBuilderModal({ product, onClose, onAdd, submitLabel = "Agregar" }) {
  const { format } = useCurrency();
  const [selections, setSelections] = useState({}); // groupId -> Set(itemId)
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const groups = product.option_groups || [];

  const toggle = (group, item) => {
    setSelections((prev) => {
      const current = new Set(prev[group.id] || []);
      if (group.selection_type === "single") {
        return { ...prev, [group.id]: new Set([item.id]) };
      }
      if (current.has(item.id)) {
        current.delete(item.id);
      } else {
        if (group.max_select && current.size >= group.max_select) return prev;
        current.add(item.id);
      }
      return { ...prev, [group.id]: current };
    });
  };

  const selectedFlat = useMemo(() => {
    const flat = [];
    for (const group of groups) {
      const ids = selections[group.id] || new Set();
      for (const item of group.items) {
        if (ids.has(item.id)) flat.push(item);
      }
    }
    return flat;
  }, [selections, groups]);

  const unitPrice = Number(product.base_price) + selectedFlat.reduce((sum, o) => sum + Number(o.price_modifier), 0);

  const handleAdd = () => {
    for (const group of groups) {
      const count = (selections[group.id] || new Set()).size;
      if (group.is_required && count === 0) {
        setError(`Elige una opcion de "${group.name}"`);
        return;
      }
      if (group.min_select && count < group.min_select) {
        setError(`Elige al menos ${group.min_select} opcion(es) de "${group.name}"`);
        return;
      }
    }
    onAdd(selectedFlat, quantity, notes);
  };

  return (
    <Modal title={product.name} onClose={onClose} width={480}>
      {product.description ? <p style={{ color: "var(--muted)", marginTop: -6, marginBottom: 14 }}>{product.description}</p> : null}

      {groups.map((group) => (
        <div key={group.id} className="field">
          <label className="label">
            {group.name} {group.is_required && "*"}
            {group.selection_type === "multiple" && group.max_select ? ` (máx. ${group.max_select})` : ""}
          </label>
          <div className="builder-options">
            {group.items.map((item) => {
              const checked = (selections[group.id] || new Set()).has(item.id);
              return (
                <label key={item.id} className={`builder-option ${checked ? "is-selected" : ""}`}>
                  <span className="builder-option__main">
                    <input
                      type={group.selection_type === "single" ? "radio" : "checkbox"}
                      name={group.id}
                      checked={checked}
                      onChange={() => toggle(group, item)}
                    />
                    {item.name}
                  </span>
                  {Number(item.price_modifier) !== 0 && (
                    <span className="builder-option__price">
                      {Number(item.price_modifier) > 0 ? "+" : ""}
                      {format(item.price_modifier)}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div className="field">
        <label className="label">Notas para este producto</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: sin cebolla" />
      </div>

      <div className="field" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label className="label" style={{ margin: 0 }}>
          Cantidad
        </label>
        <input
          className="input"
          type="number"
          min={1}
          style={{ width: 70 }}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
        />
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

      <button className="btn btn-primary" style={{ width: "100%" }} onClick={handleAdd}>
        {submitLabel} - {format(unitPrice * quantity)}
      </button>
    </Modal>
  );
}
