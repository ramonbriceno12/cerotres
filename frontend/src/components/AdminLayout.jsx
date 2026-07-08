import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const NAV = [
  {
    section: "Operacion",
    links: [
      { to: "/admin", label: "Dashboard", end: true },
      { to: "/admin/ventas", label: "Ventas" },
      { to: "/admin/cocina", label: "Cocina" },
      { to: "/admin/clientes", label: "Clientes" },
    ],
  },
  {
    section: "Catalogo",
    links: [
      { to: "/admin/productos", label: "Productos" },
      { to: "/admin/opciones", label: "Opciones y extras" },
      { to: "/admin/recetas", label: "Recetas" },
      { to: "/admin/categorias", label: "Categorias" },
      { to: "/admin/unidades", label: "Unidades" },
    ],
  },
  {
    section: "Abastecimiento",
    links: [
      { to: "/admin/compras", label: "Compras" },
      { to: "/admin/proveedores", label: "Proveedores" },
      { to: "/admin/inventario", label: "Inventario" },
      { to: "/admin/ingredientes", label: "Ingredientes" },
    ],
  },
  {
    section: "Finanzas",
    links: [
      { to: "/admin/gastos", label: "Gastos" },
      { to: "/admin/cuentas", label: "Cuentas" },
      { to: "/admin/cash-flow", label: "Cash Flow" },
      { to: "/admin/cuentas-por-cobrar", label: "Cuentas por cobrar" },
      { to: "/admin/cuentas-por-pagar", label: "Cuentas por pagar" },
      { to: "/admin/reportes", label: "Reportes de ventas" },
      { to: "/admin/balance", label: "Balance" },
      { to: "/admin/perdidas-ganancias", label: "Perdidas y ganancias" },
    ],
  },
  {
    section: "Configuracion",
    links: [
      { to: "/admin/ajustes", label: "Ajustes y tasas" },
      { to: "/admin/personal", label: "Personal" },
    ],
  },
];

export default function AdminLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="logo">03/cerotres</div>
        <nav>
          {NAV.map((group) => (
            <div key={group.section}>
              <div className="section-title">{group.section}</div>
              {group.links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end}>
                  {l.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="admin-main">
        <div className="admin-topbar">
          <div />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 14 }}>
              {profile?.fullName} · <span className="badge">{profile?.role}</span>
            </span>
            <button className="btn btn-outline btn-sm" onClick={signOut}>
              Salir
            </button>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
