export type Screen =
  | { name: "catalog" }
  | { name: "product"; id: number }
  | { name: "editor"; id?: number };
