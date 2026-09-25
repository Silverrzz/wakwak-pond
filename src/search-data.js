const randomUUID = () => crypto.randomUUID();

const channels = ['w', 'b'];
const metrics = ['depth', 'seldepth', 'multipv', 'time', 'nodes', 'nps', 'hashfull', 'tbhits'];
const rowKey = (row) => `${row.depth}:${row.multipv || 1}`;

class SearchData {
  constructor() {
    this.current = { w: null, b: null };
    this.archive = [];
    this.points = new Map();
  }

  start(channel, side, source, ply) {
    this.stop(channel);
    const search = {
      id: randomUUID(),
      channel,
      side,
      source,
      ply,
      active: true,
      rows: [],
      latest: {}
    };
    this.current[channel] = search;
    this.archive = this.archive.filter((s) => s.channel !== channel || s.ply !== ply);
    this.archive.push(search);
    this.prune();
    return search;
  }

  stop(channel) {
    if (this.current[channel]) this.current[channel].active = false;
    this.prune();
  }

  prune() {
    let size = 0;
    this.archive = this.archive.filter(
      (s) => s.rows.length || s.active || Object.values(this.current).includes(s)
    );
    for (let i = this.archive.length - 1; i >= 0; i--) {
      size += JSON.stringify(this.archive[i]).length;
      if (
        (size > 4000000 || this.archive.length - i > 512) &&
        !Object.values(this.current).includes(this.archive[i])
      )
        this.archive.splice(i, 1);
    }
  }

  update(line, channel) {
    const search = this.current[channel];
    if (!search?.active || !/^info\s/.test(line) || /^info\s+string\b/.test(line)) return null;
    const fields = {};
    for (const key of metrics) {
      const match = new RegExp('(?:^|\\s)' + key + '\\s+(\\d+)').exec(line);
      if (match && Number.isSafeInteger(Number(match[1]))) fields[key] = Number(match[1]);
    }
    const score = /\bscore (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?/.exec(line);
    if (score && Number.isSafeInteger(Number(score[2]))) {
      fields.score = Number(score[2]) * (search.side === 'w' ? 1 : -1);
      fields.scoreType = score[1];
      fields.bound = score[3] || null;
      if (search.side === 'b' && fields.bound)
        fields.bound = fields.bound === 'lowerbound' ? 'upperbound' : 'lowerbound';
      if (fields.scoreType === 'mate')
        fields.mateWinner = Number(score[2]) > 0 ? search.side : search.side === 'w' ? 'b' : 'w';
    }
    const pv = /\bpv\s+(.+)/.exec(line);
    if (pv)
      fields.pv = pv[1]
        .trim()
        .slice(0, 2048)
        .replace(/,([a-h][1-8])([a-h][1-8])/g, '@$2');
    const currentMove = /\bcurrmove\s+(\S+)/.exec(line);
    if (currentMove) fields.currmove = currentMove[1].slice(0, 32);
    if (!Object.keys(fields).length) return null;
    let row = null,
      evaluation = null;
    if (fields.depth !== undefined && (fields.score !== undefined || fields.pv)) {
      fields.multipv ||= 1;
      const index = search.rows.findIndex((r) => rowKey(r) === rowKey(fields));
      row = { ...(index < 0 ? {} : search.rows[index]), ...fields };
      if (index < 0) search.rows.push(row);
      else search.rows[index] = row;
      if (search.rows.length > 128) search.rows.shift();
      search.latest = {
        ...Object.fromEntries(
          ['hashfull', 'tbhits', 'currmove']
            .filter((key) => search.latest[key] !== undefined)
            .map((key) => [key, search.latest[key]])
        ),
        ...row
      };
      if (row.multipv === 1 && row.score !== undefined) {
        evaluation = {
          channel,
          side: search.side,
          source: search.source,
          ply: search.ply,
          depth: row.depth,
          score: row.score,
          scoreType: row.scoreType,
          bound: row.bound,
          ...(row.mateWinner ? { mateWinner: row.mateWinner } : {})
        };
        this.points.set(`${channel}:${search.ply}`, evaluation);
      }
    } else {
      for (const key of ['time', 'nodes', 'nps', 'hashfull', 'tbhits', 'currmove'])
        if (fields[key] !== undefined) search.latest[key] = fields[key];
    }
    const { id, side, source, ply, active, latest } = search;
    return { id, channel, side, source, ply, active, latest, row, evaluation };
  }

  view(ply) {
    return Object.fromEntries(
      channels.map((channel) => [
        channel,
        this.archive
          .filter((s) => s.channel === channel && s.ply <= ply)
          .sort((a, b) => b.ply - a.ply)[0] || null
      ])
    );
  }

  snapshot() {
    return { searches: this.current, evaluations: [...this.points.values()] };
  }

  rewind(ply) {
    this.archive = this.archive.filter((s) => s.ply <= ply);
    this.points = new Map([...this.points].filter(([, p]) => p.ply <= ply));
    this.current = this.view(ply);
  }

  export() {
    this.prune();
    return { searches: this.archive, evaluations: [...this.points.values()] };
  }
}

export { SearchData };
