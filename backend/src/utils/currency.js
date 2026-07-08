import { supabaseAdmin } from "../config/supabaseClient.js";

// rate = units of `currency` per 1 USD (e.g. VES rate 1000 means $1 = 1000 Bs).
export const fromUSD = (usdAmount, rate) => Number((Number(usdAmount) * Number(rate)).toFixed(2));
export const toUSD = (currencyAmount, rate) => Number((Number(currencyAmount) / Number(rate)).toFixed(2));

export async function getExchangeRate(currency) {
  if (currency === "USD") return 1;
  const { data, error } = await supabaseAdmin.from("exchange_rates").select("rate").eq("currency", currency).maybeSingle();
  if (error || !data) throw new Error(`No hay tasa de cambio configurada para ${currency}`);
  return Number(data.rate);
}

export async function getAllExchangeRates() {
  const { data, error } = await supabaseAdmin.from("exchange_rates").select("*").order("currency", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}
