export type Role = "admin" | "distributor" | "dealer" | "sales";
export type Audience = "all" | "distributor" | "dealer";
export type OrderStatus = "placed" | "confirmed" | "dispatched" | "delivered" | "cancelled";

export type User = {
  id: number;
  role: Role;
  email: string;
  name: string;
  organisation: string;
  phone: string;
  address: string;
  state_id: number | null;
  state: string | null;
  distributor_id: number | null;
  distributor: string | null;
  sales_manager_id: number | null;
  sales_manager: string | null;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
  last_login_at: string | null;
};

export type StateRef = { id: number; name: string };
export type State = StateRef & { code: string | null; active?: boolean; product_count?: number; user_count?: number };

// Partners receive `price` and `price_label` for their own role only; admins receive both prices.
export type Product = {
  id: number;
  name: string;
  code: string;
  category: string;
  description: string;
  pack_size: string;
  has_image: boolean;
  states: StateRef[];
  updated_at: string;
  price?: number;
  price_label?: string;
  distributor_price?: number;
  dealer_price?: number;
  active?: boolean;
};

export type Material = {
  id: number;
  title: string;
  description: string;
  audience: Audience;
  product_id: number | null;
  product: string | null;
  file_name: string;
  file_mime: string;
  file_size: number;
  created_at: string;
};

export type Scheme = {
  id: number;
  title: string;
  description: string;
  audience: Audience;
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
  status: "current" | "upcoming" | "expired";
  created_at: string;
};

export type OrderItem = { id: number; product_id: number | null; product_name: string; product_code: string; quantity: number; unit_price: number; line_total: number };

export type Order = {
  id: number;
  distributor_id: number;
  distributor: string;
  distributor_organisation: string;
  state: string | null;
  status: OrderStatus;
  notes: string;
  total: number;
  created_at: string;
  updated_at: string;
  item_count: number;
  items?: OrderItem[];
};

export type Contact = { id: number; name: string; organisation: string; email: string; phone: string; address: string; state: string | null; open_orders?: number; orders?: number };

export type MonthTotal = { month: string; orders: number; value: number };

export type Dashboard = {
  counts: Record<string, number>;
  recent_orders?: Order[];
  order_value?: number;
  region_filter?: "on" | "off";
  // Present for every role that has orders; dealers have none.
  insights?: { status: Record<OrderStatus, number>; monthly: MonthTotal[] };
};
