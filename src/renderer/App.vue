<script setup>
import { onMounted, onUnmounted, provide, ref, shallowRef } from 'vue';
import { pondKey } from './shared/context';
import { sideName } from './shared/format';
import { useFeedback } from './composables/useFeedback';
import { useGame } from './composables/useGame';
import { useSearchOutput } from './composables/useSearchOutput';
import { useShortcuts } from './composables/useShortcuts';
import { initializeDockLayout } from './layout/dockLayout';
import AppHeader from './components/AppHeader.vue';
import BoardPanel from './components/BoardPanel.vue';
import GamePanel from './components/GamePanel.vue';
import DockSplitter from './components/DockSplitter.vue';
import EngineOutput from './components/EngineOutput.vue';
import EvaluationPanel from './components/EvaluationPanel.vue';
import SetupDialog from './components/SetupDialog.vue';
import EnginesDialog from './components/EnginesDialog.vue';
import HelpDialog from './components/HelpDialog.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';

const feedback = useFeedback();
const game = useGame(feedback);
const output = useSearchOutput(game);
const { error, notification } = feedback;
const activeTab = ref('moves');
const setupOpen = ref(false);
const enginesOpen = ref(false);
const helpOpen = ref(false);
const confirmOpen = ref(false);
const confirmation = shallowRef(null);
const workspace = ref(null);
let cleanupLayout;

function confirm(title, description, label, action) {
  confirmation.value = { title, description, label, action };
  confirmOpen.value = true;
}

const commands = {
  newGame: () =>
    feedback.action(async () => {
      if (!game.state.value || game.starting.value || game.state.value.phase === 'starting') return;
      if (game.state.value.phase === 'playing') await window.pond.pause();
      setupOpen.value = true;
    }),
  openGame: () =>
    feedback.action(async () => {
      if (!game.state.value) return;
      if (game.analysis.value.enabled) {
        const pgn = await window.pond.openAnalysisPgn();
        if (pgn) await game.startAnalysis(0, { source: 'pgn', pgn });
        return;
      }
      if (game.state.value.phase === 'playing') await window.pond.pause();
      await window.pond.openGame();
    }),
  saveGame: () =>
    feedback.action(async () => {
      if (!game.state.value) return;
      if (game.state.value.phase === 'playing') await window.pond.pause();
      if (await window.pond.saveGame()) feedback.notify('PGN saved');
    }),
  pause: () =>
    feedback.action(async () => {
      game.resetReview();
      if (game.state.value.phase === 'playing') await window.pond.pause();
      else await window.pond.resume();
    }),
  takeback: () => feedback.action(() => window.pond.takeback()),
  resign: () => {
    const side = game.state.value.turn;
    confirm(
      sideName(side) + ' resigns?',
      'This ends the game in a win for ' + sideName(side === 'w' ? 'b' : 'w') + '.',
      'Resign',
      () => {
        if (game.state.value.turn !== side) throw new Error('The player on turn has changed.');
        return window.pond.resign();
      }
    );
  },
  draw: () =>
    confirm(
      'Agree to a draw?',
      'Both local players must agree. This ends the game as a draw.',
      'Agree to draw',
      () => window.pond.draw()
    ),
  copyFen: () =>
    feedback.action(async () => {
      if (game.analysis.value.enabled)
        await window.pond.copyAnalysisFen({ revision: game.analysis.value.revision });
      else await window.pond.copyFen(game.ply.value);
      feedback.notify('FEN copied');
    }),
  analysis: () => (game.analysis.value.enabled ? game.stopAnalysis() : game.startAnalysis()),
  newAnalysis: () => game.startAnalysis(0, { source: 'fresh', variant: game.state.value.variant }),
  engines: () => {
    enginesOpen.value = true;
  },
  help: () => {
    helpOpen.value = true;
  }
};

function acceptConfirmation() {
  const action = confirmation.value?.action;
  confirmation.value = null;
  if (action) void feedback.action(action);
}

provide(pondKey, { game, feedback, commands, activeTab });
useShortcuts(game, commands, activeTab);
onMounted(() => {
  cleanupLayout = initializeDockLayout(workspace.value);
});
onUnmounted(() => cleanupLayout?.());
</script>

<template>
  <AppHeader />
  <main ref="workspace" class="workspace">
    <BoardPanel />
    <DockSplitter id="board-splitter" label="Board width" />
    <GamePanel />
    <DockSplitter id="moves-splitter" label="Moves width" />
    <EngineOutput :output="output" />
    <DockSplitter id="graph-splitter" orientation="horizontal" label="Evaluation graph height" />
    <EvaluationPanel :output="output" @review="game.review" />
  </main>
  <div id="notification" class="notification" role="status" :hidden="!notification">
    {{ notification }}
  </div>
  <div id="error" class="error-toast" role="alert" :hidden="!error">
    <span>{{ error }}</span>
    <button id="dismiss-error" aria-label="Dismiss error" @click="error = ''">×</button>
  </div>
  <SetupDialog v-model="setupOpen" />
  <EnginesDialog v-model="enginesOpen" />
  <HelpDialog v-model="helpOpen" />
  <ConfirmDialog v-model="confirmOpen" :confirmation="confirmation" @confirm="acceptConfirmation" />
</template>
