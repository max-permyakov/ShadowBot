export interface ToastData {
  id: number;
  kind: "info" | "success" | "error";
  message: string;
}
