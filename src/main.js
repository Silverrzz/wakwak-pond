const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, powerMonitor } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Session } = require('./session');
const { Analysis } = require('./analysis');
const { DuckGame, sideName } = require('./rules');
const { Engine } = require('./engine');
const { importEngine, isEngineExecutable } = require('./engine-library');

if (!app.requestSingleInstanceLock()) app.exit(0);

if (process.platform === 'win32') app.setAppUserModelId('app.thepond.chess');

let window;
let catalog = new Map();
let preferences = { imported: [], settings: {}, aliases: {}, engineOrder: [] };
let logs = [];
let logTimer;
let saveTimer;
let saveChain = Promise.resolve();
const probes = new Set();
const engineDirectory = () => path.join(app.getAppPath(), 'engines');
const dataFile = (name) => path.join(app.getPath('userData'), name);
const engineId = (id) => preferences.aliases[id] || id;
const importGame = (text) => session.loadPgn(text, engineId);
app.on('second-instance', () => {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});
const send = (name, data) => {
  if (window && !window.isDestroyed()) window.webContents.send(name, data);
};
const log = (engine, direction, text) => {
  logs.push(`${new Date().toLocaleTimeString()}  ${engine} ${direction} ${text}`);
  if (logs.length > 600) logs.splice(0, logs.length - 600);
  if (!logTimer)
    logTimer = setTimeout(() => {
      logTimer = null;
      send('logs', logs);
    }, 250);
};
const resolveEngine = (id) => {
  const profile = catalog.get(engineId(id));
  if (!profile)
    throw new Error(
      'An engine is missing. Open Engines to add it again or start a new game with another player.'
    );
  return { ...profile, settings: preferences.settings[profile.id] || {} };
};
const session = new Session(resolveEngine, log);
const analysis = new Analysis(resolveEngine, log);
analysis.on('state', (state) => send('analysis', state));

const writeJson = (file, data) => writeText(file, JSON.stringify(data, null, 2));

async function writeText(file, text) {
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file + '.tmp', text, 'utf8');
      await fs.rename(file + '.tmp', file);
    });
  return saveChain;
}

session.on('state', (state) => {
  if (
    analysis.enabled &&
    (state.id !== analysis.gameId || ['playing', 'starting'].includes(state.phase))
  )
    analysis.close();
  send('state', state);
  clearTimeout(saveTimer);
  if (state.phase !== 'ready')
    saveTimer = setTimeout(() => {
      void writeText(dataFile('last-game.pgn'), pgn()).catch((error) =>
        log('Save', '!', error.message)
      );
    }, 300);
});
session.on('clock', (clock) => send('clock', clock));
session.on('info', (info) => send('info', info));

async function scan() {
  const root = engineDirectory();
  await fs.mkdir(root, { recursive: true });
  const found = new Map();
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if ((entry.isFile() || entry.isSymbolicLink()) && (await isEngineExecutable(file))) {
        const id = path.relative(root, file);
        const stat = await fs.stat(file);
        found.set(id, {
          id,
          file,
          name: entry.name.replace(/\.exe$/i, ''),
          addedAt: stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.ctimeMs
        });
      }
    }
  }
  await visit(root);
  const known = new Set(preferences.engineOrder);
  const order = [
    ...preferences.engineOrder.filter((id) => found.has(id)),
    ...[...found.values()]
      .filter(({ id }) => !known.has(id))
      .sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id))
      .map(({ id }) => id)
  ];
  if (JSON.stringify(order) !== JSON.stringify(preferences.engineOrder)) {
    preferences.engineOrder = order;
    await writeJson(dataFile('preferences.json'), preferences);
  }
  const addedOrder = new Map(order.map((id, index) => [id, index]));
  catalog = found;
  return [...found.values()]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map(({ id, name, file }) => ({
      id,
      name,
      file,
      addedOrder: addedOrder.get(id),
      settings: preferences.settings[id] || {}
    }));
}

async function inspect(id) {
  const profile = catalog.get(id);
  if (!profile) throw new Error('Engine is unavailable. Refresh the list.');
  if (probes.size >= 2) throw new Error('Wait for the current engine inspection to finish.');
  const engine = new Engine(profile.file, log);
  probes.add(engine);
  try {
    return { ...(await engine.handshake()), settings: preferences.settings[id] || {} };
  } finally {
    engine.close();
    probes.delete(engine);
  }
}

function pgn() {
  return session.savePgn(
    (side) =>
      session.config.playerNames?.[side] ||
      (session.config[side] === 'human'
        ? 'Human'
        : catalog.get(engineId(session.config[side]))?.name || session.config[side])
  );
}

async function readPgn(file) {
  if (path.extname(file).toLowerCase() !== '.pgn') throw new Error('Choose a .pgn game file.');
  if ((await fs.stat(file)).size > 20000000) throw new Error('This game file is too large.');
  return fs.readFile(file, 'utf8');
}

app
  .whenReady()
  .then(async () => {
    try {
      const loaded = JSON.parse(await fs.readFile(dataFile('preferences.json'), 'utf8'));
      preferences = {
        imported: Array.isArray(loaded.imported)
          ? loaded.imported.filter((x) => typeof x === 'string')
          : [],
        settings: loaded.settings && typeof loaded.settings === 'object' ? loaded.settings : {},
        aliases: loaded.aliases && typeof loaded.aliases === 'object' ? loaded.aliases : {},
        engineOrder: Array.isArray(loaded.engineOrder)
          ? [...new Set(loaded.engineOrder.filter((id) => typeof id === 'string'))]
          : []
      };
    } catch {}
    await fs.mkdir(engineDirectory(), { recursive: true });
    for (const file of preferences.imported) {
      if (Object.hasOwn(preferences.aliases, file)) continue;
      try {
        const target = await importEngine(engineDirectory(), file);
        preferences.aliases[file] = path.relative(engineDirectory(), target);
        await writeJson(dataFile('preferences.json'), preferences);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    preferences.imported = [];
    for (const [id, settings] of Object.entries(preferences.settings)) {
      const target = engineId(id);
      if (target !== id) {
        preferences.settings[target] ??= settings;
        delete preferences.settings[id];
      }
    }
    await writeJson(dataFile('preferences.json'), preferences);
    await scan();
    try {
      importGame(await readPgn(dataFile('last-game.pgn')));
    } catch (error) {
      if (error.code !== 'ENOENT') log('Restore', '!', error.message);
    }
    window = new BrowserWindow({
      width: 1480,
      height: 960,
      minWidth: 760,
      minHeight: 620,
      backgroundColor: '#242424',
      title: 'The Pond',
      icon: path.join(__dirname, 'icon.png'),
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    const handle = (name, action) =>
      ipcMain.handle(name, async (event, data) => {
        if (
          !window ||
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame
        )
          return { error: 'Invalid sender.' };
        try {
          return { value: await action(data) };
        } catch (error) {
          return { error: error.message };
        }
      });
    handle('initial', async () => ({
      state: session.snapshot(),
      engines: await scan(),
      directory: engineDirectory(),
      analysis: analysis.snapshot(),
      logs
    }));
    handle('scan', scan);
    handle('folder', async () => {
      const error = await shell.openPath(engineDirectory());
      if (error) throw new Error(error);
    });
    handle('add-engine', async (kind) => {
      const folder = kind === 'folder';
      const result = await dialog.showOpenDialog(
        window,
        folder
          ? {
              title: 'Add an engine folder with its supporting files',
              properties: ['openDirectory']
            }
          : {
              title: 'Add a duck UCI engine',
              properties: ['openFile'],
              filters: [
                {
                  name: 'UCI engine',
                  extensions: process.platform === 'win32' ? ['exe'] : ['*']
                }
              ]
            }
      );
      if (result.canceled) return null;
      const source = result.filePaths[0];
      const target = await importEngine(engineDirectory(), source, folder);
      if (!folder) preferences.aliases[source] = path.relative(engineDirectory(), target);
      await writeJson(dataFile('preferences.json'), preferences);
      return scan();
    });
    handle('inspect-engine', inspect);
    handle('engine-settings', async ({ id, settings }) => {
      const profile = await inspect(id);
      const clean = {};
      const managed = [
        'UCI_Variant',
        'UCI_Chess960',
        'UseDumbInterface',
        'SoftTarget',
        'Minimal',
        'Ponder'
      ];
      for (const [name, value] of Object.entries(settings || {})) {
        const o = profile.options.find((option) => option.name === name);
        if (!o || managed.includes(name) || o.type === 'button') continue;
        const text = String(value);
        if (
          /[\r\n]/.test(text) ||
          text.length > 4096 ||
          (o.type === 'spin' &&
            (!Number.isInteger(Number(value)) ||
              Number(value) < Number(o.min) ||
              Number(value) > Number(o.max))) ||
          (o.type === 'check' && !['true', 'false'].includes(text)) ||
          (o.type === 'combo' && !o.vars.includes(text))
        )
          throw new Error(`Invalid engine setting: ${name}`);
        clean[name] = text;
      }
      preferences.settings[id] = clean;
      await writeJson(dataFile('preferences.json'), preferences);
      return scan();
    });
    handle('preview', (config) => new DuckGame(config).snapshot());
    handle('start', (config) => session.start(config));
    handle('pause', () => session.pause());
    handle('resume', () => session.resume());
    handle('move', (data) => session.move(data));
    handle('cancel-piece', () => session.cancelPiece());
    handle('takeback', () => session.takeback());
    handle('analysis-start', (data) => analysis.select(session, data));
    handle('analysis-open-pgn', async () => {
      const result = await dialog.showOpenDialog(window, {
        title: 'Choose a PGN to analyse',
        properties: ['openFile'],
        filters: [{ name: 'PGN game', extensions: ['pgn'] }]
      });
      return result.canceled ? null : readPgn(result.filePaths[0]);
    });
    handle('analysis-stop', () => analysis.close());
    handle('analysis-move', (data) => analysis.move(data));
    handle('analysis-back', (data) => analysis.back(data));
    handle('analysis-reset', (data) => analysis.reset(data));
    handle('analysis-settings', (data) => analysis.settings(data));
    handle('analysis-copy-fen', (data) => {
      analysis.requirePosition(data);
      if (analysis.game.pending) throw new Error('Complete or undo the piece move first.');
      clipboard.writeText(analysis.game.fen());
    });
    handle('review', (ply) => ({
      ...session.game.at(ply),
      ply,
      searches: session.searchData.view(ply)
    }));
    handle('resign', () => {
      if (
        !['playing', 'paused'].includes(session.phase) ||
        session.config[session.game.turn] !== 'human'
      )
        throw new Error('Only the human player on turn can resign.');
      if (session.game.pending) session.game.cancelPiece();
      session.finish(
        `${sideName(session.game.turn === 'w' ? 'b' : 'w')} wins by resignation`,
        session.game.turn === 'w' ? 'b' : 'w'
      );
    });
    handle('draw', () => {
      if (
        !['playing', 'paused'].includes(session.phase) ||
        session.config.w !== 'human' ||
        session.config.b !== 'human'
      )
        throw new Error('Draw agreement is available for two human players.');
      if (session.game.pending) session.game.cancelPiece();
      session.finish('Draw by agreement');
    });
    handle('copy-fen', (ply) => {
      clipboard.writeText(session.game.at(ply).fen);
    });
    handle('save-game', async () => {
      const contents = analysis.enabled ? analysis.pgn() : pgn();
      const result = await dialog.showSaveDialog(window, {
        title: 'Save PGN game',
        defaultPath: 'game-' + new Date().toISOString().slice(0, 10) + '.pgn',
        filters: [{ name: 'PGN game', extensions: ['pgn'] }]
      });
      if (result.canceled) return false;
      const file = path.extname(result.filePath) ? result.filePath : result.filePath + '.pgn';
      if (path.extname(file).toLowerCase() !== '.pgn')
        throw new Error('Save the game with a .pgn extension.');
      await writeText(file, contents);
      return true;
    });
    handle('open-game', async () => {
      const result = await dialog.showOpenDialog(window, {
        title: 'Open PGN game',
        properties: ['openFile'],
        filters: [{ name: 'PGN game', extensions: ['pgn'] }]
      });
      if (result.canceled) return false;
      importGame(await readPgn(result.filePaths[0]));
      return true;
    });
    window.on('close', () => {
      session.clock.pause();
      clearTimeout(saveTimer);
      if (session.phase !== 'ready')
        void writeText(dataFile('last-game.pgn'), pgn()).catch(() => {});
    });
    window.on('closed', () => {
      window = null;
      analysis.close();
      session.close();
    });
    powerMonitor.on('suspend', () => {
      if (analysis.enabled) analysis.settings({ revision: analysis.revision, running: false });
      if (['playing', 'starting'].includes(session.phase))
        session.pause('Paused because the computer went to sleep.');
    });
    await window.loadFile(path.join(__dirname, '../renderer-dist/index.html'));
  })
  .catch((error) => {
    dialog.showErrorBox('The Pond could not start', error.message);
    app.quit();
  });
app.on('window-all-closed', () => {
  void saveChain.catch(() => {}).finally(() => app.quit());
});
app.on('before-quit', () => {
  analysis.close();
  session.close();
  for (const engine of probes) engine.close();
  Engine.killAll();
});
