import { useEffect, useRef, useState } from "react";
import { Caption } from "@telegram-apps/telegram-ui";
import type { AboutData, AboutWork } from "../types";
import { DEFAULT_ABOUT, eggsFound } from "../types";
import { getAbout } from "../api";
import { hapticImpact, hapticNotify } from "../telegram";
import { openExternalLink } from "../telegram";
import { MatrixRain } from "../components/MatrixRain";

const OWNER_TG = "Massimo_16";

/* ---------- Печатающийся текст ---------- */
function useTyped(text: string, speed = 26) {
  const [len, setLen] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLen(text.length);
      return;
    }
    setLen(0);
    let i = 0;
    const timer = window.setInterval(() => {
      i++;
      setLen(i);
      if (i >= text.length) window.clearInterval(timer);
    }, speed);
    return () => window.clearInterval(timer);
  }, [text]);
  return { typed: text.slice(0, len), done: len >= text.length };
}

/* ---------- Терминал кто я, с выбором y/n ---------- */
type TermLine = { cls: "dim" | "ok" | "warn" | "cmd" | "accent"; text: string };
const Y_SEQ: TermLine[] = [
  { cls: "cmd", text: "> y" },
  { cls: "dim", text: "$ docker run massimo/dev-env … ok ✓" },
  { cls: "dim", text: "$ compiling ideas [██████░░░░]  62%" },
  { cls: "dim", text: "$ compiling ideas [██████████] 100% ✓" },
  { cls: "ok", text: "💡 Идеи готовы к реализации!" },
  { cls: "accent", text: "✨ Могу собрать твой проект: бот, сайт, мини-апп — или напечатать что угодно на 3D." },
];
const N_SEQ: TermLine[] = [
  { cls: "cmd", text: "> n" },
  { cls: "cmd", text: "> sudo rm -rf /" },
  { cls: "dim", text: "rm: удаляю /мусор в проектах… ⣾" },
  { cls: "dim", text: "rm: удаляю /баги… ⣾" },
  { cls: "warn", text: "rm: невозможно удалить /мамины-файлы ✋ (заблокировано)" },
  { cls: "warn", text: "rm: невозможно удалить /социалку-в-кармане ☠️ … на месте" },
  { cls: "ok", text: "💥 Готово! Удалены только баги — остальное цело 😅" },
];
// Пасхалка для внимательных: и после n-ветки можно заказать проект 🙂

const CITE_Y = "Прямо сейчас: напиши мне в ЛС — обсудим проект 👨‍💻";
const CITE_N = "…шучу! Ничего не удалено — только баги почистили 😉 И даже после rm -rf проект заказать можно:";

function Terminal({ intro }: { intro: string }) {
  const { typed, done } = useTyped(intro);
  const [ask, setAsk] = useState(false);
  const [seq, setSeq] = useState<TermLine[] | null>(null); // какая последовательность играет
  const [step, setStep] = useState(0); // показано строк
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setAsk(done), [done]);

  // выезд строк по частям
  useEffect(() => {
    if (!seq || step >= seq.length) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), seq[step].cls === "dim" ? 520 : 700);
    return () => window.clearTimeout(t);
  }, [seq, step]);

  // автоскролл к последней строке (окно фиксированной высоты)
  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [step, typed]);

  const choose = (y: boolean) => {
    if (seq) return; // в процессе — не позволяем менять решение
    setSeq(y ? Y_SEQ : N_SEQ);
    setStep(0);
    hapticImpact();
  };

  // клавиатура на десктопе
  useEffect(() => {
    if (!ask || seq) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "y") choose(true); else if (k === "n") choose(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, seq]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const finished = !!seq && step >= seq.length;
  const isY = seq === Y_SEQ;

  const reset = () => {
    setSeq(null);
    setStep(0);
    setAsk(true);
  };

  const lines = !seq ? [] : seq.slice(0, step);

  return (
    <div className="about__terminal">
      <div className="about__term-bar">
        <i className="about__term-dot" />
        <i className="about__term-dot" />
        <i className="about__term-dot" />
        <span className="about__term-name">root@shadowserver:~$ whoami</span>
      </div>
      <div className="about__term-body" ref={boxRef}>
        <p className="about__intro">
          {typed}
          <span className={`about__caret ${done ? "about__caret--idle" : ""}`} />
        </p>
        {ask && !seq && (
          <div className="about__ask">
            <span className="about__ask-q">заказать проект? [y/n]</span>
            <button className="about__yn" onClick={() => choose(true)}>y</button>
            <span className="about__yn-sep">/</span>
            <button className="about__yn" onClick={() => choose(false)}>n</button>
          </div>
        )}
        {lines.map((l, i) => (
          <p key={i} className={`about__line about__line--${l.cls}`}>{l.text}</p>
        ))}
        {finished && (
          <div className="about__finale">
            {isY ? CITE_Y : CITE_N}
            <a
              className="about__contact"
              href={`https://t.me/${OWNER_TG}`}
              onClick={(e) => {
                e.preventDefault();
                hapticNotify("success");
                openExternalLink(`https://t.me/${OWNER_TG}`);
              }}
            >
              💬 Написать в ЛС @{OWNER_TG}
            </a>
            <button className="about__replay" onClick={reset}>↺ сыграть ещё раз</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Экран «О мне» ---------- */
export default function About({
  isAdmin,
  onBack,
  onOpenWork,
  onEditAbout,
}: {
  isAdmin: boolean;
  onBack: () => void;
  onOpenWork: (work: AboutWork) => void;
  onEditAbout: () => void;
}) {
  const [data, setData] = useState<AboutData | null>(null);
  const [found] = useState<string[]>(() => eggsFound());

  useEffect(() => {
    let cancelled = false;
    getAbout()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(DEFAULT_ABOUT));
    return () => {
      cancelled = true;
    };
  }, []);

  // сколько всего пасхалок заложено в текущих данных
  const totalEggs = data
    ? new Set(data.works.map((w) => w.egg).filter(Boolean)).size
    : 5;

  if (!data) {
    return (
      <div className="screen about">
        <div className="about__loading">⏳ Загружаем…</div>
      </div>
    );
  }

  return (
    <div className="screen about">
      {/* фон: цифры */}
      <div className="about__bg" aria-hidden>
        <MatrixRain />
      </div>

      <div className="about__tools">
        <button className="about__back" onClick={onBack}>← В магазин</button>
        <span className="about__eggs-label">
          👾 {found.length}/{totalEggs}
        </span>
        {isAdmin && (
          <button className="about__back about__back--edit" onClick={onEditAbout}>✏️</button>
        )}
      </div>

      <div className="about__head">
        <img className="about__avatar" src="logo.jpg" alt="" />
        <div>
          <h2 className="about__name">Макс</h2>
          <Caption className="about__role">backend-разработчик · 3D-печатник · Инженер</Caption>
        </div>
      </div>

      <Terminal intro={data.intro} />

      {/* работы */}
      <h3 className="about__works-title">Работы и проекты</h3>
      <div className="about__works">
        {data.works.map((w, i) => (
          <button
            key={i}
            className="about__work"
            onClick={() => {
              hapticImpact();
              onOpenWork(w);
            }}
          >
            <span className="about__work-emoji">{w.emoji || "📦"}</span>
            <span className="about__work-body">
              <span className="about__work-title">
                {w.title}
                {w.egg && found.includes(w.egg) && <span title="пасхалка найдена"> ✦</span>}
              </span>
              <span className="about__work-desc">{w.description}</span>
            </span>
            <span className="about__work-arrow">→</span>
          </button>
        ))}
      </div>

      {isAdmin && (
        <button className="about__edit" onClick={onEditAbout}>
          ✏️ Редактировать этот раздел
        </button>
      )}

      {found.length === totalEggs && totalEggs > 0 && (
        <div className="about__cheers">🏆 Все пасхалки найдены — ты настоящий хакер! 🌟</div>
      )}
    </div>
  );
}
