import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";

export default function Login() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  if (session) return <Navigate to="/admin" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await signIn(email, password);
      navigate("/admin");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email }, { auth: false });
      setForgotSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 380, margin: "80px auto" }}>
      <h1 className="page-title" style={{ textAlign: "center" }}>
        03/cerotres
      </h1>
      <p className="page-subtitle" style={{ textAlign: "center" }}>
        Acceso administrativo
      </p>

      {forgotMode ? (
        <form className="card" onSubmit={handleForgot}>
          {forgotSent ? (
            <p>Si el correo existe, enviamos un enlace para restablecer la contrasena.</p>
          ) : (
            <>
              <div className="field">
                <label className="label">Correo</label>
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
              <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
                {submitting ? "Enviando..." : "Enviar enlace"}
              </button>
            </>
          )}
          <button type="button" className="btn btn-outline btn-sm" style={{ width: "100%", marginTop: 10 }} onClick={() => setForgotMode(false)}>
            Volver a iniciar sesion
          </button>
        </form>
      ) : (
        <form className="card" onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">Correo</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Contrasena</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Ingresando..." : "Ingresar"}
          </button>
          <button type="button" className="btn btn-outline btn-sm" style={{ width: "100%", marginTop: 10 }} onClick={() => setForgotMode(true)}>
            Olvide mi contrasena
          </button>
        </form>
      )}
    </div>
  );
}
