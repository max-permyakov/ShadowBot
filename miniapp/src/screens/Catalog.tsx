import { useMemo, useState } from "react";
import { Button, LargeTitle, Placeholder, Caption } from "@telegram-apps/telegram-ui";
import type { Product } from "../types";
import { inTelegram, hapticSelect } from "../telegram";
import ProductCard from "../components/ProductCard";

export default function Catalog({
  products,
  isAdmin,
  onOpen,
  onCreate,
}: {
  products: Product[];
  isAdmin: boolean;
  onOpen: (id: number) => void;
  onCreate: () => void;
}) {
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.category) set.add(p.category);
    return ["Все", ...Array.from(set)];
  }, [products]);

  const [active, setActive] = useState("Все");
  const filtered =
    active === "Все" ? products : products.filter((p) => p.category === active);

  const pick = (cat: string) => {
    setActive(cat);
    hapticSelect();
  };

  return (
    <div className="screen">
      <header className="catalog__header">
        <div className="brand">
          <span className="brand__logo" aria-hidden>
            🤖
          </span>
          <div>
            <LargeTitle className="brand__title">
              ShadowBot
            </LargeTitle>
            <Caption className="brand__caption">магазин 3D-печати</Caption>
          </div>
          <div className="brand__spacer" />
          <div className="brand__actions">
            {isAdmin && (
              <Button
                size="l"
                mode="filled"
                className="fab"
                aria-label="Создать карточку"
                onClick={onCreate}
              >
                ＋
              </Button>
            )}
          </div>
        </div>

        {categories.length > 1 && (
          <div className="chips">
            {categories.map((cat) => (
              <button
                key={cat}
                className={`chip ${cat === active ? "chip--on" : ""}`}
                onClick={() => pick(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </header>

      {filtered.length === 0 ? (
        <div className="catalog__empty">
          <Placeholder
            header={products.length ? "В этой категории пусто" : "Пока пусто"}
            description={
              products.length
                ? "Загляни в другие таблички-категории 👀"
                : inTelegram()
                  ? "Товары появятся совсем скоро ✨"
                  : "Демо-режим в браузере без Telegram"
            }
          >
            <div className="catalog__empty-art">🖨️</div>
          </Placeholder>
        </div>
      ) : (
        <div className="catalog__grid">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
