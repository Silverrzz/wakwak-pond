import { formatScore, positionLabel } from '../shared/format';

export class EvaluationGraph {
  constructor(canvas, tooltip) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.tooltip = tooltip;
    this.state = null;
    this.ply = 0;
    this.scale = 'auto';
    this.hover = null;
    this.hitPoints = [];
  }

  update(state, ply, scale) {
    if (this.state?.id !== state?.id) this.hover = null;
    this.state = state;
    this.ply = ply;
    this.scale = scale;
    this.draw();
  }

  pointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    this.hover = this.hitPoints.reduce(
      (best, point) =>
        !best || Math.hypot(point.x - x, point.y - y) < Math.hypot(best.x - x, best.y - y)
          ? point
          : best,
      null
    );
    this.draw();
  }

  pointerLeave() {
    this.hover = null;
    this.draw();
  }
  score(point) {
    return formatScore(point);
  }
  position(ply) {
    return positionLabel(this.state, ply);
  }

  draw() {
    if (!this.state) return;
    const rect = this.canvas.getBoundingClientRect(),
      width = rect.width,
      height = rect.height;
    if (!width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    if (
      this.canvas.width !== Math.round(width * ratio) ||
      this.canvas.height !== Math.round(height * ratio)
    ) {
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
    }
    const ctx = this.context;
    const theme = getComputedStyle(this.canvas);
    const color = (name) => theme.getPropertyValue('--' + name).trim();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const points = this.state.evaluations || [];

    const plot = { left: 43, top: 14, right: width - 20, bottom: height - 25 };
    const choice = this.scale;
    const max = points.reduce(
      (value, p) => (p.scoreType === 'cp' ? Math.max(value, Math.abs(p.score) / 100) : value),
      0
    );
    const range =
      choice === 'auto' ? [1, 2, 5, 10, 20].find((n) => n >= max) || 20 : Number(choice);
    const last = Math.max(2, this.state.moves.length, ...points.map((p) => p.ply));
    const x = (ply) => plot.left + (ply / last) * (plot.right - plot.left);
    const y = (point) => {
      const value =
        point.scoreType === 'mate'
          ? (point.mateWinner ? point.mateWinner === 'b' : point.score < 0)
            ? -range
            : range
          : Math.max(-range, Math.min(range, point.score / 100));
      return plot.top + ((range - value) / (range * 2)) * (plot.bottom - plot.top);
    };
    ctx.font = color('text-small') + ' ' + theme.fontFamily;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (const value of [-range, 0, range]) {
      const yy = plot.top + ((range - value) / (range * 2)) * (plot.bottom - plot.top);
      ctx.strokeStyle = color(value === 0 ? 'graph-zero' : 'graph-grid');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plot.left, Math.round(yy) + 0.5);
      ctx.lineTo(plot.right, Math.round(yy) + 0.5);
      ctx.stroke();
      ctx.fillStyle = color('text-muted');
      ctx.fillText(value > 0 ? '+' + value : String(value), plot.left - 10, yy);
    }
    const step = Math.max(
      2,
      Math.ceil(last / Math.max(2, Math.floor((plot.right - plot.left) / 95)) / 2) * 2
    );
    ctx.textAlign = 'center';
    for (let ply = 0; ply <= last; ply += step) {
      const xx = x(ply);
      ctx.strokeStyle = color('graph-grid');
      ctx.beginPath();
      ctx.moveTo(xx, plot.top);
      ctx.lineTo(xx, plot.bottom);
      ctx.stroke();
      ctx.fillStyle = color('text-muted');
      ctx.fillText(this.position(ply), xx, height - 10);
    }
    const colors = Object.fromEntries(
      ['w', 'b'].map((channel) => [channel, color('graph-' + channel)])
    );
    this.hitPoints = [];
    for (const channel of ['w', 'b']) {
      const series = points.filter((p) => p.channel === channel).sort((a, b) => a.ply - b.ply);
      ctx.strokeStyle = colors[channel];
      ctx.fillStyle = colors[channel];
      ctx.lineWidth = 1.7;
      ctx.setLineDash(channel === 'w' ? [] : [5, 4]);
      ctx.beginPath();
      let previous = null;
      for (const point of series) {
        const xx = x(point.ply),
          yy = y(point);
        if (!previous || point.ply - previous.ply > 2) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
        this.hitPoints.push({ x: xx, y: yy, point });
        previous = point;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      for (const point of series) {
        const xx = x(point.ply),
          yy = y(point);
        ctx.beginPath();
        if (point.scoreType === 'mate' || Math.abs(point.score / 100) > range) {
          const direction = yy < (plot.top + plot.bottom) / 2 ? 1 : -1;
          ctx.moveTo(xx, yy);
          ctx.lineTo(xx - 3, yy + direction * 5);
          ctx.lineTo(xx + 3, yy + direction * 5);
          ctx.closePath();
        } else if (channel === 'b') ctx.rect(xx - 2.5, yy - 2.5, 5, 5);
        else ctx.arc(xx, yy, series.length > 200 ? 1.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = color('graph-cursor');
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x(this.ply), plot.top);
    ctx.lineTo(x(this.ply), plot.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    this.tooltip.hidden = !this.hover;
    if (this.hover) {
      const point = points.find(
        (p) => p.channel === this.hover.point.channel && p.ply === this.hover.point.ply
      );
      if (!point) {
        this.hover = null;
        this.tooltip.hidden = true;
        return;
      }
      const xx = x(point.ply),
        yy = y(point);
      ctx.strokeStyle = colors[point.channel];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xx, yy, 5, 0, Math.PI * 2);
      ctx.stroke();
      this.tooltip.textContent =
        this.position(point.ply) +
        '  ' +
        this.score(point) +
        '  ·  d' +
        point.depth +
        '  ·  ' +
        point.source;
      this.tooltip.style.left =
        Math.max(4, Math.min(width - this.tooltip.offsetWidth - 4, xx + 10)) + 'px';
      this.tooltip.style.top =
        Math.max(3, Math.min(height - this.tooltip.offsetHeight - 3, yy - 30)) + 'px';
    }
    this.canvas.setAttribute(
      'aria-label',
      `Evaluation history, ${points.length} evaluations. Position ${this.ply} of ${this.state.moves.length}. Scores from White’s perspective. Click a point or use the arrow keys to review.`
    );
  }
}
