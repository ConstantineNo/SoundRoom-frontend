<!-- src/components/Score/JianpuRenderer.vue -->
<template>
  <JianpuScore
    :tune="tune"
    :active-note-ids="activeNoteIds"
    :debug-mode="debugMode"
    :target-key="targetKey"
    :playback-time="playbackTime"
    @measure-issues="onMeasureIssues"
    @seek-to-note="onSeekToNote"
  />
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'
import JianpuScore from '../JianpuScore.vue'

const props = defineProps({
  tune: { type: Object, default: null },
  activeNoteIds: { type: Array, default: () => [] },
  debugMode: { type: Boolean, default: false },
  targetKey: { type: String, default: '' },
  playbackTime: { type: Number, default: 0 }
})

const emit = defineEmits(['measure-issues', 'seek-to-note'])

const onMeasureIssues = (issues) => {
  emit('measure-issues', issues)
}

const onSeekToNote = (payload) => {
  emit('seek-to-note', payload)
}
</script>
