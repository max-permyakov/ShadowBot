import { useEffect, useState } from "react";
import type { ToastData } from "./ToastTypes";

export default function Toast({
  toast,
  onDone,
}: {
  toast: ToastData;
  onDone: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const appear = window.setTimeout(() => setVisible(true), 15);
    const gone = window.setTimeout(onDone, 3400);
    return () => {
      window.clearTimeout(appear);
      window.clearTimeout(gone);
    };
  }, [toast, onDone]);

  return (
    <div className={`toast toast--${toast.kind} ${visible ? "toast--in" : ""}`}>
      {toast.message}
    </div>
  );
}
