import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OrderStatus } from "@/lib/order-status";

export type OrderRow = {
  id: string;
  code: string;
  customer_id: string;
  equipment_type_id: string | null;
  reported_problem: string;
  technician_id: string | null;
  opened_at: string;
  scheduled_start: string | null;
  estimated_minutes: number;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  ponto_referencia: string | null;
  notes: string | null;
  status: OrderStatus;
  visit_billable: boolean;
  created_at: string;
  executed_at: string | null;
  completed_at: string | null;
  technician_reported_cents: number | null;
  technician_reported_at: string | null;
  technician_reported_by: string | null;
  technician_reported_name: string | null;
  financial_confirmed_at: string | null;
  technician_reported_parts: unknown;
  customers: { full_name: string; phone: string | null } | null;
  technicians: { full_name: string } | null;
  equipment_types: { name: string } | null;
};

const ORDER_SELECT =
  "id, code, customer_id, equipment_type_id, reported_problem, technician_id, opened_at, scheduled_start, estimated_minutes, endereco, numero, complemento, bairro, cidade, estado, cep, ponto_referencia, notes, status, visit_billable, created_at, executed_at, completed_at, technician_reported_cents, technician_reported_at, technician_reported_by, technician_reported_name, technician_reported_parts, financial_confirmed_at, customers(full_name, phone), technicians(full_name), equipment_types(name)";

export const ordersQuery = queryOptions({
  queryKey: ["service-orders"],
  queryFn: async (): Promise<OrderRow[]> => {
    const { data, error } = await supabase
      .from("service_orders")
      .select(ORDER_SELECT)
      .order("opened_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as OrderRow[];
  },
});

export type OrderEvent = {
  id: string;
  event_type: string;
  description: string;
  actor_name: string | null;
  created_at: string;
};

export type QuoteRow = {
  id: string;
  version: number;
  description: string;
  labor_cents: number;
  parts_total_cents: number;
  total_cents: number;
  status: string;
  notes: string | null;
  created_at: string;
  quote_parts: {
    id: string;
    description: string;
    quantity: number;
    unit_price_cents: number;
    total_cents: number;
  }[];
};

export const orderDetailQuery = (orderId: string) =>
  queryOptions({
    queryKey: ["service-order", orderId],
    queryFn: async () => {
      const [{ data: order, error: oErr }, { data: events }, { data: quotes }] = await Promise.all([
        supabase.from("service_orders").select(ORDER_SELECT).eq("id", orderId).single(),
        supabase
          .from("service_order_events")
          .select("id, event_type, description, actor_name, created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false }),
        supabase
          .from("quotes")
          .select("id, version, description, labor_cents, parts_total_cents, total_cents, status, notes, created_at, quote_parts(id, description, quantity, unit_price_cents, total_cents)")
          .eq("order_id", orderId)
          .order("version", { ascending: false }),
      ]);
      if (oErr) throw oErr;
      return {
        order: order as unknown as OrderRow,
        events: (events ?? []) as OrderEvent[],
        quotes: (quotes ?? []) as unknown as QuoteRow[],
      };
    },
  });

export type FinancialRow = {
  id: string;
  order_id: string;
  kind: "servico" | "visita";
  total_cents: number;
  labor_cents: number;
  parts_estimated_cents: number;
  rule_technician_percent: number | null;
  rule_company_percent: number | null;
  rule_technician_fixed_cents: number | null;
  rule_company_fixed_cents: number | null;
  technician_share_cents: number;
  company_share_cents: number;
  receiver_type: "maqnolar" | "tecnico" | "outro" | null;
  receiver_label: string | null;
  status: "previsto" | "parcial" | "realizado";
};

export type PurchaseRow = {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  buyer_type: "maqnolar" | "tecnico" | "outro";
  buyer_label: string | null;
  buyer_technician_id: string | null;
  purchased_at: string;
  notes: string | null;
  technicians: { full_name: string } | null;
};

export const orderFinancialsQuery = (orderId: string) =>
  queryOptions({
    queryKey: ["order-financials", orderId],
    queryFn: async () => {
      const [{ data: fin }, { data: purchases, error }] = await Promise.all([
        supabase.from("order_financials").select("*").eq("order_id", orderId).maybeSingle(),
        supabase
          .from("part_purchases")
          .select("id, description, quantity, unit_price_cents, total_cents, buyer_type, buyer_label, buyer_technician_id, purchased_at, notes, technicians(full_name)")
          .eq("order_id", orderId)
          .order("purchased_at", { ascending: false }),
      ]);
      if (error) throw error;
      return {
        financial: (fin ?? null) as FinancialRow | null,
        purchases: (purchases ?? []) as unknown as PurchaseRow[],
      };
    },
  });

export type CustomerOption = {
  id: string;
  full_name: string;
  phone: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  ponto_referencia: string | null;
};

export const customersQuery = queryOptions({
  queryKey: ["customers"],
  queryFn: async (): Promise<CustomerOption[]> => {
    const { data, error } = await supabase
      .from("customers")
      .select("id, full_name, phone, endereco, numero, complemento, bairro, cidade, estado, cep, ponto_referencia")
      .eq("active", true)
      .order("full_name");
    if (error) throw error;
    return data ?? [];
  },
});

export const techniciansQuery = queryOptions({
  queryKey: ["technicians"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("technicians")
      .select("id, full_name, active")
      .order("full_name");
    if (error) throw error;
    return data ?? [];
  },
});

export const equipmentTypesQuery = queryOptions({
  queryKey: ["equipment-types"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("equipment_types")
      .select("id, name")
      .eq("active", true)
      .order("name");
    if (error) throw error;
    return data ?? [];
  },
});
