import { Link } from "react-router-dom";

export default function EmailConfirmed() {
  return (
    <div className="empty-state">
      <h1 className="page-title">Correo confirmado</h1>
      <p>Tu cuenta esta lista. Ya puedes iniciar sesion.</p>
      <Link to="/admin/login" className="btn btn-primary">
        Ir a iniciar sesion
      </Link>
    </div>
  );
}
