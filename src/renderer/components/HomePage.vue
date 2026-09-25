<script setup>
import HomeBoard from './HomeBoard.vue';
import wakwakArt from '../../wakwak-art.png';

defineEmits(['play', 'analyse', 'rules']);
</script>

<template>
  <section class="pond-home" aria-labelledby="home-title">
    <div class="home-content">
      <h1 id="home-title" class="page-title home-title" tabindex="-1">
        <span class="home-title-rank">#1</span>
        <span class="home-title-accent">Duck Chess</span>
        <span class="home-title-line">Engine</span>
      </h1>
      <div class="home-actions">
        <button class="home-play" @click="$emit('play')">
          <span class="home-play-art">
            <img :src="wakwakArt" alt="" width="592" height="565" />
          </span>
          <span>Play WakWak</span>
          <svg class="action-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </button>
        <button class="home-analyse" @click="$emit('analyse')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v16h16M8 14l4-5 4 3 4-7" /></svg>
          <span>Analyse a game</span>
          <svg class="action-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </button>
        <button class="home-rules" @click="$emit('rules')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v15M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Z" />
          </svg>
          <span>How to play Duck Chess</span>
          <svg class="action-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
    <HomeBoard />
  </section>
</template>
