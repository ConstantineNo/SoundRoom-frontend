<template>
  <div class="rack-module metronome">
    <div class="module-header">
      <div class="module-title">METRONOME</div>
      <div class="module-status" :class="{ active: isMetronomeOn }"></div>
    </div>
    <div class="bpm-display">{{ bpm }} <span class="bpm-label">BPM</span></div>
    <div class="bpm-input">
      <n-input-number v-model:value="bpm" :min="40" :max="208" :step="1" size="small" />
    </div>
    <div class="knob-control">
       <n-slider v-model:value="bpm" :min="40" :max="208" :step="1" vertical style="height: 100px;" />
    </div>
    <div class="rack-controls">
       <button class="rack-btn primary" @click="toggleMetronome">
         {{ isMetronomeOn ? 'STOP' : 'START' }}
       </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import * as Tone from 'tone'
import { NSlider, NInputNumber } from 'naive-ui'

const props = defineProps({
  onBeat: Function
})

const bpm = ref(90)
const isMetronomeOn = ref(false)
let metronomeLoop = null

const toggleMetronome = async () => {
  if (isMetronomeOn.value) {
    Tone.Transport.stop()
    isMetronomeOn.value = false
  } else {
    await Tone.start()
    Tone.Transport.bpm.value = bpm.value
    
    if (!metronomeLoop) {
      const synth = new Tone.MembraneSynth().toDestination()
      metronomeLoop = new Tone.Loop((time) => {
        synth.triggerAttackRelease("C2", "8n", time)
        if (props.onBeat) props.onBeat(Date.now())
      }, "4n")
      metronomeLoop.start(0)
    }
    
    Tone.Transport.start()
    isMetronomeOn.value = true
  }
}

watch(bpm, (newBpm) => {
  if (isMetronomeOn.value) {
    Tone.Transport.bpm.value = newBpm
  }
})

onUnmounted(() => {
  if (metronomeLoop) {
    metronomeLoop.dispose()
    Tone.Transport.stop()
  }
})

defineExpose({
  isMetronomeOn,
  bpm
})
</script>

<style scoped>
.rack-module {
  background: #222;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.module-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.module-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #333;
}

.module-status.active {
  background-color: #50C878;
  box-shadow: 0 0 8px #50C878;
}

.module-title { font-size: 0.8rem; font-weight: 700; color: #666; letter-spacing: 1px; }
.bpm-display { font-family: 'Roboto Mono', monospace; font-size: 2.5rem; color: #50C878; font-weight: bold; }
.bpm-label { font-size: 0.8rem; color: #666; }
.bpm-input { width: 100%; }
.rack-btn { background: #333; border: none; color: #fff; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; transition: all 0.2s; }
.rack-btn.primary { background: #50C878; color: #000; }
.rack-btn:hover { filter: brightness(1.1); }
</style>
