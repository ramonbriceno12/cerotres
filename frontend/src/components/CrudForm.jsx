import { useState } from "react";

export default function CrudForm({ fields, initial, onSubmit, submitLabel = "Guardar" }) {
  const [values, setValues] = useState(() => {
    const base = {};
    for (const f of fields) base[f.key] = initial?.[f.key] ?? f.default ?? (f.type === "checkbox" ? false : "");
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {};
      for (const f of fields) {
        let val = values[f.key];
        if (f.type === "number") val = val === "" ? null : Number(val);
        payload[f.key] = val;
      }
      await onSubmit(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {fields.map((f) => (
        <div className="field" key={f.key}>
          <label className="label">
            {f.label}
            {f.required ? " *" : ""}
          </label>
          {f.type === "select" ? (
            <select className="input" required={f.required} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
              <option value="">Seleccionar...</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              className="input"
              rows={3}
              required={f.required}
              value={values[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
            />
          ) : f.type === "checkbox" ? (
            <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
          ) : (
            <input
              className="input"
              type={f.type || "text"}
              step={f.step}
              required={f.required}
              value={values[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
      {error && (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>
      )}
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? "Guardando..." : submitLabel}
      </button>
    </form>
  );
}
