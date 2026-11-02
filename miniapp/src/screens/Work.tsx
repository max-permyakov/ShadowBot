import { useMemo, useState } from "react";
import { Button, Caption, Title, Text } from "@telegram-apps/telegram-ui";
import type { AboutWork } from "../types";
import { EGG_MS, addFoundEgg, eggsFound } from "../types";
import { openExternalLink, hapticImpact, hapticNotify, inTelegram } from "../telegram";
import { MediaCell } from "../components/MediaCell";
import { MatrixRainLite } from "../components/MatrixRain";

export default function Work({
  work,
  onBack,
  notify,
}: {
  work: AboutWork;
  onBack: () => void;
  notify: (kind: "success" | "error" | "info", message: string) => void;
}) {
  const media = useMemo(
    () => (work.media ?? []).map((url) => ({ type: "photo" as const, url })),
    [work.media],
  );

  const [caught, setCaught] = useState(() => (work.egg ? eggsFound().includes(work.egg) : true));
  const [eggToast, setEggToast] = useState<string | null>(null);
  const eggMsg = work.eggText?.trim()
    ? work.eggText.trim()
    : work.egg
      ? EGG_MS[work.egg] ?? `${work.egg} пасхалка найдена!`
      : null;

  const catchEgg = () => {
    if (caught || !work.egg) return;
    const all = addFoundEgg(work.egg);
    setCaught(true);
    hapticNotify("success");
    setEggToast(eggMsg!);
    window.setTimeout(() => setEggToast(null), 2600);
    notify("info", `Пасхалки: ${all.length}`);
  };

  const openGitHub = () => {
    hapticImpact();
    openExternalLink(work.url);
  };

  return (
    <div className="screen screen--work">
      <div className="about__bg" aria-hidden>
        <MatrixRainLite />
        {work.egg && !caught && (
          <button
            className="about__egg"
            style={{ left: "68%", animationDuration: "9s" }}
            onClick={catchEgg}
            aria-label="Пасхалка"
          >
            {work.egg}
          </button>
        )}
      </div>

      {!inTelegram() && (
        <button className="web-back" onClick={onBack}>
          ← Назад к работам
        </button>
      )}

      {media.length > 0 ? (
        <div className="carousel">
          {media.map((m, i) => (
            <div className="carousel__slide" key={i}>
              <MediaCell media={m} className="carousel__cell" />
            </div>
          ))}
        </div>
      ) : (
        <div className="work__hero">
          <span className="work__hero-emoji">{work.emoji || "📦"}</span>
        </div>
      )}

      <div className="detail">
        <span className="chip chip--on">{work.emoji || "📦"} проект</span>
        <Title level="1" weight="2" className="detail__title">
          {work.title}
        </Title>
        <Caption className="work__sub">{work.description}</Caption>
        <Text className="detail__desc">{work.details || work.description}</Text>

        <Button
          size="l"
          stretched
          mode="filled"
          className="order__btn work__gh"
          onClick={openGitHub}
        >
          🐙 Открыть проект на GitHub
        </Button>
      </div>

      {eggToast && <div className="about__egg-toast">{eggToast}</div>}
    </div>
  );
}
