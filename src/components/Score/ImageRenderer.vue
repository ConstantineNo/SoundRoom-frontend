<template>

  <div class="image-renderer">

    <div class="image-wrapper" v-if="imageUrl">

      <img :src="imageUrl" class="score-image" draggable="false" />

    </div>

    <div class="audio-controls" v-if="audioUrl">

      <div ref="waveformRef" class="waveform"></div>

      <button class="play-btn" @click="togglePlay">

        {{ isPlaying ? '暂停' : '播放' }}

      </button>

    </div>

  </div>

</template>



<script setup>

import { ref, onMounted, onUnmounted, computed } from 'vue'

import WaveSurfer from 'wavesurfer.js'



/**

 * 图片曲谱 + 波形组件（基础版）

 * - 将原 Workbench.vue 中的图片展示和 wavesurfer 初始化能力独立出来，便于练功房与其他页面复用。

 */

const props = defineProps({

  imagePath: { type: String, default: '' },

  audioPath: { type: String, default: '' }

})



const waveformRef = ref(null)

const wavesurfer = ref(null)

const isPlaying = ref(false)



const imageUrl = computed(() => (props.imagePath ? `/${props.imagePath}` : ''))

const audioUrl = computed(() => (props.audioPath ? `/${props.audioPath}` : ''))



const initWaveSurfer = () => {

  if (!audioUrl.value || !waveformRef.value || wavesurfer.value) return



  wavesurfer.value = WaveSurfer.create({

    container: waveformRef.value,

    waveColor: '#50C878',

    progressColor: '#2E8B57',

    height: 64,

    barWidth: 2

  })



  wavesurfer.value.load(audioUrl.value)



  wavesurfer.value.on('finish', () => {

    isPlaying.value = false

  })

}



const togglePlay = () => {

  if (!wavesurfer.value) return

  wavesurfer.value.playPause()

  isPlaying.value = wavesurfer.value.isPlaying()

}



onMounted(() => {

  initWaveSurfer()

})



onUnmounted(() => {

  if (wavesurfer.value) {

    wavesurfer.value.destroy()

    wavesurfer.value = null

  }

})

</script>



<style scoped>

.image-renderer {

  display: flex;

  flex-direction: column;

  gap: 12px;

}



.image-wrapper {

  display: flex;

  justify-content: center;

  align-items: center;

}



.score-image {

  max-width: 100%;

  max-height: 100%;

  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);

  background-color: #f5f5f0;

}



.audio-controls {

  display: flex;

  flex-direction: column;

  gap: 8px;

}



.waveform {

  width: 100%;

  height: 64px;

}



.play-btn {

  align-self: flex-start;

  padding: 4px 12px;

  border-radius: 4px;

  border: 1px solid #ccc;

  background: #fff;

  cursor: pointer;

}

</style>

