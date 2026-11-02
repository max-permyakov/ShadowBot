export type Screen =
  | { name: "catalog" }
  | { name: "product"; id: number }
  | { name: "editor"; id?: number; section?: import("./types").Section }
  | { name: "about" }
  | { name: "about-editor" };
