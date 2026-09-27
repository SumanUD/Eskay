export type Role = "admin" | "distributor" | "dealer" | "sales";
export type Audience = "all" | "distributor" | "dealer";

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
  has_avatar: boolean;
  dealer_count: number;
  created_at: string;
  last_login_at: string | null;
};

export type StateRef = { id: number; name: string };
export type State = StateRef & { code: string | null; active?: boolean; product_count?: number; user_count?: number };

// Partners receive `price` and `price_label` for their own role only; admins receive both role
// prices and the images' file ids. MRP and the retail counter price are the same for everyone.
export type Product = {
  id: number;
  name: string;
  code: string;
  brand: string;
  category: string;
  description: string;
  pack_size: string;
  mrp: number | null;
  retail_price: number | null;
  images: number[];
  has_image: boolean;
  states: StateRef[];
  updated_at: string;
  price?: number;
  price_label?: string;
  distributor_price?: number;
  dealer_price?: number;
  image_file_ids?: number[];
  active?: boolean;
};

export type Recipient = { id: number; name: string; role: Role };

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
  recipient_count?: number;
  recipients?: Recipient[];
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

export type Contact = { id: number; name: string; organisation: string; email: string; phone: string; address: string; state: string | null; has_avatar: boolean; dealer_count?: number };

export type NetworkRow = { id: number; name: string; distributors: number; dealers: number };

export type Dashboard = {
  counts: Record<string, number>;
  region_filter?: "on" | "off";
  network?: NetworkRow[];
  recent_partners?: User[];
  dealers?: Contact[];
  distributors?: Contact[];
  distributor?: Contact | null;
  recent_materials?: Material[];
};
