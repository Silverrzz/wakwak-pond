import { onMounted, onUnmounted } from 'vue';

export function useShortcuts(game, commands, activeTab) {
  function keydown(event) {
    if (event.defaultPrevented || !game.state.value || document.querySelector('dialog[open]'))
      return;
    if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable)
      return;
    const cursor = game.reviewTarget.value ?? game.ply.value;
    const target = {
      ArrowLeft: cursor - 1,
      ArrowUp: cursor - 1,
      ArrowRight: cursor + 1,
      ArrowDown: cursor + 1,
      Home: 0,
      End: game.state.value.moves.length
    }[event.key];
    if (target !== undefined && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      activeTab.value = 'moves';
      void game.review(target);
      return;
    }
    if (event.repeat || event.altKey) return;
    const key = event.key.toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (['n', 'o', 's'].includes(key)) {
        event.preventDefault();
        if (key === 'n') void commands.newGame();
        if (key === 'o') void commands.openGame();
        if (key === 's') void commands.saveGame();
      }
      return;
    }
    if (key === 'escape') {
      event.preventDefault();
      if (game.promotionMove.value || game.selected.value !== null) {
        game.selected.value = null;
        game.promotionMove.value = null;
      } else if (game.boardState.value.pending && !game.submitting.value) void game.cancelPiece();
      return;
    }
    if (key === 'f') {
      event.preventDefault();
      game.flip();
    }
    if (key === 'a') {
      event.preventDefault();
      void commands.analysis();
    }
  }
  onMounted(() => document.addEventListener('keydown', keydown));
  onUnmounted(() => document.removeEventListener('keydown', keydown));
}
