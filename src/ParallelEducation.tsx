import { useState } from 'react';
import type { ParallelMode } from './ParallelOverlay';

interface ParallelEducationProps {
  activeMode: ParallelMode;
  onModeChange: (mode: ParallelMode) => void;
}

const CODE_SNIPPETS: Record<string, { title: string; language: string; code: string; explanation: string }> = {
  sequential: {
    title: 'Sequential (Original)',
    language: 'c',
    code: `void updateForest() {
  for (int i = 0; i < SIZE; i++) {
    for (int j = 0; j < SIZE; j++) {
      // Each cell's next state depends
      // ONLY on current neighbors
      if (forest[i][j] == FIRE)
        newForest[i][j] = EMPTY;
      else if (forest[i][j] == TREE &&
               hasBurningNeighbor(i, j))
        newForest[i][j] = FIRE;
      else
        newForest[i][j] = forest[i][j];
    }
  }
  // Copy newForest → forest
}`,
    explanation:
      'The key insight: each cell reads ONLY from the current grid (forest[][]) and writes ONLY to the next grid (newForest[][]). No cell depends on another cell\'s next state — this is what makes it embarrassingly parallel.',
  },
  openmp: {
    title: 'OpenMP (Shared Memory)',
    language: 'c',
    code: `void updateForest() {
  // One line parallelizes the outer loop!
  #pragma omp parallel for \\
    schedule(dynamic) \\
    shared(forest, newForest)
  for (int i = 0; i < SIZE; i++) {
    for (int j = 0; j < SIZE; j++) {
      if (forest[i][j] == FIRE)
        newForest[i][j] = EMPTY;
      else if (forest[i][j] == TREE &&
               hasBurningNeighbor(i, j))
        newForest[i][j] = FIRE;
      else
        newForest[i][j] = forest[i][j];
    }
  }
}`,
    explanation:
      'OpenMP splits rows across CPU threads. Each thread processes a band of rows independently. The forest[] array is shared read-only (current gen), and newForest[] writes never conflict because each thread writes to different rows.',
  },
  mpi: {
    title: 'MPI (Distributed Memory)',
    language: 'c',
    code: `// Each process owns a block of rows
int rows_per_proc = SIZE / num_procs;
int start = rank * rows_per_proc;
int end   = start + rows_per_proc;

// Exchange boundary rows (halo)
MPI_Sendrecv(
  forest[start], SIZE, MPI_INT,
  rank-1, 0,  // send top row up
  halo_top,   SIZE, MPI_INT,
  rank-1, 1,  // recv their bottom
  MPI_COMM_WORLD, &status);

MPI_Sendrecv(
  forest[end-1], SIZE, MPI_INT,
  rank+1, 1,  // send bottom row down
  halo_bot,    SIZE, MPI_INT,
  rank+1, 0,  // recv their top
  MPI_COMM_WORLD, &status);

// Now compute locally with halos
for (int i = start; i < end; i++)
  for (int j = 0; j < SIZE; j++)
    updateCell(i, j); // uses halo data`,
    explanation:
      'MPI distributes blocks across separate processes (potentially different machines). The only communication needed is exchanging 1-cell-thick boundary "halo" rows between neighbors — the interior cells are fully independent.',
  },
  cuda: {
    title: 'CUDA (GPU)',
    language: 'c',
    code: `__global__ void updateKernel(
  int *forest, int *newForest,
  int SIZE, float prob)
{
  // Each thread = one cell
  int x = blockIdx.x * blockDim.x
        + threadIdx.x;
  int y = blockIdx.y * blockDim.y
        + threadIdx.y;

  if (x >= SIZE || y >= SIZE) return;

  int idx = y * SIZE + x;
  int cell = forest[idx];

  if (cell == FIRE)
    newForest[idx] = EMPTY;
  else if (cell == TREE &&
           hasBurningNeighbor(forest,x,y))
    newForest[idx] = FIRE;
  else
    newForest[idx] = cell;
}

// Launch: 1 thread per cell!
dim3 block(16, 16);  // 256 threads
dim3 grid(
  (SIZE+15)/16, (SIZE+15)/16);
updateKernel<<<grid, block>>>(
  d_forest, d_new, SIZE, prob);`,
    explanation:
      'CUDA assigns one GPU thread per cell — thousands run simultaneously. A 150×150 grid launches 22,500 threads in parallel! The grid is organized into 16×16 thread blocks. Each thread reads neighbors from global memory and writes its one output cell.',
  },
};

const PARALLEL_CHARACTERISTICS = [
  {
    icon: '✅',
    title: 'No Data Dependencies',
    description: "Each cell's next state depends ONLY on its current neighbors — never on another cell's future state.",
  },
  {
    icon: '📖',
    title: 'Read-Only Input',
    description: 'All threads read from the same current-generation array. No write conflicts possible.',
  },
  {
    icon: '✍️',
    title: 'Non-Overlapping Writes',
    description: 'Each thread writes to exactly one cell in the output array. No synchronization needed.',
  },
  {
    icon: '🔄',
    title: 'Regular Memory Access',
    description: 'Each cell accesses the same 3×3 neighborhood pattern — predictable, cache-friendly access.',
  },
  {
    icon: '⚖️',
    title: 'Balanced Workload',
    description: 'Every cell performs the same amount of computation — no load imbalance between threads.',
  },
  {
    icon: '📊',
    title: 'O(n²) Parallelism',
    description: 'For an n×n grid, all n² cells can be computed simultaneously — massive parallelism potential.',
  },
];

const SCALING_DATA = [
  { label: '1 Core', speedup: 1, time: '100ms', color: '#6b7280' },
  { label: '4 Cores (OpenMP)', speedup: 3.8, time: '26ms', color: '#3b82f6' },
  { label: '8 Cores (OpenMP)', speedup: 7.2, time: '14ms', color: '#2563eb' },
  { label: '4 Nodes (MPI)', speedup: 14, time: '7ms', color: '#22c55e' },
  { label: 'GPU (CUDA)', speedup: 85, time: '1.2ms', color: '#f59e0b' },
];

export default function ParallelEducation({ activeMode, onModeChange }: ParallelEducationProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'code' | 'scaling'>('overview');
  const [codeView, setCodeView] = useState<string>('sequential');

  return (
    <div className="bg-gray-900/50 backdrop-blur rounded-xl border border-gray-800/50 overflow-hidden">
      {/* Header with mode selector */}
      <div className="p-3 border-b border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-200 mb-2 flex items-center gap-2">
          <span className="text-base">⚡</span>
          Why This Algorithm Is Parallel
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Toggle overlays to visualize how different frameworks partition the grid
        </p>

        {/* Overlay mode buttons */}
        <div className="grid grid-cols-4 gap-1">
          {([
            ['none', 'Off', ''],
            ['openmp', 'OpenMP', '🧵'],
            ['mpi', 'MPI', '🌐'],
            ['cuda', 'CUDA', '🎮'],
          ] as [ParallelMode, string, string][]).map(([mode, label, icon]) => (
            <button
              key={mode}
              onClick={() => onModeChange(mode)}
              className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                activeMode === mode
                  ? mode === 'none'
                    ? 'bg-gray-700 text-white ring-1 ring-gray-500'
                    : mode === 'openmp'
                    ? 'bg-blue-700/80 text-white ring-1 ring-blue-400'
                    : mode === 'mpi'
                    ? 'bg-green-700/80 text-white ring-1 ring-green-400'
                    : 'bg-amber-700/80 text-white ring-1 ring-amber-400'
                  : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-gray-200'
              }`}
            >
              {icon && <span>{icon}</span>}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-gray-800/50">
        {([
          ['overview', 'Overview'],
          ['code', 'Code'],
          ['scaling', 'Scaling'],
        ] as [typeof activeTab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-all ${
              activeTab === tab
                ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3 max-h-[440px] overflow-y-auto custom-scrollbar">
        {activeTab === 'overview' && (
          <div className="space-y-2.5">
            <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 rounded-lg p-3 border border-amber-800/30">
              <h4 className="text-xs font-semibold text-amber-400 mb-1.5">🔑 The Key Insight</h4>
              <p className="text-xs text-gray-300 leading-relaxed">
                In <code className="text-amber-300 bg-black/30 px-1 rounded">updateForest()</code>, every cell's next state
                is computed <span className="text-white font-semibold">independently</span> from only the{' '}
                <span className="text-white font-semibold">current</span> generation's data. This means all{' '}
                <span className="text-amber-300 font-semibold">n² cells can be updated simultaneously</span> — making
                this an "embarrassingly parallel" algorithm.
              </p>
            </div>

            {PARALLEL_CHARACTERISTICS.map((item, i) => (
              <div
                key={i}
                className="flex gap-2 p-2 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-colors"
              >
                <span className="text-sm mt-0.5 shrink-0">{item.icon}</span>
                <div>
                  <h5 className="text-xs font-semibold text-gray-200">{item.title}</h5>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}

            {/* Data flow diagram */}
            <div className="bg-gray-800/40 rounded-lg p-3 mt-2">
              <h4 className="text-xs font-semibold text-gray-300 mb-2">Data Flow (One Step)</h4>
              <div className="flex items-center justify-center gap-2 text-xs">
                <div className="bg-green-900/50 border border-green-700/50 rounded px-2 py-1.5 text-center">
                  <div className="text-green-400 font-semibold">forest[][]</div>
                  <div className="text-gray-500 text-[10px]">READ only</div>
                </div>
                <div className="text-gray-500 flex flex-col items-center">
                  <span>→ all threads →</span>
                  <span className="text-[10px] text-gray-600">read neighbors</span>
                </div>
                <div className="bg-blue-900/50 border border-blue-700/50 rounded px-2 py-1.5 text-center">
                  <div className="text-blue-400 font-semibold">compute</div>
                  <div className="text-gray-500 text-[10px]">3×3 stencil</div>
                </div>
                <div className="text-gray-500 flex flex-col items-center">
                  <span>→ each thread →</span>
                  <span className="text-[10px] text-gray-600">writes 1 cell</span>
                </div>
                <div className="bg-orange-900/50 border border-orange-700/50 rounded px-2 py-1.5 text-center">
                  <div className="text-orange-400 font-semibold">newForest[][]</div>
                  <div className="text-gray-500 text-[10px]">WRITE only</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'code' && (
          <div className="space-y-3">
            {/* Code view selector */}
            <div className="flex flex-wrap gap-1">
              {Object.entries(CODE_SNIPPETS).map(([key, snippet]) => (
                <button
                  key={key}
                  onClick={() => setCodeView(key)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    codeView === key
                      ? 'bg-amber-600/80 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {snippet.title}
                </button>
              ))}
            </div>

            {/* Code display */}
            <div className="bg-[#0d1117] rounded-lg border border-gray-800/70 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 border-b border-gray-800/50">
                <div className="flex gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                </div>
                <span className="text-[10px] text-gray-500">{CODE_SNIPPETS[codeView].title}</span>
              </div>
              <pre className="p-3 overflow-x-auto text-[10px] leading-relaxed">
                <code className="text-gray-300">{highlightCode(CODE_SNIPPETS[codeView].code)}</code>
              </pre>
            </div>

            {/* Explanation */}
            <div className="bg-blue-900/15 border border-blue-800/30 rounded-lg p-3">
              <p className="text-xs text-blue-200/80 leading-relaxed">
                💡 {CODE_SNIPPETS[codeView].explanation}
              </p>
            </div>

            {/* Comparison: what makes this parallelizable vs what wouldn't be */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-green-900/15 border border-green-800/30 rounded-lg p-2">
                <h5 className="text-[10px] font-semibold text-green-400 mb-1">✅ Parallelizable</h5>
                <ul className="text-[10px] text-gray-400 space-y-0.5">
                  <li>• Read current gen only</li>
                  <li>• Write to separate array</li>
                  <li>• Fixed 3×3 stencil</li>
                  <li>• No global state</li>
                </ul>
              </div>
              <div className="bg-red-900/15 border border-red-800/30 rounded-lg p-2">
                <h5 className="text-[10px] font-semibold text-red-400 mb-1">❌ Would Break It</h5>
                <ul className="text-[10px] text-gray-400 space-y-0.5">
                  <li>• In-place updates</li>
                  <li>• Global counters</li>
                  <li>• Order-dependent rules</li>
                  <li>• Shared mutable state</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'scaling' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              Theoretical speedup for a 1000×1000 grid per generation step:
            </p>

            {/* Bar chart */}
            <div className="space-y-2">
              {SCALING_DATA.map((item, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-300">{item.label}</span>
                    <span className="text-xs font-mono" style={{ color: item.color }}>
                      {item.speedup}× ({item.time})
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(item.speedup / 85) * 100}%`,
                        backgroundColor: item.color,
                        minWidth: '8px',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gray-800/40 rounded-lg p-3 space-y-2">
              <h4 className="text-xs font-semibold text-gray-300">Framework Comparison</h4>
              <table className="w-full text-[10px] text-gray-400">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700/50">
                    <th className="text-left py-1">Feature</th>
                    <th className="text-center py-1">OpenMP</th>
                    <th className="text-center py-1">MPI</th>
                    <th className="text-center py-1">CUDA</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-800/30">
                    <td className="py-1">Memory</td>
                    <td className="text-center text-blue-400">Shared</td>
                    <td className="text-center text-green-400">Distributed</td>
                    <td className="text-center text-amber-400">GPU VRAM</td>
                  </tr>
                  <tr className="border-b border-gray-800/30">
                    <td className="py-1">Parallelism</td>
                    <td className="text-center text-blue-400">Threads</td>
                    <td className="text-center text-green-400">Processes</td>
                    <td className="text-center text-amber-400">GPU threads</td>
                  </tr>
                  <tr className="border-b border-gray-800/30">
                    <td className="py-1">Typical scale</td>
                    <td className="text-center text-blue-400">4-64</td>
                    <td className="text-center text-green-400">10-1000s</td>
                    <td className="text-center text-amber-400">1000s-millions</td>
                  </tr>
                  <tr className="border-b border-gray-800/30">
                    <td className="py-1">Code change</td>
                    <td className="text-center text-blue-400">1 pragma</td>
                    <td className="text-center text-green-400">Moderate</td>
                    <td className="text-center text-amber-400">Rewrite kernel</td>
                  </tr>
                  <tr className="border-b border-gray-800/30">
                    <td className="py-1">Communication</td>
                    <td className="text-center text-blue-400">None</td>
                    <td className="text-center text-green-400">Halo exchange</td>
                    <td className="text-center text-amber-400">Mem transfer</td>
                  </tr>
                  <tr>
                    <td className="py-1">Best for</td>
                    <td className="text-center text-blue-400">Multi-core</td>
                    <td className="text-center text-green-400">Clusters</td>
                    <td className="text-center text-amber-400">Massive grids</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-amber-900/15 border border-amber-800/30 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-amber-400 mb-1">💡 Amdahl's Law</h4>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Since ~99% of the work (the nested loops over all cells) is parallelizable, the theoretical
                speedup approaches N for N processors. The only serial bottleneck is the grid swap between generations,
                which is O(1) coordination overhead.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Simple syntax highlighting for C code */
function highlightCode(code: string): React.ReactNode {
  // Split into lines and process each
  const lines = code.split('\n');
  return lines.map((line, i) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;

    // Highlight comments
    const commentIdx = remaining.indexOf('//');
    let comment = '';
    if (commentIdx >= 0) {
      comment = remaining.substring(commentIdx);
      remaining = remaining.substring(0, commentIdx);
    }

    // Highlight preprocessor directives
    if (remaining.trim().startsWith('#pragma')) {
      parts.push(
        <span key={key++} className="text-purple-400">
          {remaining}
        </span>
      );
      remaining = '';
    }

    // Highlight keywords
    const keywords = ['void', 'int', 'float', 'if', 'else', 'for', 'return', '__global__', 'const', 'dim3'];
    const types = ['MPI_INT', 'MPI_COMM_WORLD'];
    const functions = [
      'hasBurningNeighbor', 'MPI_Sendrecv', 'updateCell', 'updateKernel',
      'blockIdx', 'blockDim', 'threadIdx',
    ];
    const constants = ['FIRE', 'TREE', 'EMPTY', 'SIZE', 'NULL'];

    if (remaining) {
      // Simple token-based highlighting
      const tokens = remaining.split(/(\b)/);
      tokens.forEach((token) => {
        if (keywords.includes(token)) {
          parts.push(<span key={key++} className="text-purple-400">{token}</span>);
        } else if (types.includes(token)) {
          parts.push(<span key={key++} className="text-cyan-400">{token}</span>);
        } else if (functions.includes(token)) {
          parts.push(<span key={key++} className="text-yellow-300">{token}</span>);
        } else if (constants.includes(token)) {
          parts.push(<span key={key++} className="text-orange-400">{token}</span>);
        } else {
          parts.push(<span key={key++}>{token}</span>);
        }
      });
    }

    if (comment) {
      parts.push(
        <span key={key++} className="text-gray-600 italic">
          {comment}
        </span>
      );
    }

    return (
      <span key={i}>
        {parts}
        {i < lines.length - 1 ? '\n' : ''}
      </span>
    );
  });
}
