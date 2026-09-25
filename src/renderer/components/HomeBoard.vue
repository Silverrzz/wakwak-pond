<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { DuckGame } from '../../rules';
import { Engine } from '../../engine';
import { pieceSource } from '../shared/format';

const host = ref(null);
const paused = ref(false);
const fading = ref(false);
const resetting = ref(false);
const supported = globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
let game = new DuckGame();
const initial = game.board.flatMap((piece, at) =>
  piece ? [{ id: at, piece, at, visible: true }] : []
);
initial.push({ id: 'duck', piece: 'duck', at: 27, visible: false });
const pieces = ref(initial.map((piece) => ({ ...piece })));

let timer;
let observer;
let motion;
let inView = true;
let engine;
let generation = 0;
let searchingGeneration = null;
let disposed = false;
let phase = 'moves';
let remaining = 3500;
let started = 0;

function stop() {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
    remaining = Math.max(0, remaining - (performance.now() - started));
  }
}

function schedule() {
  if (
    timer !== undefined ||
    searchingGeneration === generation ||
    disposed ||
    !supported ||
    paused.value ||
    document.hidden ||
    !inView
  )
    return;
  started = performance.now();
  timer = setTimeout(advance, remaining);
}

function releaseEngine() {
  generation++;
  engine?.close();
  engine = undefined;
}

async function advance() {
  timer = undefined;
  if (phase === 'reset') {
    resetting.value = true;
    pieces.value = initial.map((piece) => ({ ...piece }));
    game = new DuckGame();
    releaseEngine();
    phase = 'reveal';
    remaining = 100;
  } else if (phase === 'reveal') {
    resetting.value = false;
    fading.value = false;
    phase = 'moves';
    remaining = 3500;
  } else if (phase === 'finished') {
    fading.value = true;
    phase = 'reset';
    remaining = 800;
  } else if (phase === 'duck') {
    pieces.value = pieces.value.map((piece) =>
      piece.id === 'duck' ? { ...piece, at: game.duck, visible: true } : piece
    );
    phase = game.result ? 'finished' : 'moves';
    remaining = game.result ? 6000 : 2300;
  } else {
    const current = generation;
    searchingGeneration = current;
    try {
      if (!engine) {
        const file = new URL(
          `${import.meta.env.BASE_URL}engines/wakwak-0.14.0/wakwak.worker.js`,
          document.baseURI
        ).href;
        engine = new Engine(file);
        await engine.initialize('duck', { Threads: 1, Hash: 16 });
      }
      if (current !== generation || disposed) return;
      const moveTime = 150 + Math.floor(Math.random() * 151);
      const move = await engine.move(game.initialFen, game.moves, {
        command: `movetime ${moveTime}`,
        timeout: 15000
      });
      if (current !== generation || disposed) return;
      game.playUci(move);
      const record = game.records.at(-1);
      pieces.value = pieces.value.map((piece) => {
        if (piece.id === 'duck' || !piece.visible) return piece;
        if (piece.at === record.from)
          return { ...piece, at: record.to, piece: game.board[record.to] };
        if (record.castle && piece.at === record.castle.rook)
          return { ...piece, at: record.castle.rookTo };
        return {
          ...piece,
          visible: piece.at !== record.to && game.board[piece.at] === piece.piece
        };
      });
      phase = record.duck === null ? 'finished' : 'duck';
      remaining = phase === 'finished' ? 6000 : 1100;
    } catch {
      if (current !== generation || disposed) return;
      releaseEngine();
      paused.value = true;
      remaining = 1000;
      return;
    } finally {
      if (searchingGeneration === current) searchingGeneration = null;
    }
  }
  schedule();
}

function visibilityChanged() {
  stop();
  if (document.hidden) releaseEngine();
  schedule();
}

function motionChanged() {
  stop();
  paused.value = motion.matches;
  if (paused.value) releaseEngine();
  schedule();
}

onMounted(() => {
  motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  paused.value = motion.matches;
  motion.addEventListener('change', motionChanged);
  document.addEventListener('visibilitychange', visibilityChanged);
  observer = new IntersectionObserver(([entry]) => {
    stop();
    inView = entry.isIntersecting;
    if (!inView) releaseEngine();
    schedule();
  });
  observer.observe(host.value);
  schedule();
});

onUnmounted(() => {
  disposed = true;
  stop();
  releaseEngine();
  observer?.disconnect();
  motion?.removeEventListener('change', motionChanged);
  document.removeEventListener('visibilitychange', visibilityChanged);
});
</script>

<template>
  <div ref="host" class="home-scene">
    <div class="water-ring ring-one" aria-hidden="true"></div>
    <div class="water-ring ring-two" aria-hidden="true"></div>
    <div class="floating-board" aria-hidden="true">
      <div class="scene-squares">
        <div
          v-for="square in 64"
          :key="square"
          class="scene-square"
          :class="{ dark: (Math.floor((square - 1) / 8) + ((square - 1) % 8)) % 2 }"
        ></div>
      </div>
      <div class="scene-pieces" :class="{ fading, resetting, paused }">
        <div
          v-for="piece in pieces"
          :key="piece.id"
          class="scene-sprite"
          :class="{ captured: !piece.visible, 'scene-duck': piece.id === 'duck' }"
          :style="{
            transform: `translate(${(piece.at % 8) * 100}%, ${(7 - Math.floor(piece.at / 8)) * 100}%)`
          }"
        >
          <img :src="pieceSource(piece.piece, piece.id === 'duck')" alt="" draggable="false" />
        </div>
      </div>
    </div>
    <span class="board-reflection" aria-hidden="true"></span>
  </div>
</template>
