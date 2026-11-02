import { useEffect, useState } from "react";
import { Button, Subheadline, Textarea } from "@telegram-apps/telegram-ui";
import type { AboutData, AboutWork } from "../types";import { DEFAULT_ABOUT } from "../types";
import { getAbout } from "../api";
import { hapticImpact, hapticNotify } from "../telegram";
import { inTelegram } from "../telegram";

type WorksDraft = AboutWork[];

export default function AboutEditor({
  onSave,
  onCancel,
}: {
  onSave: (data: AboutData) => void;
  onCancel: () => void;
}) {
  const [intro, setIntro] = useState("");
  const [works, setWorks] = useState<WorksDraft>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAbout()
      .then((d) => {
        if (cancelled) return;
        if (d.intro || d.works.length) {
          setIntro(d.intro);
          setWorks(d.works);
        } else {
          setIntro(DEFAULT_ABOUT.intro);
          setWorks(DEFAULT_ABOUT.works);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setIntro(DEFAULT_ABOUT.intro);
        setWorks(DEFAULT_ABOUT.works);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setWork = (i: number, patch: Partial<AboutWork>) =>
    setWorks((prev) => prev.map((w, j) => (j === i ? { ...w, ...patch } : w)));

  const removeWork = (i: number) => {
    setWorks((prev) => prev.filter((_, j) => j !== i));
    hapticImpact();
  };

  const addWork = () => {
    setWorks((prev) => [...prev, { emoji: "📦", title: "", description: "", url: "" }]);
    hapticNotify("success");
  };

  const swap = (i: number, dir: -1 | 1) => {
    setWorks((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };

  const submit = () => {
    const introClean = intro.trim();
    if (!introClean) {
      hapticNotify("warning");
      alert("Расскажи хотя бы пару строк о себе — текст нужен 🙂");
      return;
    }
    const worksClean = works
      .map((w) => ({
        emoji: (w.emoji || "📦").trim().slice(0, 8),
        title: w.title.trim().slice(0, 64),
        description: w.description.trim().slice(0, 200),
        url: w.url.trim().slice(0, 300),
      }))
      .filter((w) => w.title && /^https:\/\//.test(w.url));
    if (works.length && worksClean.length !== works.length) {
      hapticNotify("warning");
      alert("У каждой работы: название и ссылка, начинающаяся с https://");
      return;
    }
    setSaving(true);
    try {
      onSave({ intro: introClean, works: worksClean });
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || loading;

  return (
    <div className="screen screen--editor">
      <Subheadline weight="2" className="editor__title">
        ✨ Редактирование «О мне»
      </Subheadline>
      {!inTelegram() && (
        <button className="web-back" onClick={onCancel}>
          ← Назад
        </button>
      )}

      <div className="tgui-Section about-editor__section">
        <Textarea
          className="editor__textarea"
          header="Приветствие (печатается как на терминале)"
          placeholder="Кто ты и чем занимаешься…"
          value={intro}
          maxLength={1200}
          rows={5}
          onChange={(e) => setIntro(e.target.value)}
        />
      </div>

      <div className="tgui-Section about-editor__section">
        <p className="about-editor__head">Работы с ссылками ({works.length})</p>
        {works.map((w, i) => (
          <div key={i} className="about-editor__work">
            <div className="about-editor__work-top">
              <input
                className="about-editor__emoji"
                value={w.emoji}
                maxLength={8}
                onChange={(e) => setWork(i, { emoji: e.target.value })}
              />
              <input
                className="about-editor__title"
                placeholder="Название"
                value={w.title}
                maxLength={64}
                onChange={(e) => setWork(i, { title: e.target.value })}
              />
              <button
                type="button"
                className="about-editor__move"
                onClick={() => swap(i, -1)}
                title="Выше"
              >
                ↑
              </button>
              <button
                type="button"
                className="about-editor__move"
                onClick={() => swap(i, 1)}
                title="Ниже"
              >
                ↓
              </button>
              <button
                type="button"
                className="about-editor__remove"
                onClick={() => removeWork(i)}
                title="Убрать"
              >
                ×
              </button>
            </div>
            <input
              className="about-editor__url"
              placeholder="https://ссылка-на-работу"
              value={w.url}
              maxLength={300}
              onChange={(e) => setWork(i, { url: e.target.value })}
            />
            <Textarea
              className="editor__textarea"
              placeholder="Пара слов о работе"
              value={w.description}
              maxLength={200}
              rows={2}
              onChange={(e) => setWork(i, { description: e.target.value })}
            />
          </div>
        ))}
        <Button size="m" mode="bezeled" stretched onClick={addWork} type="button">
          ＋ добавить работу
        </Button>
      </div>

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
