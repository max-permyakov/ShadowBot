import type { MediaItem, Product } from "../types";

/** Первое фото/видео для превью карточки. */
export function cover(item: Product | null): MediaItem | null {
  return item?.media[0] ?? null;
}

export function MediaCell({
  media,
  className,
}: {
  media: MediaItem | null;
  className?: string;
}) {
  if (!media) {
    return (
      <div className={`media-fallback ${className ?? ""}`} aria-hidden>
        🖨️
      </div>
    );
  }
  if (media.type === "video") {
    return (
      <video
        className={className ?? ""}
        src={media.url}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
      />
    );
  }
  return <img className={className ?? ""} src={media.url} alt="" loading="lazy" />;
}
