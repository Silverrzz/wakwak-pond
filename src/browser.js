import { Session } from './session.js';
import { Analysis } from './analysis.js';
import { opposite, sideName } from './rules.js';

const profile = {
  id: 'wakwak',
  name: 'Wakwak',
  addedOrder: 1,
  file: new URL(
    `${import.meta.env.BASE_URL}engines/wakwak-0.14.0/wakwak.worker.js`,
    document.baseURI
  ).href,
  settings: { Threads: 1, Hash: 32 }
};
const resolveEngine = (id) => {
  if (id !== profile.id) throw new Error('Choose Wakwak to play or analyse.');
  return profile;
};
const session = new Session(resolveEngine, () => {});
const analysis = new Analysis(resolveEngine, () => {});
const subscribe = (source, name) => (callback) => {
  const listener = (value) => callback(structuredClone(value));
  source.on(name, listener);
  return () => source.off(name, listener);
};
const playerName = (side) => (session.config[side] === 'human' ? 'You' : 'Wakwak');
let saveTimer;
let restored = false;

function persist() {
  if (session.phase === 'ready' || session.game.pending) return;
  try {
    localStorage.setItem('wakwak-game', session.savePgn(playerName));
  } catch {}
}

session.on('state', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 250);
});

async function saveGame() {
  const text = analysis.enabled ? analysis.pgn() : session.savePgn(playerName);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `wakwak-${new Date().toISOString().slice(0, 10)}.pgn`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

window.pond = {
  async initial() {
    if (!restored) {
      restored = true;
      try {
        const saved = localStorage.getItem('wakwak-game');
        if (saved) session.loadPgn(saved, (id) => (id === 'human' ? 'human' : 'wakwak'));
      } catch {
        localStorage.removeItem('wakwak-game');
      }
    }
    return { state: session.snapshot(), analysis: analysis.snapshot(), engines: [profile] };
  },
  async start(config) {
    analysis.close();
    await session.start(config);
  },
  pause: async () => session.pause(),
  resume: async () => session.resume(),
  move: async (data) => session.move(data),
  cancelPiece: async () => session.cancelPiece(),
  takeback: async () => {
    session.takeback();
    if (session.phase === 'paused') await session.resume();
  },
  review: async (ply) => ({ ...session.game.at(ply), ply, searches: session.searchData.view(ply) }),
  startAnalysis: async (data) => analysis.select(session, data),
  restoreAnalysis: async () => {
    if (!analysis.game || analysis.gameId !== session.id) return false;
    analysis.enabled = true;
    analysis.changed();
    return true;
  },
  stopAnalysis: async () => analysis.close(),
  analysisMove: async (data) => analysis.move(data),
  analysisBack: async (data) => analysis.back(data),
  analysisReset: async (data) => analysis.reset(data),
  analysisSettings: async (data) => analysis.settings(data),
  copyAnalysisFen: async (data) => {
    analysis.requirePosition(data);
    if (analysis.game.pending) throw new Error('Place the duck or undo the piece move first.');
    await navigator.clipboard.writeText(analysis.game.fen());
  },
  copyFen: async (ply) => navigator.clipboard.writeText(session.game.at(ply).fen),
  resign: async () => {
    if (!['playing', 'paused'].includes(session.phase)) return;
    const human = ['w', 'b'].find((side) => session.config[side] === 'human');
    if (!human) return;
    if (session.game.pending) session.game.cancelPiece();
    session.finish(`${sideName(opposite(human))} wins by resignation`, opposite(human));
  },
  saveGame,
  onState: subscribe(session, 'state'),
  onClock: subscribe(session, 'clock'),
  onInfo: subscribe(session, 'info'),
  onAnalysis: subscribe(analysis, 'state')
};

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  persist();
});
window.addEventListener('pagehide', () => {
  persist();
  analysis.close();
});
