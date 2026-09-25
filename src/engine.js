const { spawn } = require('node:child_process');
const path = require('node:path');
const children = new Set();

function parseOption(line) {
  const match = /^option name (.+?) type (check|spin|combo|button|string)(?:\s+(.*))?$/.exec(line);
  if (!match) return null;
  const option = { name: match[1], type: match[2], vars: [] };
  const tail = match[3] || '';
  for (const field of tail.matchAll(
    /(?:^|\s)(default|min|max|var)\s+(.*?)(?=\s(?:default|min|max|var)\s|$)/g
  )) {
    if (field[1] === 'var') option.vars.push(field[2]);
    else option[field[1]] = field[2];
  }
  return option;
}

class Engine {
  constructor(file, log = () => {}, failure = () => {}) {
    this.label = path.basename(file);
    this.log = log;
    this.failure = failure;
    this.options = [];
    this.waiter = null;
    this.closed = false;
    this.buffer = '';
    this.onInfo = null;
    this.child = spawn(file, [], {
      cwd: path.dirname(file),
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    children.add(this.child);
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      if (this.buffer.length > 1024 * 1024)
        return this.fail(new Error('Engine output exceeded its limit.'));
      let end;
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end).trim();
        this.buffer = this.buffer.slice(end + 1);
        this.log(this.label, '<', line.slice(0, 2000));
        if (line.startsWith('id name ')) this.label = line.slice(8, 200);
        const option = parseOption(line);
        if (option) this.options.push(option);
        if (/^info\s/.test(line) && !/^info string\s/.test(line)) this.onInfo?.(line);
        if (this.waiter?.accept(line)) {
          const waiter = this.waiter;
          this.waiter = null;
          clearTimeout(waiter.timer);
          waiter.resolve(line);
        }
      }
    });
    this.child.stderr.on('data', (chunk) =>
      this.log(this.label, '!', chunk.toString().slice(0, 2000))
    );
    this.child.on('error', (error) => this.fail(error));
    this.child.stdin.on('error', (error) => this.fail(error));
    this.child.on('exit', (code, signal) => {
      children.delete(this.child);
      clearTimeout(this.killTimer);
      if (!this.closed) this.fail(new Error(`Engine exited (${signal || code}).`));
    });
  }

  static killAll() {
    for (const child of children) child.kill();
    children.clear();
  }
  get nativeDuck() {
    return this.options.some((o) => o.name === 'UseDumbInterface');
  }
  get supportsMovesToGo() {
    return !/wakwak/i.test(this.label);
  }
  get supports960() {
    return this.options.some((o) => o.name === 'UCI_Chess960');
  }
  get supportsDuck() {
    return this.options.some((o) => o.name === 'UCI_Variant' && o.vars.includes('duck'));
  }

  send(line) {
    if (this.closed) throw new Error('Engine is closed.');
    if (/[\r\n]/.test(line)) throw new Error('Engine commands cannot contain newlines.');
    this.log(this.label, '>', line);
    this.child.stdin.write(line + '\n');
  }

  request(command, accept, timeout = 10000) {
    if (this.closed) return Promise.reject(new Error('Engine is closed.'));
    if (this.waiter) return Promise.reject(new Error('Engine is already busy.'));
    return new Promise((resolve, reject) => {
      const timer =
        timeout > 0
          ? setTimeout(
              () => this.fail(new Error(`Engine timed out after ${command.split(' ')[0]}.`)),
              Math.min(timeout, 2147483647)
            )
          : null;
      this.waiter = { accept, resolve, reject, timer };
      try {
        this.send(command);
      } catch (error) {
        this.fail(error);
      }
    });
  }

  async handshake() {
    await this.request('uci', (line) => line === 'uciok');
    return {
      name: this.label,
      options: this.options,
      duck: this.supportsDuck,
      chess960: this.supports960
    };
  }

  setOption(name, value) {
    const option = this.options.find((o) => o.name === name);
    if (!option) throw new Error(`Unsupported engine option: ${name}`);
    const text = String(value);
    if (/[\r\n]/.test(text) || text.length > 4096) throw new Error(`Invalid value for ${name}.`);
    if (
      option.type === 'spin' &&
      (!Number.isInteger(Number(value)) ||
        Number(value) < Number(option.min) ||
        Number(value) > Number(option.max))
    )
      throw new Error(`${name} must be between ${option.min} and ${option.max}.`);
    if (option.type === 'check' && !['true', 'false'].includes(text))
      throw new Error(`Invalid value for ${name}.`);
    if (option.type === 'combo' && !option.vars.includes(text))
      throw new Error(`Invalid value for ${name}.`);
    if (option.type !== 'button') this.send(`setoption name ${name} value ${text}`);
  }

  async initialize(variant = 'duck', settings = {}) {
    await this.handshake();
    if (!this.supportsDuck) throw new Error(`${this.label} does not advertise the duck variant.`);
    if (variant !== 'duck' && !this.supports960)
      throw new Error(`${this.label} does not support Duck960. Choose a compatible engine.`);
    const managed = [
      'UCI_Variant',
      'UCI_Chess960',
      'UseDumbInterface',
      'SoftTarget',
      'Minimal',
      'Ponder'
    ];
    for (const [name, value] of Object.entries(settings))
      if (!managed.includes(name)) this.setOption(name, value);
    this.setOption('UCI_Variant', 'duck');
    if (this.supports960) this.setOption('UCI_Chess960', variant !== 'duck');
    if (this.nativeDuck) this.setOption('UseDumbInterface', false);
    for (const name of ['SoftTarget', 'Minimal', 'Ponder'])
      if (this.options.some((o) => o.name === name)) this.setOption(name, false);
    await this.request('isready', (line) => line === 'readyok');
    this.send('ucinewgame');
    await this.request('isready', (line) => line === 'readyok');
  }

  position(fen, moves) {
    const encoded = this.nativeDuck
      ? moves
      : moves.map((move) => move.replace(/^(.{2})(.{2})([qrbn]?)@(.+)$/, '$1$2$3,$2$4'));
    this.send('position fen ' + fen + (encoded.length ? ' moves ' + encoded.join(' ') : ''));
  }

  async move(fen, moves, limits, onInfo) {
    this.position(fen, moves);
    this.onInfo = onInfo;
    try {
      const line = await this.request(
        'go ' + limits.command,
        (line) => /^bestmove\s/.test(line),
        limits.timeout
      );
      const move = line.split(/\s+/)[1];
      if (!move || ['0000', '(none)', 'none'].includes(move))
        throw new Error('Engine returned no move in a playable position.');
      return move;
    } finally {
      this.onInfo = null;
    }
  }

  async analyze(fen, moves, onInfo) {
    this.position(fen, moves);
    this.onInfo = onInfo;
    try {
      return await this.request('go infinite', (line) => /^bestmove\s/.test(line), 0);
    } finally {
      this.onInfo = null;
    }
  }

  fail(error) {
    if (this.closed) return;
    this.close(error);
    this.failure(new Error(`${this.label}: ${error.message}`));
  }

  close(error = new Error('Engine stopped.')) {
    if (this.closed) return;
    this.closed = true;
    if (this.waiter) {
      clearTimeout(this.waiter.timer);
      this.waiter.reject(error);
      this.waiter = null;
    }
    if (this.child.stdin.writable) this.child.stdin.end('stop\nquit\n');
    this.killTimer = setTimeout(() => this.child.kill(), 500);
    this.killTimer.unref();
  }
}

module.exports = { Engine, parseOption };
