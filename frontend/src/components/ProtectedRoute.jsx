import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ roles, children }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <div style={{ padding: 40 }}>Cargando...</div>;
  if (!session) return <Navigate to="/admin/login" replace />;
  if (roles && profile && !roles.includes(profile.role)) {
    return <div style={{ padding: 40 }}>No tienes permisos para ver esta seccion.</div>;
  }
  return children;
}
