import type { Product } from "../types";
import { MediaCell } from "./MediaCell";

export default function ProductCard({
  product,
  onOpen,
}: {
  product: Product;
  onOpen: (id: number) => void;
}) {
  return (
    <article className="card" onClick={() => onOpen(product.id)}>
      <div className="card__media">
        <MediaCell media={product.media[0] ?? null} className="card__img" />
        {product.media.length > 1 && (
          <span className="card__badge">1/{product.media.length}</span>
        )}
      </div>
      <div className="card__body">
        <h3 className="card__title">{product.title}</h3>
        <p className="card__short">{product.short_desc}</p>
        <div className="card__meta">
          <span className="card__price">{product.price || "цена в чате"}</span>
          {product.category && (
            <span className="card__cat">{product.category}</span>
          )}
        </div>
      </div>
    </article>
  );
}
