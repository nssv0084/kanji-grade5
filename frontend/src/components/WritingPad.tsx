import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { Point } from "../../../shared/handwriting/path";

// 指で書くマス（HWR-01、HWR-06）。座標はマスの一辺を1とした値で持つ
interface Props {
  strokes: Point[][];
  onChange: (strokes: Point[][]) => void;
  disabled?: boolean;
}

export function WritingPad({ strokes, onChange, disabled = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ pointerId: number; points: Point[] } | null>(null);
  const [size, setSize] = useState(0);

  useLayoutEffect(() => {
    const el = canvasRef.current!;
    const update = () => setSize(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // iOS の古い Safari では touch-action だけでは止まらないため、マスの上のタッチでスクロールさせない
  useEffect(() => {
    const el = canvasRef.current!;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchstart", stop, { passive: false });
    el.addEventListener("touchmove", stop, { passive: false });
    return () => {
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("touchmove", stop);
    };
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || size === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const styles = getComputedStyle(canvas);
    // 十字の補助線
    ctx.strokeStyle = styles.getPropertyValue("--pad-guide") || "#ccc";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = styles.getPropertyValue("--pad-ink") || "#222";
    ctx.lineWidth = Math.max(6, size / 28);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const all = drawing.current ? [...strokes, drawing.current.points] : strokes;
    for (const s of all) {
      ctx.beginPath();
      s.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * size, p.y * size) : ctx.lineTo(p.x * size, p.y * size)));
      if (s.length === 1) ctx.lineTo(s[0].x * size + 0.1, s[0].y * size);
      ctx.stroke();
    }
  }, [strokes, size]);

  useEffect(redraw, [redraw]);

  const toPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / (rect.width || 1), y: (e.clientY - rect.top) / (rect.height || 1) };
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    // 書いている途中に2本目の指が触れても無視する
    if (disabled || drawing.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = { pointerId: e.pointerId, points: [toPoint(e)] };
    redraw();
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of events.length > 0 ? events : [e]) d.points.push(toPoint(ev));
    redraw();
  };

  const onPointerEnd = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drawing.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drawing.current = null;
    onChange([...strokes, d.points]);
  };

  return (
    <canvas
      ref={canvasRef}
      className="pad"
      aria-label="ここに漢字を書く"
      data-testid="writing-pad"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    />
  );
}
