import { createContext, useContext, useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";

const CurrencyContext = createContext(null);

const SYMBOLS = { USD: "$", EUR: "€", VES: "Bs." };

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(localStorage.getItem("cerotres_currency") || "USD");
  const [rates, setRates] = useState([]);

  useEffect(() => {
    api
      .get("/exchange-rates", { auth: false })
      .then(({ data }) => setRates(data))
      .catch(() => setRates([]));
  }, []);

  useEffect(() => {
    localStorage.setItem("cerotres_currency", currency);
  }, [currency]);

  const rate = useMemo(() => {
    if (currency === "USD") return 1;
    return Number(rates.find((r) => r.currency === currency)?.rate || 1);
  }, [currency, rates]);

  const convert = (usdAmount) => Number((Number(usdAmount) * rate).toFixed(2));

  const format = (usdAmount) => {
    const value = convert(usdAmount);
    const symbol = SYMBOLS[currency] || "";
    return `${symbol} ${value.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rate, rates, convert, format, symbols: SYMBOLS }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
