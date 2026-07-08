import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useCart } from "../../contexts/CartContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import ProductBuilderModal from "../../components/ProductBuilderModal";

function ProductCard({ product, onSelect }) {
  const { format } = useCurrency();
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {product.image_url && (
        <img src={product.image_url} alt={product.name} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 8 }} />
      )}
      <div>
        <h3 style={{ margin: "0 0 4px" }}>{product.name}</h3>
        {product.description && <p style={{ margin: 0, color: "var(--gray)", fontSize: 13 }}>{product.description}</p>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Desde {format(product.base_price)}</strong>
        <button className="btn btn-primary btn-sm" onClick={() => onSelect(product)}>
          Elegir
        </button>
      </div>
    </div>
  );
}

export default function Menu() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(null);
  const { addItem } = useCart();

  useEffect(() => {
    Promise.all([api.get("/categories", { auth: false }), api.get("/products?public=true", { auth: false })])
      .then(([cats, prods]) => {
        setCategories(cats.data);
        setProducts(prods.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const visible = activeCategory ? products.filter((p) => p.category_id === activeCategory) : products;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 40, fontWeight: 900, margin: "0 0 4px", color: "var(--coral)" }}>FAST. FRESH.</h1>
        <h2 style={{ fontSize: 40, fontWeight: 900, margin: 0 }}>DELIVERED.</h2>
        <p style={{ color: "var(--gray)" }}>Pepitos venezolanos y hamburguesas, directo desde nuestra dark kitchen.</p>
      </div>

      <div className="toolbar">
        <button className={`btn ${!activeCategory ? "btn-primary" : "btn-outline"} btn-sm`} onClick={() => setActiveCategory(null)}>
          Todos
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`btn ${activeCategory === c.id ? "btn-primary" : "btn-outline"} btn-sm`}
            onClick={() => setActiveCategory(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Cargando menu...</p>
      ) : visible.length === 0 ? (
        <p className="empty-state">No hay productos en esta categoria todavia.</p>
      ) : (
        <div className="grid grid-3">
          {visible.map((p) => (
            <ProductCard key={p.id} product={p} onSelect={setBuilding} />
          ))}
        </div>
      )}

      {building && (
        <ProductBuilderModal
          product={building}
          onClose={() => setBuilding(null)}
          onAdd={(options, quantity, notes) => {
            addItem(building, options, quantity, notes);
            setBuilding(null);
          }}
        />
      )}
    </div>
  );
}
