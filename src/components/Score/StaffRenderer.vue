<template>

  <div class="staff-renderer">

    <div ref="paperRef" class="paper-container"></div>

  </div>

</template>



<script setup>

import { ref, watch, onMounted, onUnmounted } from 'vue'

import abcjs from 'abcjs'



/**

 * 五线谱只读渲染器（基础版）

 *

 * 说明：

 * - 当前以 abcCode 为主要输入，tune 预留给后续扩展（例如直接基于 visualObj 渲染）。

 * - 组件内部只负责调用 abcjs.renderAbc 渲染五线谱，并在 activeNoteIds 变化时高亮对应元素。

 */

const props = defineProps({

  abcCode: { type: String, default: '' },

  tune: { type: Object, default: null }, // 预留：未来可直接基于 visualObj 渲染

  activeNoteIds: { type: Array, default: () => [] }

})



const paperRef = ref(null)

let visualObjs = null



const renderStaff = () => {

  const code = props.abcCode || ''

  if (!paperRef.value || !code.trim()) return



  // 清空原有内容

  paperRef.value.innerHTML = ''



  try {

    visualObjs = abcjs.renderAbc(paperRef.value, code, {

      responsive: 'resize',

      add_classes: true,

      staffwidth: 800

    })

  } catch (e) {

    console.error('[StaffRenderer] 渲染五线谱失败:', e)

  }

}



const updateHighlight = () => {

  if (!paperRef.value) return



  // 清除旧高亮

  paperRef.value.querySelectorAll('.highlight-note').forEach(el => {

    el.classList.remove('highlight-note')

  })



  // 当前策略：依赖外部已在 SVG 元素上打好 data-note-id 属性

  if (!props.activeNoteIds || props.activeNoteIds.length === 0) return



  props.activeNoteIds.forEach(id => {

    const el = paperRef.value.querySelector(`[data-note-id="${id}"]`)

    if (el) el.classList.add('highlight-note')

  })

}



watch(

  () => props.abcCode,

  () => {

    renderStaff()

  },

  { immediate: true }

)



watch(

  () => props.activeNoteIds,

  () => {

    updateHighlight()

  }

)



onMounted(() => {

  renderStaff()

})



onUnmounted(() => {

  if (paperRef.value) {

    paperRef.value.innerHTML = ''

  }

})

</script>



<style scoped>

.staff-renderer {

  width: 100%;

  height: 100%;

}



.paper-container {

  width: 100%;

  height: 100%;

  background: #ffffff; /* 保证在深色背景下五线谱可见 */

  display: flex;

  align-items: flex-start;

  justify-content: center;

  overflow: auto;

}



/* 与 Editor 中的五线谱高亮样式保持一致 */

::deep(.highlight-note) {

  fill: #d03050 !important;

  stroke: #d03050 !important;

}

::deep(.highlight-note path) {

  fill: #d03050 !important;

  stroke: #d03050 !important;

}

::deep(g.highlight-note path) {

  fill: #d03050 !important;

  stroke: #d03050 !important;

}

</style>

