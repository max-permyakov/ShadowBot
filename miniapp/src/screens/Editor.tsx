import { useRef, useState } from "react";
import {
  Button,
  Input,
  Section,
  Subheadline,
  Textarea,
} from "@telegram-apps/telegram-ui";
import type { MediaItem, Product } from "../types";
import { SECTIONS, sectionOf } from "../types";
import type { Section as SectionId } from "../types";
import { uploadMedia } from "../api";
import { hapticImpact, hapticNotify, hapticSelect } from "../telegram";
import { MediaCell } from "../components/MediaCell";
import { inTelegram } from "../telegram";

type Draft = {
  title: string;
  section: SectionId;
  category: string;
  price: string;
  short_desc: string;
  description: string;
  media: MediaItem[];
};

export default function Editor({
  product,
  defaultSection,
  onSave,
  onCancel,
}: {
  product: Product | null;
  defaultSection?: SectionId;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const firstSection = (product?.section ?? defaultSection ?? "print") as SectionId;
  const [draft, setDraft] = useState<Draft>(
    product
      ? {
          title: product.title,
          section: (product.section ?? "print") as SectionId,
          category: product.category || sectionOf(firstSection).categories[0],
          price: product.price,
          short_desc: product.short_desc,
          description: product.description,
          media: [...product.media],
        }
      : {
          title: "",
          section: firstSection,
          category: sectionOf(firstSection).categories[0],
          price: "",
          short_desc: "",
          description: "",
          media: [],
        },
  );
  const [uploading, setUploading] = useState(0);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const pickSection = (id: SectionId) => {
    if (id === draft.section) return;
    const cats = sectionOf(id).categories;
    setDraft((d) => ({
      ...d,
      section: id,
      category: cats.includes(d.category) ? d.category : cats[0],
    }));
    hapticSelect();
  };

  const pickFiles = () => fileRef.current?.click();

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading((n) => n + files.length);
    try {
      for (const file of Array.from(files)) {
        try {
          const item = await uploadMedia(file);
          setDraft((d) => ({ ...d, media: [...d.media, item] }));
        } catch (err) {
          hapticNotify("error");
          alert(`Не удалось загрузить файл: ${(err as Error).message}`);
        } finally {
          setUploading((n) => n - 1);
        }
      }
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeMedia = (index: number) => {
    setDraft((d) => ({
      ...d,
      media: d.media.filter((_, i) => i !== index),
    }));
    hapticImpact();
  };

  const submit = async () => {
    if (!draft.title.trim()) {
      setTitleError(true);
      hapticNotify("warning");
      return;
    }
    setSaving(true);
    try {
      onSave({
        title: draft.title.trim(),
        section: draft.section,
        category: draft.category,
        price: draft.price.trim(),
        short_desc: draft.short_desc.trim(),
        description: draft.description.trim(),
        media: draft.media,
      });
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || uploading > 0;

  return (
    <div className="screen screen--editor">
      <Subheadline weight="2" className="editor__title">
        {product ? "✏️ Редактирование" : draft.section === "soft" ? "💻 Новый проект" : "✨ Новая карточка"}
      </Subheadline>
      {!inTelegram() && (
        <button className="web-back" onClick={onCancel}>
          ← Назад в каталог
        </button>
      )}

      <Section header="Главное">
        <Input
          className="editor__input"
          header="Название"
          placeholder="Например: Дракончик-ночник"
          value={draft.title}
          maxLength={64}
          onChange={(e) => {
            set("title", e.target.value);
            setTitleError(false);
          }}
        />
        {titleError && (
          <p className="editor__error">Придумай название — без него никак 😉</p>
        )}

        <label className="editor__field">
          <span className="editor__label">Раздел</span>
          <div className="editor__sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`seg__btn seg__btn--editor ${s.id === draft.section ? "seg__btn--on" : ""}`}
                onClick={() => pickSection(s.id)}
              >
                <span className="seg__emoji">{s.emoji}</span> {s.label}
              </button>
            ))}
          </div>
        </label>

        <label className="editor__field">
          <span className="editor__label">Категория</span>
          <select
            className="editor__select"
            value={draft.category}
            onChange={(e) => set("category", e.target.value)}
          >
            {sectionOf(draft.section).categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <Input
          className="editor__input"
          header={draft.section === "soft" ? "Стоимость работы" : "Примерная цена"}
          placeholder={
            draft.section === "soft" ? "например: от 3 000 ₽" : "например: от 350 ₽"
          }
          value={draft.price}
          maxLength={32}
          onChange={(e) => set("price", e.target.value)}
        />
      </Section>

      <Section header="Описание">
        <Textarea
          className="editor__textarea"
          header="Коротко (для карточки)"
          placeholder="Одно-два предложения о товаре"
          value={draft.short_desc}
          maxLength={140}
          rows={2}
          onChange={(e) => set("short_desc", e.target.value)}
        />
        <Textarea
          className="editor__textarea"
          header="Полное описание"
          placeholder="Что это, из какого пластика, размеры, особенности…"
          value={draft.description}
          maxLength={4000}
          rows={6}
          onChange={(e) => set("description", e.target.value)}
        />
      </Section>

      <Section header={`Фото и видео (${draft.media.length})`}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => void onFiles(e.target.files)}
        />
        <div className="editor__media">
          {draft.media.map((item, i) => (
            <div className="editor__thumb" key={i} onClick={() => removeMedia(i)}>
              <MediaCell media={item} className="editor__thumb-img" />
              <span className="editor__thumb-remove" title="Убрать">
                ×
              </span>
              {item.type === "video" && (
                <span className="editor__thumb-tag">видео</span>
              )}
            </div>
          ))}
          {uploading > 0 && (
            <div className="editor__thumb editor__thumb--upload">
              <span className="editor__thumb-spin">⏳</span>
            </div>
          )}
          <button
            className="editor__add"
            onClick={pickFiles}
            disabled={uploading > 0}
            type="button"
          >
            ＋<br />
            добавить
          </button>
        </div>
        <p className="editor__media-hint">
          Нажми на файл, чтобы убрать его из карточки. Первый элемент становится
          обложкой.
        </p>
      </Section>

      {/* Подвал редактора */}
      <div className="editor__footer">
        <Button
          size="l"
          stretched
          mode="filled"
          loading={busy}
          onClick={() => void submit()}
        >
          Сохранить
        </Button>
        <Button
          size="l"
          stretched
          mode="bezeled"
          onClick={onCancel}
          disabled={busy}
        >
          Отмена
        </Button>
      </div>
    </div>
  );
}
