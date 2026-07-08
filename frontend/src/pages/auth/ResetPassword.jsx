import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

// Reached via the Resend password-reset email. Supabase's client detects the
// recovery session from the URL automatically (detectSessionInUrl default),
// so this page just needs to collect the new password.
export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("La contrasena debe tener al menos 8 caracteres");
    if (password !== confirm) return setError("Las contrasenas no coinciden");

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) return setError(updateError.message);
    setDone(true);
    setTimeout(() => navigate("/admin"), 1500);
  };

  return (
    <div style={{ maxWidth: 380, margin: "60px auto" }}>
      <h1 className="page-title">Restablecer contrasena</h1>
      {done ? (
        <p>Contrasena actualizada. Redirigiendo...</p>
      ) : (
        <form className="card" onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">Nueva contrasena</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Confirmar contrasena</label>
            <input className="input" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Guardando..." : "Guardar nueva contrasena"}
          </button>
        </form>
      )}
    </div>
  );
}
