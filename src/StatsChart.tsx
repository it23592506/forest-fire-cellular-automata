import { useRef, useEffect } from 'react';
import { SimulationStats } from './simulation';

interface StatsChartProps {
  history: SimulationStats[];
  maxPoints?: number;
}

export default function StatsChart({ history, maxPoints = 200 }: StatsChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 10, right: 10, bottom: 25, left: 45 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    if (history.length < 2) return;

    // Sample data if too many points
    const data = history.length > maxPoints
      ? history.filter((_, i) => i % Math.ceil(history.length / maxPoints) === 0 || i === history.length - 1)
      : history;

    const totalCells = data[0].totalCells;
    const maxGen = data[data.length - 1].generation;

    // Grid lines
    ctx.strokeStyle = '#333355';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }

    // Draw lines
    const drawLine = (
      getData: (s: SimulationStats) => number,
      color: string,
      label: string
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      data.forEach((s, i) => {
        const x = padding.left + (s.generation / Math.max(maxGen, 1)) * chartW;
        const y = padding.top + chartH - (getData(s) / totalCells) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Label at last point
      const last = data[data.length - 1];
      const lx = padding.left + chartW;
      const ly = padding.top + chartH - (getData(last) / totalCells) * chartH;
      ctx.fillStyle = color;
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(label, lx - 2, ly - 4);
    };

    drawLine(s => s.trees, '#22c55e', 'Trees');
    drawLine(s => s.fire, '#ef4444', 'Fire');
    drawLine(s => s.empty + s.burned, '#6b7280', 'Empty');

    // Axes labels
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Gen ${maxGen}`, w / 2, h - 3);

    ctx.textAlign = 'right';
    ctx.fillText('100%', padding.left - 4, padding.top + 8);
    ctx.fillText('0%', padding.left - 4, padding.top + chartH + 4);

  }, [history, maxPoints]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full rounded-lg"
      style={{ minHeight: '120px' }}
    />
  );
}
