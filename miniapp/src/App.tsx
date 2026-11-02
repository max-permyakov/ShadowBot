import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@telegram-apps/telegram-ui";
import type { Product } from "./types";
import {
  createProduct,
  deleteProduct,
  getConfig,
  getProducts,
  updateAbout,
  updateProduct,
  whoAmI,
} from "./api";
import { hideBack, showBack } from "./telegram";
import type { Screen } from "./navigation";
import Catalog from "./screens/Catalog";
import ProductDetail from "./screens/ProductDetail";
import Editor from "./screens/Editor";
import About from "./screens/About";
import AboutEditor from "./screens/AboutEditor";
import Toast from "./components/Toast";
import { type ToastData } from "./components/ToastTypes";

type ProductDraft = Omit<Product, "id" | "created_at" | "updated_at">;

export function App() {  const [screen, setScreen] = useState<Screen>({ name: "catalog" });
  const [products, setProducts] = useState<Product[]>([]);
  const [owner, setOwner] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  // Первая загрузка: конфиг + каталог
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, list] = await Promise.all([getConfig(), getProducts()]);
        if (cancelled) return;
        setOwner(cfg.owner_username ?? "");
        setProducts(list);
      } catch (err) {
        if (!cancelled) {
          setLoadError((err as Error).message || "Ошибка загрузки");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Права админа (initData проверяет сервер)
  useEffect(() => {
    let cancelled = false;
    whoAmI()
      .then((me) => {
        if (!cancelled) setIsAdmin(me.is_admin);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Кнопка «назад» Telegram
  useEffect(() => {
    if (screen.name === "catalog") {
      hideBack();
      return;
    }
    const back: Partial<Record<Screen["name"], Screen>> = {
      product: { name: "catalog" },
      editor: { name: "catalog" },
      about: { name: "catalog" },
      "about-editor": { name: "about" },
    };
    showBack(() => setScreen(back[screen.name] ?? { name: "catalog" }));
    return () => {
      hideBack();
    };
  }, [screen]);

  const current = useMemo(() => {
    if (screen.name === "product" || screen.name === "editor") {
      return products.find((p) => p.id === screen.id) ?? null;
    }
    return null;
  }, [screen, products]);

  /* ---------- действия ---------- */

  const notify = (kind: ToastData["kind"], message: string) =>
    setToast({ id: Date.now(), kind, message });

  const handleOrderDone = (title: string) =>
    notify("success", `Чат открыт — отправь заказ «${title}» 🚀`);

  const handleSave = async (
    data: ProductDraft,
    id?: number,
  ): Promise<boolean> => {
    try {
      if (id) {
        const updated = await updateProduct(id, data);
        setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
        notify("success", "Карточка сохранена ✅");
      } else {
        const created = await createProduct(data);
        setProducts((prev) => [created, ...prev]);
        notify("success", "Карточка создана ✨");
      }
      setScreen({ name: "catalog" });
      return true;
    } catch (err) {
      notify("error", (err as Error).message);
      return false;
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      notify("success", "Карточка удалена 🗑️");
      setScreen({ name: "catalog" });
    } catch (err) {
      notify("error", (err as Error).message);
    }
  };

  const handleSaveAbout = async (data: import("./types").AboutData) => {
    try {
      await updateAbout(data);
      notify("success", "«О мне» сохранено ✅");
      setScreen({ name: "about" });
    } catch (err) {
      notify("error", (err as Error).message);
    }
  };

  /* ---------- рендер ---------- */

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div className="boot">
        <Spinner size="m" />
        <p className="boot__text">Загружаем магазин…</p>
      </div>
    );
  } else if (loadError) {
    body = (
      <div className="boot">
        <p className="boot__text">😕 {loadError}</p>
        <button className="boot__retry" onClick={() => window.location.reload()}>
          Попробовать снова
        </button>
      </div>
    );
  } else if (screen.name === "product" && current) {
    body = (
      <ProductDetail
        product={current}
        owner={owner}
        isAdmin={isAdmin}
        onBack={() => setScreen({ name: "catalog" })}
        onOrderDone={handleOrderDone}
        onEdit={(id) => setScreen({ name: "editor", id })}
        onDelete={(id) => void handleDelete(id)}
      />
    );
  } else if (screen.name === "editor") {
    body = (
      <Editor
        product={current}
        defaultSection={screen.section}
        onSave={(data) => void handleSave(data, screen.id)}
        onCancel={() => setScreen({ name: "catalog" })}
      />
    );
  } else if (screen.name === "about") {
    body = (
      <About
        isAdmin={isAdmin}
        onBack={() => setScreen({ name: "catalog" })}
        onEditAbout={() => setScreen({ name: "about-editor" })}
        notify={notify}
      />
    );
  } else if (screen.name === "about-editor") {
    body = (
      <AboutEditor
        onSave={(data) => void handleSaveAbout(data)}
        onCancel={() => setScreen({ name: "about" })}
      />
    );
  } else {
    body = (
      <Catalog
        products={products}
        isAdmin={isAdmin}
        onOpen={(id) => setScreen({ name: "product", id })}
        onCreate={(section) => setScreen({ name: "editor", section })}
        onOpenAbout={() => setScreen({ name: "about" })}
      />
    );
  }

  return (
    <div className="app-body">
      {body}
      {toast && <Toast toast={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
