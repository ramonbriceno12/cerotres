import { Routes, Route } from "react-router-dom";
import StoreLayout from "./components/StoreLayout";
import AdminLayout from "./components/AdminLayout";
import ProtectedRoute from "./components/ProtectedRoute";

import Menu from "./pages/store/Menu";
import Cart from "./pages/store/Cart";
import Checkout from "./pages/store/Checkout";
import TrackOrder from "./pages/store/TrackOrder";

import EmailConfirmed from "./pages/auth/EmailConfirmed";
import ResetPassword from "./pages/auth/ResetPassword";

import Login from "./pages/admin/Login";
import Dashboard from "./pages/admin/Dashboard";
import OrdersList from "./pages/admin/sales/OrdersList";
import OrderDetail from "./pages/admin/sales/OrderDetail";
import NewOrder from "./pages/admin/sales/NewOrder";
import KitchenBoard from "./pages/admin/kitchen/KitchenBoard";
import CustomersPage from "./pages/admin/customers/CustomersPage";
import ProductsPage from "./pages/admin/products/ProductsPage";
import OptionGroupsPage from "./pages/admin/products/OptionGroupsPage";
import RecipesPage from "./pages/admin/products/RecipesPage";
import CategoriesPage from "./pages/admin/catalog/CategoriesPage";
import UnitsPage from "./pages/admin/catalog/UnitsPage";
import PurchasesPage from "./pages/admin/purchases/PurchasesPage";
import PurchaseDetail from "./pages/admin/purchases/PurchaseDetail";
import SuppliersPage from "./pages/admin/purchases/SuppliersPage";
import IngredientsPage from "./pages/admin/inventory/IngredientsPage";
import InventoryPage from "./pages/admin/inventory/InventoryPage";
import ExpensesPage from "./pages/admin/finance/ExpensesPage";
import CashFlowPage from "./pages/admin/finance/CashFlowPage";
import SalesReportPage from "./pages/admin/reports/SalesReportPage";
import BalancePage from "./pages/admin/reports/BalancePage";
import ProfitLossPage from "./pages/admin/reports/ProfitLossPage";
import ReceivablesPage from "./pages/admin/finance/ReceivablesPage";
import PayablesPage from "./pages/admin/finance/PayablesPage";
import AccountsPage from "./pages/admin/finance/AccountsPage";
import SettingsPage from "./pages/admin/settings/SettingsPage";
import StaffPage from "./pages/admin/settings/StaffPage";

export default function App() {
  return (
    <Routes>
      <Route element={<StoreLayout />}>
        <Route path="/" element={<Menu />} />
        <Route path="/carrito" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/pedido" element={<TrackOrder />} />
      </Route>

      <Route path="/correo-confirmado" element={<EmailConfirmed />} />
      <Route path="/restablecer-contrasena" element={<ResetPassword />} />
      <Route path="/admin/login" element={<Login />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="ventas" element={<OrdersList />} />
        <Route path="ventas/nuevo" element={<NewOrder />} />
        <Route path="ventas/:id" element={<OrderDetail />} />
        <Route path="cocina" element={<KitchenBoard />} />
        <Route path="clientes" element={<CustomersPage />} />
        <Route path="productos" element={<ProductsPage />} />
        <Route path="opciones" element={<OptionGroupsPage />} />
        <Route path="recetas" element={<RecipesPage />} />
        <Route path="categorias" element={<CategoriesPage />} />
        <Route path="unidades" element={<UnitsPage />} />
        <Route path="compras" element={<PurchasesPage />} />
        <Route path="compras/:id" element={<PurchaseDetail />} />
        <Route path="proveedores" element={<SuppliersPage />} />
        <Route path="ingredientes" element={<IngredientsPage />} />
        <Route path="inventario" element={<InventoryPage />} />
        <Route path="gastos" element={<ExpensesPage />} />
        <Route path="cash-flow" element={<CashFlowPage />} />
        <Route path="reportes" element={<SalesReportPage />} />
        <Route path="balance" element={<BalancePage />} />
        <Route path="perdidas-ganancias" element={<ProfitLossPage />} />
        <Route path="cuentas-por-cobrar" element={<ReceivablesPage />} />
        <Route path="cuentas-por-pagar" element={<PayablesPage />} />
        <Route path="cuentas" element={<AccountsPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="personal" element={<StaffPage />} />
      </Route>
    </Routes>
  );
}
