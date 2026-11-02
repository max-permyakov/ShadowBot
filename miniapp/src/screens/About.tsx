import { useEffect, useRef, useState } from "react";
import { Caption } from "@telegram-apps/telegram-ui";
import type { AboutData, AboutWork } from "../types";
import { DEFAULT_ABOUT } from "../types";
import { getAbout } from "../api";
import { hapticImpact, hapticNotify, openExternalLink } from "../telegram";
import { inTelegram } from "../telegram";

/** Пасхалки: падают вместе с цифрами, ловятся тапом. */
const EGGS: Array<{ emoji: string; msg: string }> = [
  { emoji: "🐧", msg: "Tux одобряет — Linux внутри 🐧" },
  { emoji: "🐍", msg: "Змейка живёт в консоли… питон её приютил 🐍" },
  { emoji: "☕", msg: "Кофе сварен: +100 к компиляции ☕" },
  { emoji: "🔒", msg: "VPN шепчет: DPI снова плачет 🔒" },
  { emoji: "👾", msg: "Space Invaders в шкафу — digitize! 👾" },
];

/* ---------- эффект: циризиновый дождь из 0 и 1 ---------- */
function MatrixRain() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cols = 0;
    let drops: number[] = [];
    let raf = 0;
    let last = 0;

    const resize = () => {
      const parent = canvas.parentElement!;
      canvas.width = parent.clientWidth * devicePixelRatio;
      canvas.height = parent.clientHeight * devicePixelRatio;
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
      const size = 14 * devicePixelRatio;
      cols = Math.ceil(canvas.width / size);
      drops = Array.from({ length: cols }, () => Math.floor(Math.random() * cols));
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < (reduced ? 400 : 55)) return;
      last = t;
      const size = 14 * devicePixelRatio;
      ctx.fillStyle = "rgba(11, 13, 18, 0.18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(124, 92, 255, 0.55)";
      ctx.font = `${size}px monospace`;
      for (let i = 0; i < cols; i++) {
        const ch = Math.random() > 0.5 ? "0" : "1";
        const x = i * size;
        const y = drops[i] * size;
        ctx.fillText(ch, x, y);
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        else drops[i]++;
      }
    };
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="about__matrix" aria-hidden />;
}

/* ---------- эффект: печатающийся текст ---------- */
function Typewriter({ text }: { text: string }) {
  const [len, setLen] = useState(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) {
      setLen(text.length);
      return;
    }
    setLen(0);
    let i = 0;
    const timer = window.setInterval(() => {
      i++;
      setLen(i);
      if (i >= text.length) window.clearInterval(timer);
    }, 26);
    return () => window.clearInterval(timer);
  }, [text]);

  return (
    <span className="about__type">
      {text.slice(0, len)}
      <span className={`about__caret ${len >= text.length ? "about__caret--idle" : ""}`} />
    </span>
  );
}

export default function About({
  isAdmin,
  onBack,
  onEditAbout,
  notify,
}: {
  isAdmin: boolean;
  onBack: () => void;
  onEditAbout: () => void;
  notify: (kind: "success" | "error" | "info", message: string) => void;
}) {
  const [data, setData] = useState<AboutData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [eggToast, setEggToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAbout()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) {
          setData(DEFAULT_ABOUT);
          setError(null); // fallback тихо: данные дефолтные
          console.warn("about fallback:", err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div className="screen about">
        <div className="about__loading">⏳ Загружаем «О мне»…</div>
      </div>
    );
  }

  const catchEgg = (egg: (typeof EGGS)[number]) => {
    hapticNotify("success");
    setFound((prev) => {
      const next = new Set(prev);
      if (!next.has(egg.emoji)) {
        next.add(egg.emoji);
        if (next.size === EGGS.length) {
          window.setTimeout(
            () => notify("success", "🏆 Все пасхалки найдены! Ты настоящий хакер 🌟"),
            900,
          );
        }
      }
      return next;
    });
    setEggToast(egg.msg);
    window.setTimeout(() => setEggToast(null), 2600);
  };

  const openWork = (w: AboutWork) => {
    hapticImpact();
    openExternalLink(w.url);
  };

  const progress = Math.round((found.size / EGGS.length) * 100);

  return (
    <div className="screen about">
      {/* фон-эффект */}
      <div className="about__bg" aria-hidden>
        <MatrixRain />
        {EGGS.map((egg, i) => (
          <button
            key={egg.emoji}
            className="about__egg"
            style={{
              left: `${8 + i * 18}%`,
              animationDelay: `${i * 3.7}s`,
              animationDuration: `${11 + i * 2.3}s`,
              opacity: found.has(egg.emoji) ? 0.25 : 1,
            }}
            onClick={() => catchEgg(egg)}
            title="?"
          >
            {egg.emoji}
          </button>
        ))}
      </div>

      {!inTelegram() && (
        <button className="web-back" onClick={onBack}>
          ← Назад в каталог
        </button>
      )}

      <div className="about__head">
        <img className="about__avatar" src="logo.jpg" alt="" />
        <div>
          <h2 className="about__name">Массимо</h2>
          <Caption className="about__role">backend-разработчик · 3D-печатник</Caption>
        </div>
      </div>

      {/* печатный текст */}
      <div className="about__terminal">
        <div className="about__term-bar">
          <i className="about__term-dot" />
          <i className="about__term-dot" />
          <i className="about__term-dot" />
          <span className="about__term-name">massimo@krasnodar:~$ whoami</span>
        </div>
        <p className="about__intro">
          <Typewriter text={data.intro} />
        </p>
      </div>

      {/* работы */}
      <h3 className="about__works-title">Работы и проекты</h3>
      <div className="about__works">
        {data.works.map((w, i) => (
          <a
            key={i}
            className="about__work"
            href={w.url}
            onClick={(e) => {
              e.preventDefault();
              openWork(w);
            }}
          >
            <span className="about__work-emoji">{w.emoji || "📦"}</span>
            <span className="about__work-body">
              <span className="about__work-title">{w.title}</span>
              <span className="about__work-desc">{w.description}</span>
            </span>
            <span className="about__work-arrow">→</span>
          </a>
        ))}
      </div>

      {/* пасхалки прогресс */}
      <div className="about__eggs-progress">
        <span className="about__eggs-label">
          Пасхалки: {found.size}/{EGGS.length}
        </span>
        <div className="about__eggs-bar">
          <i style={{ width: `${progress}%` }} />
        </div>
      </div>

      {isAdmin && (
        <button className="about__edit" onClick={onEditAbout}>
          ✏️ Редактировать этот раздел
        </button>
      )}

      {eggToast && <div className="about__egg-toast">{eggToast}</div>}
      {error && <div className="about__egg-toast">{error}</div>}
    </div>
  );
}
