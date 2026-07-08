import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [rates, setRates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = () => {
    api.get("/settings").then(({ data }) => setSettings(data));
    api.get("/exchange-rates").then(({ data }) => setRates(data));
  };

  useEffect(load, []);

  if (!settings) return <p>Cargando...</p>;

  const saveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    await api.patch("/settings", {
      business_name: settings.business_name,
      default_delivery_fee: Number(settings.default_delivery_fee),
      tax_rate: Number(settings.tax_rate),
      instagram_handle: settings.instagram_handle,
    });
    setSaving(false);
    setMessage("Guardado");
    setTimeout(() => setMessage(""), 2000);
  };

  const updateRate = async (currency, rate) => {
    await api.patch(`/exchange-rates/${currency}`, { rate: Number(rate) });
    load();
  };

  return (
    <div>
      <h1 className="page-title">Ajustes y tasas</h1>

      <div className="grid grid-2">
        <form className="card" onSubmit={saveSettings}>
          <h3 style={{ marginTop: 0 }}>Negocio</h3>
          <div className="field">
            <label className="label">Nombre del negocio</label>
            <input className="input" value={settings.business_name} onChange={(e) => setSettings({ ...settings, business_name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Delivery por defecto (USD)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              value={settings.default_delivery_fee}
              onChange={(e) => setSettings({ ...settings, default_delivery_fee: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label">Instagram</label>
            <input className="input" value={settings.instagram_handle || ""} onChange={(e) => setSettings({ ...settings, instagram_handle: e.target.value })} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
          {message && <span style={{ marginLeft: 10, color: "var(--success)" }}>{message}</span>}
        </form>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Tasas de cambio</h3>
          <p style={{ color: "var(--gray)", fontSize: 13 }}>Unidades de la moneda por 1 USD. Ej: si 1 USD = 1000 Bs, la tasa de VES es 1000.</p>
          {rates.map((r) => (
            <div key={r.currency} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <strong style={{ width: 60 }}>{r.currency}</strong>
              <input
                className="input"
                type="number"
                step="0.000001"
                disabled={r.currency === "USD"}
                defaultValue={r.rate}
                onBlur={(e) => e.target.value !== String(r.rate) && updateRate(r.currency, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
