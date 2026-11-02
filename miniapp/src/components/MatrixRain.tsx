import { useEffect, useRef } from "react";

/**
 * Цифровой дождь на canvas: 0 и 1, фиолетовая палитра.
 * lite = реже кадры и меньше непрозрачность (для страниц проектов).
 */
export function MatrixRain({ lite = false }: { lite?: boolean }) {
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

    const size = 14 * devicePixelRatio;

    const resize = () => {
      const parent = canvas.parentElement || document.body;
      canvas.width = Math.max(1, parent.clientWidth * devicePixelRatio);
      canvas.height = Math.max(1, parent.clientHeight * devicePixelRatio);
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
      cols = Math.ceil(canvas.width / size);
      drops = Array.from({ length: cols }, () => Math.floor(Math.random() * (canvas.height / size)));
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      // ~50мс обычный, ~130мс lite; при reduced-motion почти статично
      const gap = lite ? 130 : 50;
      if (t - last < (reduced ? gap * 4 : gap)) return;
      last = t;
      ctx.fillStyle = "rgba(11, 13, 18, 0.2)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(124, 92, 255, 0.6)";
      ctx.font = `${size}px monospace`;
      for (let i = 0; i < cols; i++) {
        ctx.fillText(Math.random() > 0.5 ? "0" : "1", i * size, drops[i] * size);
        const y = drops[i] * size;
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
  }, [lite]);

  return <canvas ref={ref} className="about__matrix" aria-hidden />;
}

export function MatrixRainLite() {
  return <MatrixRain lite />;
}
