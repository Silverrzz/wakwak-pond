<script setup>
import AppDialog from './AppDialog.vue';

const open = defineModel({ type: Boolean, default: false });
</script>

<template>
  <AppDialog v-model="open" id="help-dialog" class="help-dialog" labelledby="help-title">
    <div class="dialog-heading">
      <h2 id="help-title">Help</h2>
      <button @click="open = false" aria-label="Close help">×</button>
    </div>
    <h3>Duck</h3>
    <p>
      Move a piece, then move the duck to a different empty square. Capture the king to win. Check
      does not apply. A player with no legal moves wins by fowling.
    </p>
    <h3>Board controls</h3>
    <p>
      Click a piece and its destination, or drag it there. The duck can also be dragged after the
      piece move.
    </p>
    <p>
      Right-drag to draw an arrow; right-click a square to mark it. Repeat the same gesture to
      remove a mark. Drawings belong to the displayed position and return when you revisit it in the
      move list.
    </p>
    <h3>960 castling</h3>
    <p>Move the king onto its rook. The king finishes on c/g; the rook on d/f.</p>
    <h3>Analysis</h3>
    <p>
      Analysis (A) opens the displayed position and pauses a running game. New board starts a fresh
      position; Open PGN and Paste load games or positions without replacing your game. Select an
      engine for continuous analysis, or explore moves without one.
    </p>
    <p>
      Scores are from White's perspective. Select a search row to expand its line. Undo takes back a
      variation move; Reset variation returns to the selected position. Selecting another move
      discards the variation. Save exports the displayed analysis line. Return to game restores the
      original game; Resume continues play.
    </p>
    <h3>Clocks</h3>
    <p>
      The clock runs through duck placement. Increment is added after the turn. Simple delay runs
      before the clock. Bronstein refunds up to the delay after the turn. Each stage adds its time
      to the remaining clock.
    </p>
    <h3>Keyboard</h3>
    <dl class="shortcuts">
      <div>
        <dt>New / open / save</dt>
        <dd>
          <kbd>Ctrl N</kbd>
          <kbd>Ctrl O</kbd>
          <kbd>Ctrl S</kbd>
        </dd>
      </div>
      <div>
        <dt>Flip</dt>
        <dd><kbd>F</kbd></dd>
      </div>
      <div>
        <dt>Previous / next move</dt>
        <dd>
          <kbd>← ↑</kbd>
          <kbd>→ ↓</kbd>
        </dd>
      </div>
      <div>
        <dt>First / latest position</dt>
        <dd>
          <kbd>Home</kbd>
          <kbd>End</kbd>
        </dd>
      </div>
      <div>
        <dt>Cancel selection / piece move</dt>
        <dd><kbd>Esc</kbd></dd>
      </div>
      <div>
        <dt>Resize pane</dt>
        <dd><kbd>Alt + Arrows</kbd></dd>
      </div>
    </dl>
  </AppDialog>
</template>
