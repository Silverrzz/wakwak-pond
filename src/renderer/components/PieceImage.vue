<script setup>
import { pieceSource } from '../shared/format';

defineProps({ piece: { type: String, default: '' }, duck: Boolean });
</script>

<template>
  <img class="piece" :class="{ duck }" :src="pieceSource(piece, duck)" alt="" :draggable="false" />
</template>
