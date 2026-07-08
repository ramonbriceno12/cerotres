// Mirrors backend/src/utils/orderStatus.js VALID_TRANSITIONS - kept in sync manually.
export const VALID_NEXT_STATUSES = {
  pending: ["confirmed"],
  confirmed: ["in_kitchen"],
  in_kitchen: ["ready"],
  ready: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

export const STATUS_LABELS = {
  pending: "Pendiente",
  confirmed: "Confirmar",
  in_kitchen: "En preparacion",
  ready: "Preparado",
  out_for_delivery: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
