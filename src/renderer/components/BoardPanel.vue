<script setup>
import { usePond } from '../shared/context';
import ChessBoard from './ChessBoard.vue';
import PlayerBar from './PlayerBar.vue';

const { game } = usePond();
const { state, frame, analysis, flipped, reviewPly, status, submitting } = game;
</script>

<template>
  <section class="board-column" aria-label="Board">
    <div class="board-stage">
      <div class="board-content">
        <PlayerBar id="top-player" :side="flipped ? 'w' : 'b'" />
        <ChessBoard />
        <PlayerBar id="bottom-player" :side="flipped ? 'b' : 'w'" />
      </div>
    </div>
    <div class="board-footer">
      <div
        id="turn-status"
        role="status"
        :class="{
          playing: state?.phase === 'playing' && reviewPly === null,
          'duck-phase': frame?.pending && (analysis.enabled || reviewPly === null)
        }"
      >
        <span id="turn-text">{{ status }}</span>
      </div>
      <button
        id="cancel-piece"
        :hidden="
          !frame?.pending ||
          (!analysis.enabled &&
            (reviewPly !== null || !['playing', 'paused'].includes(state?.phase)))
        "
        :disabled="submitting"
        title="Undo piece move (Esc)"
        @click="game.cancelPiece"
      >
        Undo piece
      </button>
      <button id="flip" title="Flip board (F)" @click="game.flip()">Flip</button>
    </div>
  </section>
</template>
