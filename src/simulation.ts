// Cell state definitions
export const EMPTY = 0;
export const TREE = 1;
export const FIRE = 2;
export const BURNED = 3; // recently burned (visual only, behaves as empty)

export type CellState = typeof EMPTY | typeof TREE | typeof FIRE | typeof BURNED;

export interface SimulationConfig {
  size: number;
  fireSpreadProb: number;
  treeDensity: number;
  regrowthProb: number;
  lightningProb: number;
}

export interface SimulationStats {
  generation: number;
  trees: number;
  fire: number;
  empty: number;
  burned: number;
  totalCells: number;
}

export const DEFAULT_CONFIG: SimulationConfig = {
  size: 150,
  fireSpreadProb: 0.65,
  treeDensity: 0.70,
  regrowthProb: 0.0,
  lightningProb: 0.0,
};

export class ForestFireSimulation {
  config: SimulationConfig;
  grid: Uint8Array;
  nextGrid: Uint8Array;
  generation: number;
  statsHistory: SimulationStats[];

  constructor(config: SimulationConfig = DEFAULT_CONFIG) {
    this.config = { ...config };
    const totalCells = config.size * config.size;
    this.grid = new Uint8Array(totalCells);
    this.nextGrid = new Uint8Array(totalCells);
    this.generation = 0;
    this.statsHistory = [];
    this.initialize();
  }

  private idx(x: number, y: number): number {
    return y * this.config.size + x;
  }

  getCell(x: number, y: number): CellState {
    if (x < 0 || x >= this.config.size || y < 0 || y >= this.config.size) return EMPTY;
    return this.grid[this.idx(x, y)] as CellState;
  }

  setCell(x: number, y: number, state: CellState): void {
    if (x < 0 || x >= this.config.size || y < 0 || y >= this.config.size) return;
    this.grid[this.idx(x, y)] = state;
  }

  initialize(): void {
    const { size, treeDensity } = this.config;
    this.generation = 0;
    this.statsHistory = [];

    for (let i = 0; i < size * size; i++) {
      this.grid[i] = Math.random() < treeDensity ? TREE : EMPTY;
    }

    // Ignite a cluster in the center
    const cx = Math.floor(size / 2);
    const cy = Math.floor(size / 2);
    const radius = Math.max(1, Math.floor(size / 30));
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
            this.grid[this.idx(nx, ny)] = FIRE;
          }
        }
      }
    }

    this.statsHistory.push(this.getStats());
  }

  private countBurningNeighbors(x: number, y: number): number {
    const s = this.config.size;
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < s && ny >= 0 && ny < s) {
          if (this.grid[this.idx(nx, ny)] === FIRE) count++;
        }
      }
    }
    return count;
  }

  step(): SimulationStats {
    const { size, fireSpreadProb, regrowthProb, lightningProb } = this.config;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = this.idx(x, y);
        const cell = this.grid[i];

        if (cell === FIRE) {
          // Burning tree burns out
          this.nextGrid[i] = BURNED;
        } else if (cell === BURNED) {
          // Burned becomes empty (or regrows)
          if (regrowthProb > 0 && Math.random() < regrowthProb) {
            this.nextGrid[i] = TREE;
          } else {
            this.nextGrid[i] = EMPTY;
          }
        } else if (cell === TREE) {
          // Tree may catch fire from neighbors
          const burningNeighbors = this.countBurningNeighbors(x, y);
          if (burningNeighbors > 0) {
            // Probability increases with more burning neighbors
            const prob = 1 - Math.pow(1 - fireSpreadProb, burningNeighbors);
            if (Math.random() < prob) {
              this.nextGrid[i] = FIRE;
            } else {
              this.nextGrid[i] = TREE;
            }
          } else if (lightningProb > 0 && Math.random() < lightningProb) {
            // Random lightning strike
            this.nextGrid[i] = FIRE;
          } else {
            this.nextGrid[i] = TREE;
          }
        } else {
          // Empty: may regrow
          if (regrowthProb > 0 && Math.random() < regrowthProb * 0.5) {
            this.nextGrid[i] = TREE;
          } else {
            this.nextGrid[i] = EMPTY;
          }
        }
      }
    }

    // Swap grids
    const temp = this.grid;
    this.grid = this.nextGrid;
    this.nextGrid = temp;

    this.generation++;
    const stats = this.getStats();
    this.statsHistory.push(stats);
    return stats;
  }

  getStats(): SimulationStats {
    const { size } = this.config;
    let trees = 0, fire = 0, empty = 0, burned = 0;
    const total = size * size;

    for (let i = 0; i < total; i++) {
      switch (this.grid[i]) {
        case TREE: trees++; break;
        case FIRE: fire++; break;
        case BURNED: burned++; break;
        default: empty++; break;
      }
    }

    return {
      generation: this.generation,
      trees,
      fire,
      empty,
      burned,
      totalCells: total,
    };
  }

  isFinished(): boolean {
    const stats = this.getStats();
    return stats.fire === 0 && this.generation > 0;
  }

  resize(newSize: number): void {
    this.config.size = newSize;
    const totalCells = newSize * newSize;
    this.grid = new Uint8Array(totalCells);
    this.nextGrid = new Uint8Array(totalCells);
    this.initialize();
  }
}
