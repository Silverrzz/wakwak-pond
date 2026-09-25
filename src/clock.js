const { performance } = require('node:perf_hooks');

function number(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  return value;
}

function normalizeControl(input = {}) {
  const mode = input.mode || 'clock';
  if (!['clock', 'movetime', 'unlimited'].includes(mode)) throw new Error('Invalid time control.');
  if (mode === 'movetime')
    return { mode, milliseconds: number(input.milliseconds, 10, 3600000, 'Time per move') };
  if (mode === 'unlimited')
    return {
      mode,
      engineTime: number(input.engineTime ?? 1000, 10, 3600000, 'Engine thinking time')
    };
  if (!Array.isArray(input.stages) || !input.stages.length || input.stages.length > 8)
    throw new Error('A clock needs between one and eight stages.');
  const stages = input.stages.map((stage, i) => {
    const final = i === input.stages.length - 1;
    const moves = number(
      stage.moves,
      final ? 0 : 1,
      final ? 0 : 1000,
      final ? 'Final-stage move limit' : 'Moves in stage'
    );
    const time = number(stage.time, i === 0 ? 1000 : 0, 604800000, 'Stage time in milliseconds');
    const bonus = number(stage.bonus ?? 0, 0, 3600000, 'Bonus in milliseconds');
    const kind = stage.kind || 'increment';
    if (!['increment', 'delay', 'bronstein'].includes(kind))
      throw new Error('Choose increment, simple delay or Bronstein delay.');
    return { moves, time, bonus, kind };
  });
  return { mode, stages };
}

class GameClock {
  constructor(controls) {
    this.controls = { w: normalizeControl(controls.w), b: normalizeControl(controls.b) };
    this.sides = {};
    for (const side of ['w', 'b']) {
      const control = this.controls[side];
      this.sides[side] = {
        remaining:
          control.mode === 'clock'
            ? control.stages[0].time
            : control.mode === 'movetime'
              ? control.milliseconds
              : null,
        stage: 0,
        moves: 0
      };
    }
    this.active = null;
    this.started = null;
    this.spent = 0;
  }

  stage(side) {
    return this.controls[side].stages?.[this.sides[side].stage];
  }
  elapsed(now = performance.now()) {
    return this.spent + (this.started === null ? 0 : Math.max(0, now - this.started));
  }

  display(side, now = performance.now()) {
    const c = this.controls[side],
      s = this.sides[side];
    const elapsed = side === this.active ? this.elapsed(now) : 0;
    const stage = this.stage(side);
    const charge = stage?.kind === 'delay' ? Math.max(0, elapsed - stage.bonus) : elapsed;
    return {
      ...s,
      mode: c.mode,
      remaining: s.remaining === null ? null : Math.max(0, s.remaining - charge),
      delay:
        stage?.kind === 'delay' && side === this.active ? Math.max(0, stage.bonus - elapsed) : 0,
      bonus: stage?.bonus || 0,
      kind: stage?.kind,
      movesToGo: stage?.moves ? stage.moves - s.moves : null,
      running: side === this.active && this.started !== null
    };
  }

  start(side) {
    if (this.active !== side) {
      this.active = side;
      this.spent = 0;
    }
    if (this.started === null) this.started = performance.now();
  }

  pause() {
    if (this.started !== null) {
      this.spent = this.elapsed();
      this.started = null;
    }
  }

  expired() {
    return this.active && this.display(this.active).remaining === 0 ? this.active : null;
  }

  complete(side) {
    const c = this.controls[side],
      s = this.sides[side],
      stage = this.stage(side);
    const elapsed = this.elapsed();
    if (c.mode === 'clock') {
      s.remaining = this.display(side).remaining;
      if (stage.kind === 'increment') s.remaining += stage.bonus;
      if (stage.kind === 'bronstein') s.remaining += Math.min(stage.bonus, elapsed);
      s.moves++;
      if (stage.moves && s.moves >= stage.moves) {
        s.stage++;
        s.moves = 0;
        s.remaining += this.stage(side).time;
      }
    } else if (c.mode === 'movetime') s.remaining = c.milliseconds;
    this.active = null;
    this.started = null;
    this.spent = 0;
  }

  limits(side, engine) {
    const c = this.controls[side];
    if (c.mode === 'unlimited')
      return { command: `movetime ${c.engineTime}`, timeout: c.engineTime + 10000 };
    const remaining = this.display(side).remaining;
    if (c.mode === 'movetime')
      return {
        command: `movetime ${Math.max(1, Math.floor(remaining - 30))}`,
        timeout: remaining + 10000
      };
    const stage = this.stage(side),
      bonus = stage.bonus;
    const parts = [];
    for (const s of ['w', 'b']) {
      const d = this.display(s),
        st = this.stage(s);
      const time = d.remaining ?? remaining;
      parts.push(`${s}time ${Math.max(1, Math.floor(time + d.delay))}`);
      parts.push(`${s}inc ${st?.kind === 'increment' ? st.bonus : 0}`);
    }
    if (engine.supportsMovesToGo && this.display(side).movesToGo)
      parts.push(`movestogo ${this.display(side).movesToGo}`);
    if (stage.kind !== 'increment' && bonus) {
      const availableDelay =
        stage.kind === 'delay' ? this.display(side).delay : Math.max(0, bonus - this.elapsed());
      const allocation = Math.min(
        remaining + this.display(side).delay,
        remaining / 25 + availableDelay
      );
      return {
        command: `movetime ${Math.max(1, Math.floor(allocation - 30))}`,
        timeout: allocation + 10000
      };
    }
    return { command: parts.join(' '), timeout: remaining + 10000 };
  }

  snapshot() {
    return { w: this.display('w'), b: this.display('b'), controls: structuredClone(this.controls) };
  }

  save() {
    return { sides: structuredClone(this.sides), active: this.active, spent: this.elapsed() };
  }
  restore(saved) {
    this.sides = structuredClone(saved.sides);
    this.active = saved.active;
    this.spent = saved.spent;
    this.started = null;
  }
}

module.exports = { GameClock, normalizeControl };
