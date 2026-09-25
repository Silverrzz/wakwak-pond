<template>
  <article class="rules-page" aria-labelledby="rules-title">
    <header class="rules-heading">
      <h1 id="rules-title" class="page-title" tabindex="-1">Duck Chess</h1>
    </header>
    <div class="rules-body">
      <p class="rules-intro">
        Duck chess uses the usual chess moves, with two changes: each turn ends by moving the duck,
        and you win by capturing the king.
      </p>
      <section>
        <h2>Your turn</h2>
        <p>
          Move a chess piece, then place the duck on a different empty square. White moves first and
          places the duck onto the board after their first move.
        </p>
      </section>
      <section>
        <h2>The duck</h2>
        <p>Neither player can capture the duck or move through it. Knights can jump over it.</p>
      </section>
      <section>
        <h2>Winning</h2>
        <p>
          Capture the opponent's king to win immediately, without placing the duck. There is no
          check or checkmate, and kings may move onto attacked squares. A player with no legal move
          wins by fowling.
        </p>
      </section>
      <section>
        <h2>Special moves</h2>
        <p>
          Castling, en passant, and promotion work as in chess. Castling through attacked squares is
          allowed; castling through the duck is not.
        </p>
      </section>
      <section>
        <h2>Draws</h2>
        <p>Threefold repetition and the 50-move rule are draws.</p>
      </section>
    </div>
  </article>
</template>
