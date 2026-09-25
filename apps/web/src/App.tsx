import { Route, Routes } from 'react-router-dom';
import { CartProvider } from './contexts/CartContext';
import { MenuPage } from './pages/MenuPage';
import { CartCheckoutPage } from './pages/CartCheckoutPage';
import { TrackOrderPage } from './pages/TrackOrderPage';
import { AccountPage } from './pages/AccountPage';

export function App() {
  return (
    <CartProvider>
      <Routes>
        <Route path="/" element={<MenuPage />} />
        <Route path="/pedido" element={<CartCheckoutPage />} />
        <Route path="/pedido/:code" element={<TrackOrderPage />} />
        <Route path="/seguimiento" element={<TrackOrderPage />} />
        <Route path="/cuenta" element={<AccountPage />} />
      </Routes>
    </CartProvider>
  );
}
