import { useMemo, useState } from "react";
import { Button, LargeTitle, Placeholder, Caption } from "@telegram-apps/telegram-ui";
import type { Product, Section } from "../types";
import { SECTIONS, sectionOf } from "../types";
import { inTelegram, hapticSelect } from "../telegram";
import ProductCard from "../components/ProductCard";
import PrintablesFeed from "../components/PrintablesFeed";

export default function Catalog({
  products,
  isAdmin,
  onOpen,
  onCreate,
  onOpenAbout,
}: {
  products: Product[];
  isAdmin: boolean;
  onOpen: (id: number) => void;
  onCreate: (section: Section) => void;
  onOpenAbout: () => void;
}) {
  // Разделы: экраны «принтер» и «код» + ссылка на «О мне»
  const [section, setSection] = useState<Section>("print");

  const visible = useMemo(
    () => products.filter((p) => (p.section ?? "print") === section),
    [products, section],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of visible) if (p.category) set.add(p.category);
    return ["Все", ...Array.from(set)];
  }, [visible]);

  const [active, setActive] = useState("Все");
  const filtered =
    active === "Все" ? visible : visible.filter((p) => p.category === active);

  const pickSection = (s: Section) => {
    setSection(s);
    setActive("Все");
    hapticSelect();
  };

  const pick = (cat: string) => {
    setActive(cat);
    hapticSelect();
  };

  return (
    <div className="screen">
      <header className="catalog__header">
        <div className="brand">
          <img className="brand__logo-img" src="logo.jpg" alt="" aria-hidden />
          <div>
            <LargeTitle className="brand__title">
              ShadowStore
            </LargeTitle>
            <Caption className="brand__caption">3D-печать и разработка</Caption>
          </div>
          <div className="brand__spacer" />
          <div className="brand__actions">
            {isAdmin && (
              <Button
                size="l"
                mode="filled"
                className="fab"
                aria-label="Создать карточку"
                onClick={() => onCreate(section)}
              >
                ＋
              </Button>
            )}
          </div>
        </div>

        {/* разделы */}
        <div className="seg">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`seg__btn ${s.id === section ? "seg__btn--on" : ""}`}
              onClick={() => pickSection(s.id)}
            >
              <span className="seg__emoji">{s.emoji}</span> {s.short}
            </button>
          ))}
          <button
            className="seg__btn seg__btn--about"
            onClick={() => {
              hapticSelect();
              onOpenAbout();
            }}
          >
            <span className="seg__emoji">✨</span> О мне
          </button>
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
            header={products.length ? "В этом разделе пусто" : "Пока пусто"}
            description={
              products.length
                ? sectionOf(section).id === "soft"
                  ? "Создай первую карточку разработки — кнопка ＋"
                  : "Загляни в другие таблички-категории 👀"
                : inTelegram()
                  ? "Товары появятся совсем скоро ✨"
                  : "Демо-режим в браузере без Telegram"
            }
          >
            <div className="catalog__empty-art">
              {section === "print" ? "🖨️" : "💻"}
            </div>
          </Placeholder>
        </div>
      ) : (
        <div className="catalog__grid">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} onOpen={onOpen} />
          ))}
        </div>
      )}

      {/* витрина Printables — только в разделе печати */}
      {section === "print" && <PrintablesFeed />}
    </div>
  );
}
