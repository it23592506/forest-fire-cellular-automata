import { useRef, useEffect, useCallback } from 'react';

export type ParallelMode = 'none' | 'openmp' | 'mpi' | 'cuda';

interface ParallelOverlayProps {
  mode: ParallelMode;
  gridSize: number;
  canvasWidth: number;
  canvasHeight: number;
  generation: number;
}

// Distinct colors for different threads/processes/blocks
const PARTITION_COLORS = [
  'rgba(59, 130, 246, 0.25)',   // blue
  'rgba(239, 68, 68, 0.25)',    // red
  'rgba(34, 197, 94, 0.25)',    // green
  'rgba(234, 179, 8, 0.25)',    // yellow
  'rgba(168, 85, 247, 0.25)',   // purple
  'rgba(249, 115, 22, 0.25)',   // orange
  'rgba(6, 182, 212, 0.25)',    // cyan
  'rgba(236, 72, 153, 0.25)',   // pink
];

const PARTITION_BORDERS = [
  'rgba(59, 130, 246, 0.8)',
  'rgba(239, 68, 68, 0.8)',
  'rgba(34, 197, 94, 0.8)',
  'rgba(234, 179, 8, 0.8)',
  'rgba(168, 85, 247, 0.8)',
  'rgba(249, 115, 22, 0.8)',
  'rgba(6, 182, 212, 0.8)',
  'rgba(236, 72, 153, 0.8)',
];

export default function ParallelOverlay({
  mode,
  gridSize,
  canvasWidth,
  canvasHeight,
  generation,
}: ParallelOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode === 'none') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const cellW = canvasWidth / gridSize;
    const cellH = canvasHeight / gridSize;

    if (mode === 'openmp') {
      drawOpenMP(ctx, gridSize, cellW, cellH, canvasWidth, canvasHeight);
    } else if (mode === 'mpi') {
      drawMPI(ctx, gridSize, cellW, cellH, canvasWidth, canvasHeight);
    } else if (mode === 'cuda') {
      drawCUDA(ctx, gridSize, cellW, cellH, canvasWidth, canvasHeight, generation);
    }
  }, [mode, gridSize, canvasWidth, canvasHeight, generation]);

  useEffect(() => {
    draw();
  }, [draw]);

  if (mode === 'none') return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none w-full h-full"
    />
  );
}

/**
 * OpenMP: Horizontal row striping — each thread gets a band of rows.
 * Shows #pragma omp parallel for on the outer loop.
 */
function drawOpenMP(
  ctx: CanvasRenderingContext2D,
  gridSize: number,
  _cellW: number,
  cellH: number,
  w: number,
  _h: number
) {
  const numThreads = 8;
  const rowsPerThread = Math.ceil(gridSize / numThreads);

  for (let t = 0; t < numThreads; t++) {
    const startRow = t * rowsPerThread;
    const endRow = Math.min((t + 1) * rowsPerThread, gridSize);
    if (startRow >= gridSize) break;

    const y1 = startRow * cellH;
    const y2 = endRow * cellH;

    // Fill region
    ctx.fillStyle = PARTITION_COLORS[t % PARTITION_COLORS.length];
    ctx.fillRect(0, y1, w, y2 - y1);

    // Border
    ctx.strokeStyle = PARTITION_BORDERS[t % PARTITION_BORDERS.length];
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(1, y1 + 1, w - 2, y2 - y1 - 2);
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = 'white';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const labelY = y1 + 4;
    const label = `Thread ${t}`;

    // Background for label
    const metrics = ctx.measureText(label);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(4, labelY, metrics.width + 8, 16);
    ctx.fillStyle = PARTITION_BORDERS[t % PARTITION_BORDERS.length];
    ctx.fillText(label, 8, labelY + 2);
  }

  // Arrow showing rows[startRow..endRow] independence
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(w - 140, 6, 134, 20);
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('← rows split by thread', w - 10, 20);
}

/**
 * MPI: 2D block decomposition — each process owns a rectangular block.
 * Shows boundary/halo exchange regions.
 */
function drawMPI(
  ctx: CanvasRenderingContext2D,
  gridSize: number,
  cellW: number,
  cellH: number,
  w: number,
  h: number
) {
  const procsPerSide = 3; // 3x3 = 9 processes (some may be empty for odd grids)
  const blockRows = Math.ceil(gridSize / procsPerSide);
  const blockCols = Math.ceil(gridSize / procsPerSide);

  let rank = 0;
  for (let pr = 0; pr < procsPerSide; pr++) {
    for (let pc = 0; pc < procsPerSide; pc++) {
      const startRow = pr * blockRows;
      const endRow = Math.min((pr + 1) * blockRows, gridSize);
      const startCol = pc * blockCols;
      const endCol = Math.min((pc + 1) * blockCols, gridSize);
      if (startRow >= gridSize || startCol >= gridSize) continue;

      const x1 = startCol * cellW;
      const y1 = startRow * cellH;
      const bw = (endCol - startCol) * cellW;
      const bh = (endRow - startRow) * cellH;

      // Fill block
      ctx.fillStyle = PARTITION_COLORS[rank % PARTITION_COLORS.length];
      ctx.fillRect(x1, y1, bw, bh);

      // Border
      ctx.strokeStyle = PARTITION_BORDERS[rank % PARTITION_BORDERS.length];
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.strokeRect(x1 + 1, y1 + 1, bw - 2, bh - 2);

      // Halo/boundary region (1 cell thick on each edge)
      const haloSize = Math.max(1, Math.ceil(cellW));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';

      // Top halo
      if (pr > 0) ctx.fillRect(x1, y1, bw, haloSize);
      // Bottom halo
      if (pr < procsPerSide - 1) ctx.fillRect(x1, y1 + bh - haloSize, bw, haloSize);
      // Left halo
      if (pc > 0) ctx.fillRect(x1, y1, haloSize, bh);
      // Right halo
      if (pc < procsPerSide - 1) ctx.fillRect(x1 + bw - haloSize, y1, haloSize, bh);

      // Label
      const label = `P${rank}`;
      ctx.font = 'bold 13px monospace';
      const metrics = ctx.measureText(label);
      const lx = x1 + bw / 2 - metrics.width / 2 - 4;
      const ly = y1 + bh / 2 - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(lx, ly, metrics.width + 8, 20);
      ctx.fillStyle = PARTITION_BORDERS[rank % PARTITION_BORDERS.length];
      ctx.textAlign = 'center';
      ctx.fillText(label, x1 + bw / 2, y1 + bh / 2 + 3);

      rank++;
    }
  }

  // Draw arrows between adjacent blocks to show halo exchange
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  for (let pr = 0; pr < procsPerSide; pr++) {
    for (let pc = 0; pc < procsPerSide - 1; pc++) {
      const x = Math.min((pc + 1) * blockCols, gridSize) * cellW;
      const yStart = pr * blockRows * cellH + 20;
      const yEnd = Math.min((pr + 1) * blockRows, gridSize) * cellH - 20;
      // Small exchange arrows
      drawExchangeArrow(ctx, x, yStart + (yEnd - yStart) * 0.3, 'horizontal');
      drawExchangeArrow(ctx, x, yStart + (yEnd - yStart) * 0.7, 'horizontal');
    }
  }
  for (let pr = 0; pr < procsPerSide - 1; pr++) {
    for (let pc = 0; pc < procsPerSide; pc++) {
      const y = Math.min((pr + 1) * blockRows, gridSize) * cellH;
      const xStart = pc * blockCols * cellW + 20;
      const xEnd = Math.min((pc + 1) * blockCols, gridSize) * cellW - 20;
      drawExchangeArrow(ctx, xStart + (xEnd - xStart) * 0.3, y, 'vertical');
      drawExchangeArrow(ctx, xStart + (xEnd - xStart) * 0.7, y, 'vertical');
    }
  }
  ctx.setLineDash([]);

  // Legend
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(w - 180, h - 40, 176, 36);
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('↔ = halo/boundary exchange', w - 8, h - 24);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Each block is an MPI process', w - 8, h - 12);
}

function drawExchangeArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: 'horizontal' | 'vertical'
) {
  const len = 8;
  ctx.strokeStyle = 'rgba(255, 255, 100, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);

  if (direction === 'horizontal') {
    // Left arrow
    ctx.beginPath();
    ctx.moveTo(x + len, y - 3);
    ctx.lineTo(x - len, y - 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - len + 3, y - 6);
    ctx.lineTo(x - len, y - 3);
    ctx.lineTo(x - len + 3, y);
    ctx.stroke();
    // Right arrow
    ctx.beginPath();
    ctx.moveTo(x - len, y + 3);
    ctx.lineTo(x + len, y + 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + len - 3, y);
    ctx.lineTo(x + len, y + 3);
    ctx.lineTo(x + len - 3, y + 6);
    ctx.stroke();
  } else {
    // Up arrow
    ctx.beginPath();
    ctx.moveTo(x - 3, y + len);
    ctx.lineTo(x - 3, y - len);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6, y - len + 3);
    ctx.lineTo(x - 3, y - len);
    ctx.lineTo(x, y - len + 3);
    ctx.stroke();
    // Down arrow
    ctx.beginPath();
    ctx.moveTo(x + 3, y - len);
    ctx.lineTo(x + 3, y + len);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + len - 3);
    ctx.lineTo(x + 3, y + len);
    ctx.lineTo(x + 6, y + len - 3);
    ctx.stroke();
  }
}

/**
 * CUDA: Shows thread blocks and individual threads.
 * Grid → CUDA grid of blocks → each block has threads.
 */
function drawCUDA(
  ctx: CanvasRenderingContext2D,
  gridSize: number,
  cellW: number,
  cellH: number,
  w: number,
  h: number,
  generation: number
) {
  // CUDA block size (e.g., 16x16 threads per block)
  const blockDim = 16;
  const blocksX = Math.ceil(gridSize / blockDim);
  const blocksY = Math.ceil(gridSize / blockDim);

  // Animate: highlight one block at a time
  const highlightBlock = generation % (blocksX * blocksY);
  const hbx = highlightBlock % blocksX;
  const hby = Math.floor(highlightBlock / blocksX);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const startCol = bx * blockDim;
      const endCol = Math.min((bx + 1) * blockDim, gridSize);
      const startRow = by * blockDim;
      const endRow = Math.min((by + 1) * blockDim, gridSize);

      const x1 = startCol * cellW;
      const y1 = startRow * cellH;
      const bw = (endCol - startCol) * cellW;
      const bh = (endRow - startRow) * cellH;

      const isHighlighted = bx === hbx && by === hby;

      // Block outline
      ctx.strokeStyle = isHighlighted
        ? 'rgba(59, 130, 246, 0.9)'
        : 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = isHighlighted ? 2.5 : 0.8;
      ctx.setLineDash([]);
      ctx.strokeRect(x1, y1, bw, bh);

      if (isHighlighted) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
        ctx.fillRect(x1, y1, bw, bh);

        // Draw individual thread dots within highlighted block
        const dotR = Math.max(1, Math.min(cellW, cellH) * 0.25);
        for (let ty = startRow; ty < endRow; ty++) {
          for (let tx = startCol; tx < endCol; tx++) {
            const cx = tx * cellW + cellW / 2;
            const cy = ty * cellH + cellH / 2;
            ctx.fillStyle = 'rgba(147, 197, 253, 0.7)';
            ctx.beginPath();
            ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Label
        const label = `Block(${bx},${by})`;
        ctx.font = 'bold 10px monospace';
        const metrics = ctx.measureText(label);
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(x1 + 2, y1 + 2, metrics.width + 6, 14);
        ctx.fillStyle = '#93c5fd';
        ctx.textAlign = 'left';
        ctx.fillText(label, x1 + 5, y1 + 13);
      }
    }
  }

  // Legend
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(4, h - 56, 230, 52);

  ctx.fillStyle = '#93c5fd';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`CUDA Grid: ${blocksX}×${blocksY} blocks`, 10, h - 42);
  ctx.fillStyle = 'rgba(200,200,255,0.7)';
  ctx.font = '9px monospace';
  ctx.fillText(`Block dim: ${blockDim}×${blockDim} = ${blockDim * blockDim} threads/block`, 10, h - 28);
  ctx.fillText(`Total threads: ${gridSize * gridSize} (1 per cell)`, 10, h - 14);

  // Top-right info
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(w - 200, 6, 194, 20);
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('Each dot = 1 GPU thread', w - 10, 20);
}
