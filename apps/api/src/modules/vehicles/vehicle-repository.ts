export const MAX_VEHICLE_QUANTITY = 1_000_000;

export interface StoredVehicle {
  id: string;
  make: string;
  model: string;
  category: string;
  price: string;
  quantity: number;
}

export type NewVehicle = Omit<StoredVehicle, "id">;
export type VehicleDetails = Omit<NewVehicle, "quantity">;

export interface SearchQuery {
  make?: string;
  model?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: boolean;
  page: number;
  pageSize: number;
  sort: "newest" | "price_asc" | "price_desc";
}

export interface SearchResult {
  vehicles: StoredVehicle[];
  total: number;
}

export type PurchaseResult =
  | { status: "SUCCESS"; vehicle: StoredVehicle }
  | { status: "NOT_FOUND" }
  | { status: "OUT_OF_STOCK" };

export interface VehicleRepository {
  list(): Promise<StoredVehicle[]>;
  search(query: SearchQuery): Promise<SearchResult>;
  findById(id: string): Promise<StoredVehicle | null>;
  create(input: NewVehicle): Promise<StoredVehicle>;
  update(id: string, input: VehicleDetails): Promise<StoredVehicle | null>;
  delete(id: string): Promise<boolean>;
  purchase(id: string): Promise<PurchaseResult>;
  restock(id: string, quantity: number): Promise<StoredVehicle | null | "LIMIT_EXCEEDED">;
}
