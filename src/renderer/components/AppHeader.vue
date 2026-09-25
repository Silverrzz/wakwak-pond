<script setup>
import { usePond } from '../shared/context';

const { game, commands } = usePond();
const { state, starting, analysis, analysisBusy, submitting } = game;
</script>

<template>
  <header class="app-header">
    <nav aria-label="Application">
      <button
        id="new-game"
        title="New game (Ctrl+N)"
        :disabled="state?.phase === 'starting' || starting"
        @click="commands.newGame"
      >
        New game
      </button>
      <button id="open-game" title="Open PGN (Ctrl+O)" @click="commands.openGame">Open</button>
      <button id="save-game" title="Save PGN (Ctrl+S)" @click="commands.saveGame">Save</button>
      <span class="separator"></span>
      <button
        id="analysis-button"
        :aria-pressed="analysis.enabled"
        :disabled="!state || state.phase === 'starting' || starting || analysisBusy || submitting"
        title="Open analysis workspace (A)"
        @click="commands.analysis"
      >
        {{ analysis.enabled ? 'Return to game' : 'Analysis' }}
      </button>
      <button id="engines-button" @click="commands.engines">Engines</button>
      <button id="help-button" @click="commands.help">Help</button>
    </nav>
  </header>
</template>
