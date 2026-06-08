import { useState, useRef, useCallback, useEffect } from 'react';
import { ForestFireSimulation, SimulationStats, DEFAULT_CONFIG } from './simulation';
import ForestCanvas from './ForestCanvas';
import StatsChart from './StatsChart';
import ParallelEducation from './ParallelEducation';
import type { ParallelMode } from './ParallelOverlay';

type BrushMode = 'fire' | 'tree' | 'empty';

function App() {
  const simRef = useRef(new ForestFireSimulation({ ...DEFAULT_CONFIG }));
  const [renderTick, setRenderTick] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [stats, setStats] = useState<SimulationStats>(simRef.current.getStats());
  const [history, setHistory] = useState<SimulationStats[]>([...simRef.current.statsHistory]);
  const [brushMode, setBrushMode] = useState<BrushMode>('fire');
  const [showCompleted, setShowCompleted] = useState(false);
  const [parallelMode, setParallelMode] = useState<ParallelMode>('none');
  const [activeSection, setActiveSection] = useState<'params' | 'parallel'>('parallel');

  // Config state
  const [gridSize, setGridSize] = useState(DEFAULT_CONFIG.size);
  const [fireSpreadProb, setFireSpreadProb] = useState(DEFAULT_CONFIG.fireSpreadProb);
  const [treeDensity, setTreeDensity] = useState(DEFAULT_CONFIG.treeDensity);
  const [regrowthProb, setRegrowthProb] = useState(DEFAULT_CONFIG.regrowthProb);
  const [lightningProb, setLightningProb] = useState(DEFAULT_CONFIG.lightningProb);

  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stepSimulation = useCallback(() => {
    const sim = simRef.current;
    const newStats = sim.step();
    setStats(newStats);
    setHistory([...sim.statsHistory]);
    setRenderTick(t => t + 1);

    if (sim.isFinished()) {
      setIsRunning(false);
      setShowCompleted(true);
    }
  }, []);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(stepSimulation, speed);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [isRunning, speed, stepSimulation]);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    setShowCompleted(false);
    const sim = new ForestFireSimulation({
      size: gridSize,
      fireSpreadProb,
      treeDensity,
      regrowthProb,
      lightningProb,
    });
    simRef.current = sim;
    setStats(sim.getStats());
    setHistory([...sim.statsHistory]);
    setRenderTick(t => t + 1);
  }, [gridSize, fireSpreadProb, treeDensity, regrowthProb, lightningProb]);

  const handleStep = () => {
    if (!isRunning) {
      stepSimulation();
    }
  };

  const treePct = ((stats.trees / stats.totalCells) * 100).toFixed(1);
  const firePct = ((stats.fire / stats.totalCells) * 100).toFixed(1);
  const emptyPct = (((stats.empty + stats.burned) / stats.totalCells) * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#111127] to-[#0d1117] text-white">
      {/* Header */}
      <header className="border-b border-gray-800/60 bg-black/30 backdrop-blur-sm">
        <div className="max-w-[1440px] mx-auto px-4 py-3 flex items-center gap-3">
          <div className="text-2xl">🔥</div>
          <div className="flex-1">
            <h1 className="text-xl font-bold bg-gradient-to-r from-orange-400 via-red-400 to-amber-400 bg-clip-text text-transparent">
              Forest Fire Simulation
            </h1>
            <p className="text-xs text-gray-500">
              Cellular Automata • Parallel Computing Visualization
            </p>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-xs text-gray-500">
            <span className="px-2 py-0.5 bg-blue-900/30 border border-blue-800/30 rounded text-blue-400">OpenMP</span>
            <span className="px-2 py-0.5 bg-green-900/30 border border-green-800/30 rounded text-green-400">MPI</span>
            <span className="px-2 py-0.5 bg-amber-900/30 border border-amber-800/30 rounded text-amber-400">CUDA</span>
          </div>
        </div>
      </header>

      <div className="max-w-[1440px] mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          {/* Main simulation area */}
          <div className="space-y-4">
            {/* Controls bar */}
            <div className="flex flex-wrap items-center gap-2 bg-gray-900/50 backdrop-blur rounded-xl p-3 border border-gray-800/50">
              <button
                onClick={() => {
                  setIsRunning(!isRunning);
                  setShowCompleted(false);
                }}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                  isRunning
                    ? 'bg-yellow-600 hover:bg-yellow-500 text-black'
                    : 'bg-green-600 hover:bg-green-500 text-white'
                }`}
              >
                {isRunning ? '⏸ Pause' : '▶ Play'}
              </button>
              <button
                onClick={handleStep}
                disabled={isRunning}
                className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ⏭ Step
              </button>
              <button
                onClick={handleReset}
                className="px-3 py-2 rounded-lg bg-red-700/80 hover:bg-red-600 text-sm font-medium transition-all"
              >
                ↻ Reset
              </button>

              <div className="h-6 w-px bg-gray-700 mx-1" />

              {/* Speed control */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Speed:</span>
                <input
                  type="range"
                  min="10"
                  max="500"
                  value={510 - speed}
                  onChange={e => setSpeed(510 - parseInt(e.target.value))}
                  className="w-20 accent-orange-500"
                />
                <span className="text-xs text-gray-500 w-12">{speed}ms</span>
              </div>

              <div className="h-6 w-px bg-gray-700 mx-1" />

              {/* Brush mode */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400 mr-1">Brush:</span>
                {([
                  ['fire', '🔥', 'bg-red-700'],
                  ['tree', '🌲', 'bg-green-700'],
                  ['empty', '⬛', 'bg-gray-700'],
                ] as [BrushMode, string, string][]).map(([mode, icon, color]) => (
                  <button
                    key={mode}
                    onClick={() => setBrushMode(mode)}
                    className={`px-2 py-1 rounded text-sm transition-all ${
                      brushMode === mode
                        ? `${color} ring-2 ring-white/50 scale-105`
                        : 'bg-gray-800 hover:bg-gray-700 opacity-60'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>

              {/* Generation counter */}
              <div className="ml-auto text-right">
                <div className="text-lg font-mono font-bold text-amber-400">
                  Gen {stats.generation}
                </div>
              </div>
            </div>

            {/* Canvas */}
            <div className="bg-gray-900/30 rounded-xl p-2 border border-gray-800/50 relative">
              <ForestCanvas
                simulation={simRef.current}
                renderTick={renderTick}
                brushMode={brushMode}
                parallelMode={parallelMode}
              />

              {/* Parallel mode indicator badge */}
              {parallelMode !== 'none' && (
                <div className="absolute top-4 left-4 z-10">
                  <div className={`px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm border ${
                    parallelMode === 'openmp'
                      ? 'bg-blue-900/70 border-blue-500/50 text-blue-300'
                      : parallelMode === 'mpi'
                      ? 'bg-green-900/70 border-green-500/50 text-green-300'
                      : 'bg-amber-900/70 border-amber-500/50 text-amber-300'
                  }`}>
                    {parallelMode === 'openmp' && '🧵 OpenMP — Row partitioning across CPU threads'}
                    {parallelMode === 'mpi' && '🌐 MPI — Block decomposition across processes'}
                    {parallelMode === 'cuda' && '🎮 CUDA — Thread-per-cell on GPU'}
                  </div>
                </div>
              )}

              {showCompleted && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl backdrop-blur-sm z-20">
                  <div className="text-center p-6 bg-gray-900/90 rounded-2xl border border-gray-700 shadow-2xl">
                    <div className="text-4xl mb-2">🏁</div>
                    <h3 className="text-xl font-bold text-amber-400 mb-1">Fire Extinguished!</h3>
                    <p className="text-gray-400 text-sm mb-1">
                      Completed in <span className="text-white font-semibold">{stats.generation}</span> generations
                    </p>
                    <p className="text-gray-400 text-sm mb-3">
                      <span className="text-green-400">{treePct}%</span> trees survived
                    </p>
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-semibold transition-all"
                    >
                      Run New Simulation
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                icon="🌲"
                label="Trees"
                value={stats.trees.toLocaleString()}
                percent={treePct}
                color="text-green-400"
                barColor="bg-green-500"
                barPct={parseFloat(treePct)}
              />
              <StatCard
                icon="🔥"
                label="Burning"
                value={stats.fire.toLocaleString()}
                percent={firePct}
                color="text-red-400"
                barColor="bg-red-500"
                barPct={parseFloat(firePct)}
              />
              <StatCard
                icon="⬛"
                label="Empty/Burned"
                value={(stats.empty + stats.burned).toLocaleString()}
                percent={emptyPct}
                color="text-gray-400"
                barColor="bg-gray-500"
                barPct={parseFloat(emptyPct)}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Population chart */}
            <div className="bg-gray-900/50 backdrop-blur rounded-xl p-3 border border-gray-800/50">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">📊 Population Over Time</h3>
              <div className="h-[140px]">
                <StatsChart history={history} />
              </div>
              <div className="flex gap-3 mt-2 justify-center">
                <span className="flex items-center gap-1 text-xs">
                  <span className="w-3 h-1 bg-green-500 rounded-full inline-block" /> Trees
                </span>
                <span className="flex items-center gap-1 text-xs">
                  <span className="w-3 h-1 bg-red-500 rounded-full inline-block" /> Fire
                </span>
                <span className="flex items-center gap-1 text-xs">
                  <span className="w-3 h-1 bg-gray-500 rounded-full inline-block" /> Empty
                </span>
              </div>
            </div>

            {/* Section toggle */}
            <div className="flex rounded-lg bg-gray-800/50 p-0.5">
              <button
                onClick={() => setActiveSection('parallel')}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeSection === 'parallel'
                    ? 'bg-amber-600/80 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                ⚡ Parallel Computing
              </button>
              <button
                onClick={() => setActiveSection('params')}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeSection === 'params'
                    ? 'bg-gray-600/80 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                ⚙️ Parameters
              </button>
            </div>

            {/* Parallel education panel */}
            {activeSection === 'parallel' && (
              <ParallelEducation
                activeMode={parallelMode}
                onModeChange={setParallelMode}
              />
            )}

            {/* Parameters panel */}
            {activeSection === 'params' && (
              <>
                <div className="bg-gray-900/50 backdrop-blur rounded-xl p-3 border border-gray-800/50 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-300">⚙️ Simulation Parameters</h3>
                  <p className="text-xs text-gray-500">Changes apply on reset</p>

                  <SliderParam
                    label="Grid Size"
                    value={gridSize}
                    min={50}
                    max={300}
                    step={10}
                    onChange={setGridSize}
                    display={`${gridSize}×${gridSize}`}
                  />
                  <SliderParam
                    label="Fire Spread Probability"
                    value={fireSpreadProb}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={setFireSpreadProb}
                    display={`${(fireSpreadProb * 100).toFixed(0)}%`}
                  />
                  <SliderParam
                    label="Tree Density"
                    value={treeDensity}
                    min={0.1}
                    max={1}
                    step={0.05}
                    onChange={setTreeDensity}
                    display={`${(treeDensity * 100).toFixed(0)}%`}
                  />
                  <SliderParam
                    label="Regrowth Rate"
                    value={regrowthProb}
                    min={0}
                    max={0.1}
                    step={0.005}
                    onChange={setRegrowthProb}
                    display={`${(regrowthProb * 100).toFixed(1)}%`}
                  />
                  <SliderParam
                    label="Lightning Probability"
                    value={lightningProb}
                    min={0}
                    max={0.001}
                    step={0.00005}
                    onChange={setLightningProb}
                    display={`${(lightningProb * 100).toFixed(3)}%`}
                  />
                </div>

                {/* Rules */}
                <div className="bg-gray-900/50 backdrop-blur rounded-xl p-3 border border-gray-800/50">
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">📜 Cellular Automata Rules</h3>
                  <ul className="text-xs text-gray-400 space-y-1.5">
                    <li className="flex gap-2">
                      <span className="text-red-400 shrink-0">1.</span>
                      <span>Burning trees → empty ash next generation</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-orange-400 shrink-0">2.</span>
                      <span>Trees adjacent to fire catch fire probabilistically</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-yellow-400 shrink-0">3.</span>
                      <span>More burning neighbors = higher ignition probability</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-green-400 shrink-0">4.</span>
                      <span>Empty cells may regrow trees (if regrowth enabled)</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-blue-400 shrink-0">5.</span>
                      <span>Lightning can randomly ignite trees (if enabled)</span>
                    </li>
                  </ul>
                </div>

                {/* Interaction guide */}
                <div className="bg-gray-900/50 backdrop-blur rounded-xl p-3 border border-gray-800/50">
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">🖱️ Interaction</h3>
                  <ul className="text-xs text-gray-400 space-y-1">
                    <li>• Click & drag on grid to paint cells</li>
                    <li>• Select brush: 🔥 Fire, 🌲 Tree, or ⬛ Erase</li>
                    <li>• Use Step to advance one generation at a time</li>
                    <li>• Enable Regrowth + Lightning for endless mode</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  percent,
  color,
  barColor,
  barPct,
}: {
  icon: string;
  label: string;
  value: string;
  percent: string;
  color: string;
  barColor: string;
  barPct: number;
}) {
  return (
    <div className="bg-gray-900/50 rounded-xl p-3 border border-gray-800/50">
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mb-1.5">{percent}%</div>
      <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-300`}
          style={{ width: `${Math.min(barPct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function SliderParam({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs font-mono text-amber-400">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-orange-500 h-1"
      />
    </div>
  );
}

export default App;
