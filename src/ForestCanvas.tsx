import { useRef, useEffect, useCallback, useState } from 'react';
import { ForestFireSimulation, EMPTY, TREE, FIRE, BURNED } from './simulation';
import ParallelOverlay, { type ParallelMode } from './ParallelOverlay';

interface ForestCanvasProps {
  simulation: ForestFireSimulation;
  renderTick: number;
  brushMode: 'fire' | 'tree' | 'empty';
  parallelMode: ParallelMode;
}

// Color palette
const COLORS = {
  [EMPTY]: [45, 42, 46],      // dark charcoal
  [TREE]: [34, 139, 34],      // forest green
  [FIRE]: [255, 69, 0],       // red-orange fire
  [BURNED]: [80, 50, 30],     // dark brown
};

// Variations for trees to add visual depth
const TREE_VARIATIONS = [
  [28, 120, 28],
  [34, 139, 34],
  [40, 155, 40],
  [25, 110, 25],
  [45, 145, 35],
  [30, 130, 30],
];

const FIRE_VARIATIONS = [
  [255, 69, 0],
  [255, 140, 0],
  [255, 100, 0],
  [255, 50, 20],
  [255, 165, 0],
  [255, 80, 10],
];

export default function ForestCanvas({ simulation, renderTick, brushMode, parallelMode }: ForestCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const variationMap = useRef<Uint8Array | null>(null);
  const [canvasDim, setCanvasDim] = useState({ w: 600, h: 600 });
  const [displayDim, setDisplayDim] = useState(600);

  // Generate a stable variation map for visual diversity
  useEffect(() => {
    const size = simulation.config.size;
    const map = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i++) {
      map[i] = Math.floor(Math.random() * 6);
    }
    variationMap.current = map;
  }, [simulation.config.size]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = simulation.config.size;
    const cellW = canvas.width / size;
    const cellH = canvas.height / size;

    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;
    const vMap = variationMap.current;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cellIdx = y * size + x;
        const cell = simulation.grid[cellIdx];

        let r: number, g: number, b: number;

        if (cell === TREE && vMap) {
          const v = TREE_VARIATIONS[vMap[cellIdx]];
          r = v[0]; g = v[1]; b = v[2];
        } else if (cell === FIRE) {
          const v = FIRE_VARIATIONS[vMap ? vMap[cellIdx] : 0];
          // Add flicker
          const flicker = Math.random() * 40 - 20;
          r = Math.min(255, Math.max(0, v[0] + flicker));
          g = Math.min(255, Math.max(0, v[1] + flicker * 0.5));
          b = v[2];
        } else if (cell === BURNED) {
          r = 80 + Math.random() * 15;
          g = 50 + Math.random() * 10;
          b = 30;
        } else {
          const c = COLORS[EMPTY];
          r = c[0]; g = c[1]; b = c[2];
        }

        // Fill pixels for this cell
        const startX = Math.floor(x * cellW);
        const endX = Math.floor((x + 1) * cellW);
        const startY = Math.floor(y * cellH);
        const endY = Math.floor((y + 1) * cellH);

        for (let py = startY; py < endY; py++) {
          for (let px = startX; px < endX; px++) {
            const pi = (py * canvas.width + px) * 4;
            data[pi] = r;
            data[pi + 1] = g;
            data[pi + 2] = b;
            data[pi + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [simulation]);

  useEffect(() => {
    render();
  }, [render, renderTick]);

  // Resize canvas to fit container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const dim = Math.min(rect.width, rect.height);
      const pixelSize = Math.max(dim, 300);
      canvas.width = pixelSize;
      canvas.height = pixelSize;
      canvas.style.width = `${dim}px`;
      canvas.style.height = `${dim}px`;
      setCanvasDim({ w: pixelSize, h: pixelSize });
      setDisplayDim(dim);
      render();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [render]);

  const getCellFromEvent = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const size = simulation.config.size;
    const cellW = canvas.width / size;
    const cellH = canvas.height / size;
    const x = Math.floor(px / cellW);
    const y = Math.floor(py / cellH);
    if (x >= 0 && x < size && y >= 0 && y < size) return [x, y];
    return null;
  };

  const paint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCellFromEvent(e);
    if (!pos) return;
    const [x, y] = pos;
    const state = brushMode === 'fire' ? FIRE : brushMode === 'tree' ? TREE : EMPTY;
    // Paint with a small brush
    const brushSize = Math.max(1, Math.floor(simulation.config.size / 50));
    for (let dy = -brushSize; dy <= brushSize; dy++) {
      for (let dx = -brushSize; dx <= brushSize; dx++) {
        if (dx * dx + dy * dy <= brushSize * brushSize) {
          simulation.setCell(x + dx, y + dy, state);
        }
      }
    }
    render();
  };

  return (
    <div ref={containerRef} className="w-full aspect-square max-h-[70vh] flex items-center justify-center relative">
      <canvas
        ref={canvasRef}
        className="cursor-crosshair rounded-lg shadow-2xl border border-gray-700/50"
        onMouseDown={(e) => {
          isDragging.current = true;
          paint(e);
        }}
        onMouseMove={(e) => {
          if (isDragging.current) paint(e);
        }}
        onMouseUp={() => { isDragging.current = false; }}
        onMouseLeave={() => { isDragging.current = false; }}
      />
      <div
        className="absolute pointer-events-none rounded-lg overflow-hidden"
        style={{
          width: `${displayDim}px`,
          height: `${displayDim}px`,
        }}
      >
        <ParallelOverlay
          mode={parallelMode}
          gridSize={simulation.config.size}
          canvasWidth={canvasDim.w}
          canvasHeight={canvasDim.h}
          generation={simulation.generation}
        />
      </div>
    </div>
  );
}
