const { contextBridge, ipcRenderer } = require('electron');
const call = async (name, data) => {
  const result = await ipcRenderer.invoke(name, data);
  if (result.error) throw new Error(result.error);
  return result.value;
};
const subscribe = (name) => (callback) => {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(name, listener);
  return () => ipcRenderer.removeListener(name, listener);
};
contextBridge.exposeInMainWorld('pond', {
  initial: () => call('initial'),
  scan: () => call('scan'),
  folder: () => call('folder'),
  addEngine: (kind) => call('add-engine', kind),
  inspectEngine: (id) => call('inspect-engine', id),
  engineSettings: (data) => call('engine-settings', data),
  preview: (data) => call('preview', data),
  start: (data) => call('start', data),
  pause: () => call('pause'),
  resume: () => call('resume'),
  move: (data) => call('move', data),
  cancelPiece: () => call('cancel-piece'),
  takeback: () => call('takeback'),
  review: (ply) => call('review', ply),
  startAnalysis: (data) => call('analysis-start', data),
  openAnalysisPgn: () => call('analysis-open-pgn'),
  stopAnalysis: () => call('analysis-stop'),
  analysisMove: (data) => call('analysis-move', data),
  analysisBack: (data) => call('analysis-back', data),
  analysisReset: (data) => call('analysis-reset', data),
  analysisSettings: (data) => call('analysis-settings', data),
  copyAnalysisFen: (data) => call('analysis-copy-fen', data),
  resign: () => call('resign'),
  draw: () => call('draw'),
  copyFen: (ply) => call('copy-fen', ply),
  saveGame: () => call('save-game'),
  openGame: () => call('open-game'),
  onState: subscribe('state'),
  onClock: subscribe('clock'),
  onInfo: subscribe('info'),
  onAnalysis: subscribe('analysis'),
  onLogs: subscribe('logs')
});
