import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useCart } from "../../contexts/CartContext";
import { useCurrency } from "../../contexts/CurrencyContext";
import ProductBuilderModal from "../../components/ProductBuilderModal";

const CATEGORY_COLORS = ["#f5cbe4", "#f8d4c8", "#e8e4d4", "#f0d9c8", "#f5e6d0", "#edd5c8"];

function ProductCard({ product, onSelect }) {
  const { format } = useCurrency();

  return (
    <article className="menu-product">
      <button type="button" className="menu-product__hit" onClick={() => onSelect(product)}>
        <div className="menu-product__media">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} loading="lazy" />
          ) : (
            <div className="menu-product__placeholder" aria-hidden="true">
              <span>03</span>
            </div>
          )}
        </div>
        <div className="menu-product__body">
          <h3>{product.name}</h3>
          {product.description ? <p>{product.description}</p> : null}
          <div className="menu-product__foot">
            <span className="menu-product__price">
              Desde <strong>{format(product.base_price)}</strong>
            </span>
            <span className="menu-product__cta">Personalizar →</span>
          </div>
        </div>
      </button>
    </article>
  );
}

export default function Menu() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(null);
  const [carouselStart, setCarouselStart] = useState(0);
  const [heroQty, setHeroQty] = useState(1);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const { addItem } = useCart();
  const { format } = useCurrency();

  useEffect(() => {
    Promise.all([api.get("/categories", { auth: false }), api.get("/products?public=true", { auth: false })])
      .then(([cats, prods]) => {
        setCategories(cats.data);
        setProducts(prods.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const visible = activeCategory ? products.filter((p) => p.category_id === activeCategory) : products;
  const featured = products[featuredIndex] || products[0] || null;

  const categoryPills = useMemo(() => {
    return categories.map((cat, i) => {
      const inCat = products.filter((p) => p.category_id === cat.id);
      const thumb = inCat.find((p) => p.image_url)?.image_url;
      const cheapest = inCat.reduce((min, p) => (Number(p.base_price) < min ? Number(p.base_price) : min), Infinity);
      return {
        id: cat.id,
        name: cat.name,
        image: thumb,
        price: cheapest === Infinity ? 0 : cheapest,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      };
    });
  }, [categories, products]);

  const visiblePills = categoryPills.slice(carouselStart, carouselStart + 4);
  const heroTotal = featured ? Number(featured.base_price) * heroQty : 0;

  const scrollPills = (dir) => {
    if (categoryPills.length <= 4) return;
    setCarouselStart((s) => {
      const next = s + dir;
      if (next < 0) return Math.max(0, categoryPills.length - 4);
      if (next > categoryPills.length - 4) return 0;
      return next;
    });
  };

  const handleHeroBuy = () => {
    if (!featured) {
      document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setBuilding(featured);
  };

  return (
    <div className="foods-page">
      <section className="foods-hero">
        <div className="container foods-hero__grid">
          <div className="foods-hero__copy">
            <h1 className="foods-hero__title">
              Pide tus
              <br />
              <span>favoritos</span>
            </h1>
            <p className="foods-hero__desc">
              Pepitos venezolanos y hamburguesas desde nuestra dark kitchen. Elige, personaliza extras y recibe en minutos.
            </p>

            <div className="foods-hero__total">
              <span>Total pedido :</span>
              <strong>{featured ? format(heroTotal) : "—"}</strong>
            </div>

            <div className="foods-hero__actions">
              <div className="foods-qty-pill">
                <button type="button" onClick={() => setHeroQty((q) => Math.max(1, q - 1))} aria-label="Menos">
                  ‹
                </button>
                <span>{heroQty}</span>
                <button type="button" onClick={() => setHeroQty((q) => q + 1)} aria-label="Más">
                  ›
                </button>
              </div>

              <button type="button" className="foods-buy-btn" onClick={handleHeroBuy}>
                <span className="foods-buy-btn__icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                    <path d="M6 6h15l-1.5 9h-12z" />
                    <path d="M6 6l-1-2H2" />
                  </svg>
                </span>
                Pedir ahora
              </button>
            </div>
          </div>

          <div className="foods-hero__visual">
            <div className="foods-curve" aria-hidden="true" />

            <span className="foods-deco foods-deco--tomato" aria-hidden="true">🍅</span>
            <span className="foods-deco foods-deco--pepper" aria-hidden="true">🌶️</span>

            <div className="foods-dish">
              {featured?.image_url ? (
                <img src={featured.image_url} alt={featured.name} className="foods-dish__img" />
              ) : (
                <div className="foods-dish__placeholder">🍔</div>
              )}

              {featured && (
                <div className="foods-dish-card">
                  <div className="foods-dish-card__row">
                    <span className="foods-dish-card__name">{featured.name}</span>
                    <span className="foods-dish-card__rating">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z" />
                      </svg>
                      4.9
                    </span>
                  </div>
                  <div className="foods-dish-card__time">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                    15–25 min
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="foods-categories" aria-label="Categorías">
        <button type="button" className="foods-cat-nav" onClick={() => scrollPills(-1)} aria-label="Anterior">
          ‹
        </button>

        <div className="foods-cat-track">
          {visiblePills.length === 0 && !loading ? (
            categories.length === 0 ? (
              ["Pepitos", "Burgers", "Combos", "Bebidas"].map((name, i) => (
                <button key={name} type="button" className="foods-cat-pill" style={{ background: CATEGORY_COLORS[i] }} onClick={() => document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" })}>
                  <div className="foods-cat-pill__img">
                    <span>{name[0]}</span>
                  </div>
                  <span className="foods-cat-pill__name">{name}</span>
                  <span className="foods-cat-pill__price">—</span>
                </button>
              ))
            ) : null
          ) : (
            visiblePills.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`foods-cat-pill ${activeCategory === cat.id ? "is-active" : ""}`}
                style={{ background: cat.color }}
                onClick={() => {
                  setActiveCategory(cat.id);
                  document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <div className="foods-cat-pill__img">
                  {cat.image ? <img src={cat.image} alt="" /> : <span>{cat.name[0]}</span>}
                </div>
                <span className="foods-cat-pill__name">{cat.name}</span>
                <span className="foods-cat-pill__price">{cat.price > 0 ? format(cat.price) : "—"}</span>
              </button>
            ))
          )}
        </div>

        <button type="button" className="foods-cat-nav" onClick={() => scrollPills(1)} aria-label="Siguiente">
          ›
        </button>
      </section>

      <section id="menu" className="menu-section">
        <div className="container">
          <header className="menu-section__head">
            <div>
              <p className="menu-section__eyebrow">Menú completo</p>
              <h2>Todos los platos</h2>
            </div>
          </header>

          <div className="menu-filters" aria-label="Filtrar por categoría">
            <button type="button" className={`menu-filter ${!activeCategory ? "is-active" : ""}`} onClick={() => setActiveCategory(null)}>
              Todos
            </button>
            {categories.map((c) => (
              <button key={c.id} type="button" className={`menu-filter ${activeCategory === c.id ? "is-active" : ""}`} onClick={() => setActiveCategory(c.id)}>
                {c.name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="menu-skeleton">
              {[1, 2, 3].map((n) => (
                <div key={n} className="menu-skeleton__card" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="menu-empty">
              <p>No hay productos en esta categoría todavía.</p>
              <p className="menu-empty__hint">Agrega productos desde el panel administrativo.</p>
            </div>
          ) : (
            <div className="menu-grid">
              {visible.map((p) => (
                <div key={p.id} onMouseEnter={() => setFeaturedIndex(products.indexOf(p))}>
                  <ProductCard product={p} onSelect={setBuilding} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="foods-footer">
        <span>03/cerotres</span>
        <a href="https://instagram.com/03__cerotres" target="_blank" rel="noreferrer">
          @03__cerotres
        </a>
        <Link to="/admin/login">Admin</Link>
      </footer>

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
