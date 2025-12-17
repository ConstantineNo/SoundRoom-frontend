<template>

  <div class="staff-renderer">

    <div ref="paperRef" class="paper-container"></div>

  </div>

</template>



<script setup>

import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'

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
    // 尝试 data-note-id (自定义渲染)
    let el = paperRef.value.querySelector(`[data-note-id="${id}"]`)
    
    // 如果没找到，尝试类名 (abcjs 标准渲染 uses abcjs-nXX)
    if (!el && typeof id === 'string' && id.startsWith('abcjs-n')) {
       el = paperRef.value.querySelector(`.${id}`)
    }

    if (el) el.classList.add('highlight-note')
  })

}



watch(

  () => props.abcCode,

  () => {

    // 使用 nextTick 确保 DOM 已准备好
    nextTick(() => {
      renderStaff()
    })

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

  // 确保 DOM 准备好后再渲染
  nextTick(() => {

    // 如果 abcCode 已经有值，立即渲染
    if (props.abcCode && props.abcCode.trim()) {
      renderStaff()
    }

  })

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

/* 与 Editor 中的五线谱高亮样式保持一致 */
:deep(.highlight-note) {
  fill: #d03050 !important;
  stroke: #d03050 !important;
}
:deep(.highlight-note path) {
  fill: #d03050 !important;
  stroke: #d03050 !important;
}
:deep(g.highlight-note path) {
  fill: #d03050 !important;
  stroke: #d03050 !important;
}

/* 强制覆盖全局样式，确保五线谱内容为黑色 */
:deep(svg) {
  color: black;
}
:deep(svg text) {
  fill: black;
}
:deep(svg path) {
  fill: black; 
  stroke: none; /* 通常abcjs的path是填充的，线条也是通过path绘制的 */
}
/* 具体的abcjs类可能需要更具体的处理，但通常 fill: black 足够 */
:deep(.abcjs-staff) {
  fill: black;
}
:deep(.abcjs-note) {
  fill: black;
}
:deep(.abcjs-beam-elem) {
  fill: black;
}
:deep(.abcjs-slur) {
  fill: black;
}


</style>

