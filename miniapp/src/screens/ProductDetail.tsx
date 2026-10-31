import { useMemo, useState } from "react";
import {
  Button,
  Caption,
  Input,
  Section,
  Subheadline,
  Text,
  Title,
} from "@telegram-apps/telegram-ui";
import type { Product } from "../types";
import {
  buildOrderText,
  orderLink,
} from "../api";
import {
  hapticImpact,
  hapticNotify,
  hapticSelect,
  openTelegramLink,
} from "../telegram";
import { MediaCell } from "../components/MediaCell";
import { inTelegram } from "../telegram";

const MAX_QTY = 99;

export default function ProductDetail({
  product,
  owner,
  isAdmin,
  onBack,
  onOrderDone,
  onEdit,
  onDelete,
}: {
  product: Product;
  owner: string;
  isAdmin: boolean;
  onBack: () => void;
  onOrderDone: (title: string) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const [qty, setQty] = useState(1);
  const [comment, setComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Трек активного слайда карусели
  const [slide, setSlide] = useState(0);
  const onCarouselScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const width = e.currentTarget.clientWidth || 1;
    setSlide(Math.round(e.currentTarget.scrollLeft / width));
  };

  const orderText = useMemo(
    () => buildOrderText(product.title, qty, comment),
    [product.title, qty, comment],
  );

  const order = () => {
    if (!owner) return;
    hapticImpact();
    openTelegramLink(orderLink(owner, orderText));
    hapticNotify("success");
    onOrderDone(product.title);
  };

  const changeQty = (delta: number) => {
    setQty((q) => Math.min(MAX_QTY, Math.max(1, q + delta)));
    hapticSelect();
  };

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      hapticNotify("warning");
      window.setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    hapticNotify("error");
    onDelete(product.id);
  };

  return (
    <div className="screen screen--detail">
      {!inTelegram() && (
        <button className="web-back" onClick={onBack}>
          ← Назад в каталог
        </button>
      )}

      {/* Медиа-карусель */}
      <div className="carousel" onScroll={onCarouselScroll}>
        {product.media.length ? (
          product.media.map((m, i) => (
            <div className="carousel__slide" key={i}>
              <MediaCell media={m} className="carousel__cell" />
            </div>
          ))
        ) : (
          <div className="carousel__slide">
            <MediaCell media={null} className="carousel__cell" />
          </div>
        )}
        {product.media.length > 1 && (
          <div className="carousel__dots">
            {product.media.map((_, i) => (
              <i
                key={i}
                className={`carousel__dot ${i === slide ? "carousel__dot--on" : ""}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Инфо о товаре */}
      <div className="detail">
        {product.category && <span className="chip chip--on">{product.category}</span>}

        <Title level="1" weight="2" className="detail__title">
          {product.title}
        </Title>

        <div className="detail__price-row">
          <Subheadline weight="2" className="detail__price">
            {product.price || "Цена уточняется в чате"}
          </Subheadline>
          <Caption className="detail__price-hint">примерная цена</Caption>
        </div>

        <Text className="detail__desc">{product.description}</Text>

        {/* Оформление заказа */}
        <Section header="Оформление заказа" className="order">
          <div className="order__row">
            <span className="order__label">Количество</span>
            <div className="stepper">
              <button
                className="stepper__btn"
                onClick={() => changeQty(-1)}
                disabled={qty <= 1}
                aria-label="Меньше"
              >
                −
              </button>
              <span className="stepper__val">{qty}</span>
              <button
                className="stepper__btn"
                onClick={() => changeQty(1)}
                disabled={qty >= MAX_QTY}
                aria-label="Больше"
              >
                ＋
              </button>
            </div>
          </div>
          <Input
            className="order__comment"
            placeholder="Комментарий (цвет, размер…) — необязательно"
            value={comment}
            maxLength={120}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="order__preview">
            <span className="order__preview-label">Отправится мастеру:</span>
            <pre className="order__preview-text">{orderText}</pre>
          </div>
          <Button
            size="l"
            stretched
            mode="filled"
            className="order__btn"
            disabled={!owner}
            onClick={order}
          >
            🚀 Заказать
          </Button>
          {!owner && (
            <Caption className="order__hint">
              Адрес мастера пока не настроен — сообщи об этом админу
            </Caption>
          )}
        </Section>

        {/* Админ-действия */}
        {isAdmin && (
          <div className="admin-row">
            <Button
              size="m"
              stretched
              mode="outline"
              className="admin-row__edit"
              onClick={() => onEdit(product.id)}
            >
              ✏️ Редактировать
            </Button>
            <Button
              size="m"
              stretched
              mode="gray"
              className={confirmDelete ? "admin-row__del admin-row__del--sure" : "admin-row__del"}
              onClick={remove}
            >
              {confirmDelete ? "Точно удалить?" : "🗑️ Удалить"}
            </Button>
          </div>
        )}
      </div>

    </div>
  );
}
