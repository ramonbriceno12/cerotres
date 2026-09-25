import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { ChannelsPage } from './pages/ChannelsPage';
import { CommissionReportsPage } from './pages/CommissionReportsPage';
import { DashboardPage } from './pages/DashboardPage';
import { FinanceReportsPage } from './pages/FinanceReportsPage';
import { IngredientsPage } from './pages/IngredientsPage';
import { KitchenPage } from './pages/KitchenPage';
import { LoginPage } from './pages/LoginPage';
import { ManualOrderPage } from './pages/ManualOrderPage';
import { PosPage } from './pages/PosPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { PlatformOrdersPage } from './pages/PlatformOrdersPage';
import { ProductsPage } from './pages/ProductsPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { RecipesPage } from './pages/RecipesPage';
import { SettlementsPage } from './pages/SettlementsPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { TextOrderPage } from './pages/TextOrderPage';
import { CashClosePage } from './pages/CashClosePage';
import { ExchangeRatePage } from './pages/ExchangeRatePage';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/new" element={<ManualOrderPage />} />
            <Route path="orders/text" element={<TextOrderPage />} />
            <Route path="pos" element={<PosPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="kitchen" element={<KitchenPage />} />
            <Route path="cash" element={<CashClosePage />} />
            <Route path="channels" element={<ChannelsPage />} />
            <Route path="channels/platform-orders" element={<PlatformOrdersPage />} />
            <Route path="channels/settlements" element={<SettlementsPage />} />
            <Route path="channels/reports" element={<CommissionReportsPage />} />
            <Route path="finance" element={<FinanceReportsPage />} />
            <Route path="finance/ingredients" element={<IngredientsPage />} />
            <Route path="finance/recipes" element={<RecipesPage />} />
            <Route path="finance/purchases" element={<PurchasesPage />} />
            <Route path="finance/suppliers" element={<SuppliersPage />} />
            <Route path="finance/exchange-rate" element={<ExchangeRatePage />} />
            <Route path="catalog/products" element={<ProductsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
