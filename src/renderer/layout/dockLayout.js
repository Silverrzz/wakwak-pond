export function initializeDockLayout(workspace) {
  const controller = new AbortController();
  const observers = [];
  const listen = (target, type, callback) =>
    target.addEventListener(type, callback, { signal: controller.signal });
  const observe = (target, callback) => {
    const observer = new ResizeObserver(callback);
    observer.observe(target);
    observers.push(observer);
  };
  const boardPane = workspace.querySelector('.board-column');
  const boardStage = workspace.querySelector('.board-stage');
  const boardContent = workspace.querySelector('.board-content');
  const movesPane = workspace.querySelector('.game-panel');
  const graphPane = workspace.querySelector('.graph-panel');
  const searches = workspace.querySelector('#game-searches');
  const media = matchMedia('(max-width: 1099px)');
  const defaults = { board: 0.46, moves: 0.2, graph: 175, engines: 0.5 };
  const minimum = { board: 260, moves: 220, output: 320, graph: 110, top: 356 };
  const divider = 7,
    searchDivider = 5;
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('pond-docks') || '{}') || {};
  } catch {}
  const settings = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      Number.isFinite(saved[key]) ? saved[key] : fallback
    ])
  );
  const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
  const style = (element, name, value) => {
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  };
  const save = () => localStorage.setItem('pond-docks', JSON.stringify(settings));
  const handles = Object.fromEntries(
    [
      ['board', 'board-splitter'],
      ['moves', 'moves-splitter'],
      ['graph', 'graph-splitter'],
      ['engines', 'engine-splitter']
    ].map(([key, id]) => [key, workspace.querySelector('#' + id)])
  );
  const vertical = (key) =>
    key === 'board' || key === 'moves' || (key === 'engines' && media.matches);
  const current = (key) =>
    key === 'board'
      ? boardPane.getBoundingClientRect().width
      : key === 'moves'
        ? movesPane.getBoundingClientRect().width
        : key === 'graph'
          ? graphPane.getBoundingClientRect().height
          : workspace.querySelector('#search-w').getBoundingClientRect()[
              media.matches ? 'width' : 'height'
            ];
  const searchSpace = () =>
    Math.max(0, (media.matches ? searches.clientWidth : searches.clientHeight) - searchDivider);
  const bounds = (key) => {
    const width = workspace.clientWidth;
    if (key === 'board')
      return [
        minimum.board,
        width -
          (media.matches
            ? divider + minimum.moves
            : divider * 2 + current('moves') + minimum.output)
      ];
    if (key === 'moves')
      return [minimum.moves, width - divider * 2 - current('board') - minimum.output];
    if (key === 'graph')
      return [minimum.graph, media.matches ? 300 : workspace.clientHeight - minimum.top - divider];
    const space = searchSpace(),
      min = Math.min(media.matches ? 160 : 70, space / 2);
    return [min, space - min];
  };
  const fitBoard = () => {
    const clocks =
      workspace.querySelector('#top-player').offsetHeight +
      workspace.querySelector('#bottom-player').offsetHeight;
    const size = Math.floor(
      Math.max(0, Math.min(boardStage.clientWidth, boardStage.clientHeight - clocks))
    );
    style(boardContent, '--board-size', size + 'px');
  };
  const fitSearches = () => {
    const [min, max] = bounds('engines');
    const size = clamp(settings.engines * searchSpace(), min, max);
    style(searches, '--white-size', size + 'px');
    const handle = handles.engines,
      isVertical = vertical('engines');
    handle.classList.toggle('vertical', isVertical);
    handle.classList.toggle('horizontal', !isVertical);
    handle.setAttribute('aria-orientation', isVertical ? 'vertical' : 'horizontal');
    handle.setAttribute(
      'aria-label',
      isVertical ? 'White and black output width' : 'White and black output height'
    );
    handle.setAttribute(
      'aria-keyshortcuts',
      isVertical ? 'Alt+ArrowLeft Alt+ArrowRight' : 'Alt+ArrowUp Alt+ArrowDown'
    );
    handle.setAttribute('aria-valuemin', String(Math.round(min)));
    handle.setAttribute('aria-valuemax', String(Math.round(max)));
    handle.setAttribute('aria-valuenow', String(Math.round(size)));
  };
  const apply = () => {
    const width = workspace.clientWidth;
    const usable = width - divider * (media.matches ? 1 : 2);
    const moves = clamp(
      settings.moves * width,
      minimum.moves,
      usable - minimum.board - minimum.output
    );
    const board = clamp(
      settings.board * width,
      minimum.board,
      usable - (media.matches ? minimum.moves : moves + minimum.output)
    );
    const [minGraph, maxGraph] = bounds('graph');
    style(workspace, '--board-column', board + 'px');
    style(workspace, '--moves-column', moves + 'px');
    style(workspace, '--graph-height', clamp(settings.graph, minGraph, maxGraph) + 'px');
    if (media.matches)
      style(
        workspace,
        '--main-height',
        clamp(width / 2 + 96, minimum.top, Math.min(620, innerHeight - 80)) + 'px'
      );
    fitBoard();
    fitSearches();
    for (const key of ['board', 'moves', 'graph']) {
      const [min, max] = bounds(key);
      handles[key].setAttribute('aria-valuemin', String(Math.round(min)));
      handles[key].setAttribute('aria-valuemax', String(Math.round(Math.max(min, max))));
      handles[key].setAttribute('aria-valuenow', String(Math.round(current(key))));
    }
  };
  for (const [key, handle] of Object.entries(handles)) {
    handle.title = 'Drag to resize · Alt + arrow keys';
    handle.setAttribute(
      'aria-keyshortcuts',
      vertical(key) ? 'Alt+ArrowLeft Alt+ArrowRight' : 'Alt+ArrowUp Alt+ArrowDown'
    );
    let drag = null;
    const begin = (origin, pointerId = null) => {
      if (key === 'board' || key === 'moves') {
        settings.board = current('board') / workspace.clientWidth;
        if (!media.matches) settings.moves = current('moves') / workspace.clientWidth;
      }
      drag = {
        origin,
        pointerId,
        value: current(key),
        vertical: vertical(key),
        compact: media.matches
      };
    };
    const change = (delta) => {
      const [min, max] = bounds(key);
      const value = clamp(drag.value + (key === 'graph' ? -delta : delta), min, max);
      settings[key] =
        key === 'graph'
          ? value
          : key === 'engines'
            ? value / Math.max(1, searchSpace())
            : value / workspace.clientWidth;
      apply();
    };
    const end = () => {
      if (drag) {
        drag = null;
        document.body.classList.remove('resizing');
        save();
      }
    };
    listen(handle, 'pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      begin(vertical(key) ? event.clientX : event.clientY, event.pointerId);
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add('resizing');
    });
    listen(window, 'pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.vertical !== vertical(key) || drag.compact !== media.matches) {
        end();
        return;
      }
      change((drag.vertical ? event.clientX : event.clientY) - drag.origin);
    });
    listen(window, 'pointerup', (event) => {
      if (drag?.pointerId === event.pointerId) end();
    });
    listen(window, 'pointercancel', (event) => {
      if (drag?.pointerId === event.pointerId) end();
    });
    listen(handle, 'lostpointercapture', end);
    listen(window, 'blur', end);
    listen(handle, 'keydown', (event) => {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        document.querySelector('dialog[open]') ||
        drag
      )
        return;
      if (
        !(vertical(key) ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']).includes(
          event.key
        )
      )
        return;
      event.preventDefault();
      begin(0);
      change(['ArrowLeft', 'ArrowUp'].includes(event.key) ? -16 : 16);
      end();
    });
    listen(handle, 'dblclick', () => {
      end();
      settings[key] = defaults[key];
      apply();
      save();
    });
  }
  observe(workspace, apply);
  observe(boardStage, fitBoard);
  observe(searches, fitSearches);
  listen(window, 'resize', apply);
  apply();
  return () => {
    controller.abort();
    observers.forEach((observer) => observer.disconnect());
    document.body.classList.remove('resizing');
  };
}
