import { useCallback, useEffect, useRef, useState } from "react";
import { Caption } from "@telegram-apps/telegram-ui";
import type { PwCard } from "../types";
import { getPrintables } from "../api";
import { openExternalLink, hapticSelect } from "../telegram";

/**
 * Динамическая витрина Printables: карточки моделей подгружаются
 * при доскролле (offset-пагинация), в БД ничего не сохраняется.
 */
export default function PrintablesFeed() {
  const [items, setItems] = useState<PwCard[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const offsetRef = useRef(0);
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (busyRef.current || doneRef.current) return;
    busyRef.current = true;
    setStatus("loading");
    try {
      const page = await getPrintables(offsetRef.current, 12);
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.items.filter((p) => !seen.has(p.id))];
      });
      offsetRef.current = page.nextOffset;
      if (!page.items.length) {
        doneRef.current = true;
        setStatus("done");
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("error");
    } finally {
      busyRef.current = false;
    }
  }, []);

  // первая порция
  useEffect(() => {
    void loadMore();
  }, [loadMore]);

  // бесконечный скролл: observer живёт всё время и срабатывает
  // только при пересечении сентинела (т.е. новом скролле) — без самозапуска
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore();
      },
      { rootMargin: "500px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const open = (card: PwCard) => {
    hapticSelect();
    openExternalLink(card.url);
  };

  return (
    <section className="pw">
      <div className="pw__head">
        <h2 className="pw__title">🔥 Свежие модели</h2>
        <Caption className="pw__sub">
          витрина сообщества Printables — листай вниз, подгрузится ещё
        </Caption>
      </div>

      {items.length > 0 && (
        <div className="pw__grid">
          {items.map((card) => (
            <button
              key={card.id}
              className="pw__card"
              onClick={() => open(card)}
              aria-label={card.name}
            >
              {card.cover ? (
                <img src={card.cover} alt="" loading="lazy" className="pw__img" />
              ) : (
                <span className="pw__img pw__img--ph">🖨️</span>
              )}
              <span className="pw__badge">From Printables</span>
              <span className="pw__name">{card.name}</span>
              <span className="pw__meta">
                <span>❤️ {card.likes}</span>
                <span>⬇️ {card.downloads}</span>
                {card.author && <span className="pw__author">{card.author}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="pw__sentinel">
        {status === "loading" && <span className="pw__status">⏳ Загружаем модели…</span>}
        {status === "error" && (
          <>
            <span className="pw__status">😵 Printables не отвечает</span>
            <button className="pw__retry" onClick={() => void loadMore()}>
              Повторить
            </button>
          </>
        )}
        {status === "done" && items.length > 0 && <span className="pw__status">That's all for now ✅</span>}
      </div>
    </section>
  );
}
