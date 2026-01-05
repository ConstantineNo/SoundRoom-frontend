// src/composables/useAbcRenderer.js
import { shallowRef, ref, watch, onUnmounted } from 'vue'
import abcjs from 'abcjs'

/**
 * ABC 渲染封装
 *
 * 设计目标：
 * - 提供一个通用的 abcjs.renderAbc 封装，用于生成 visualObj 供简谱/五线谱等 Renderer 复用
 * - 尽量保持无副作用：不强依赖具体页面 DOM，只通过可选 options 控制渲染容器
 *
 * 注意：
 * - 当前实现是“基础版”：不内置乐器选择与移调逻辑，这部分仍由 Editor 等上层根据需要自行处理。
 * - 后续如需复用 Editor 中的高级逻辑（MIDI program / visualTranspose / noteId 映射），可以在不破坏 API 的前提下逐步下沉到本 composable。
 */
export function useAbcRenderer(abcStringRef, options = {}) {
  const visualObj = shallowRef(null)
  const syntaxError = ref('')
  const elemToIdMap = new Map()
  const noteIdToTimingMap = new Map()

  // 可选：渲染目标容器
  // - selector: 传入字符串选择器（如 '#paper'）
  // - element:  直接传入 DOM 元素引用
  const { selector, element, renderOptions = {}, immediate = true } = options

  const doRender = () => {
    const abc = abcStringRef?.value ?? ''
    syntaxError.value = ''
    visualObj.value = null

    // Clear maps
    elemToIdMap.clear()
    noteIdToTimingMap.clear()

    if (!abc || !abc.trim()) {
      return
    }

    try {
      let tuneStaff = null
      let tuneJianpu = null

      // 1. 渲染到 DOM（如果提供了容器），用于五线谱等可视化
      if (selector || element) {
        const target = element || selector
        tuneStaff = abcjs.renderAbc(target, abc, {
          responsive: 'resize',
          add_classes: true,
          staffwidth: 800,
          ...renderOptions
        })
      }

      // 2. 单独生成一个 Tune 对象，不依赖 DOM，用于简谱等纯数据场景
      tuneJianpu = abcjs.renderAbc('*', abc, {
        add_classes: true
      })

      // 3. 建立映射关系 (Map Strategy)
      // 总是遍历简谱对象以注入 ID (JianpuScore 依赖 ID 生成 beams)
      // 如果存在 tuneStaff，则同时建立映射
      if (tuneJianpu && tuneJianpu[0]) {
        let uid = 0
        const jianpuLines = tuneJianpu[0].lines || []
        const staffLines = (tuneStaff && tuneStaff[0]) ? tuneStaff[0].lines : null

        // 以简谱为基准遍历
        for (let i = 0; i < jianpuLines.length; i++) {
          const jianpuLine = jianpuLines[i]
          const staffLine = staffLines ? staffLines[i] : null

          if (jianpuLine.staff) {
            for (let j = 0; j < jianpuLine.staff.length; j++) {
              const jianpuStaff = jianpuLine.staff[j]
              const staffStaff = (staffLine && staffLine.staff) ? staffLine.staff[j] : null

              if (jianpuStaff.voices) {
                for (let k = 0; k < jianpuStaff.voices.length; k++) {
                  const jianpuVoice = jianpuStaff.voices[k]
                  const staffVoice = (staffStaff && staffStaff.voices) ? staffStaff.voices[k] : null

                  if (jianpuVoice) {
                    // 如果存在对应的五线谱 voice，长度应一致；若不一致则防卫性处理
                    const len = jianpuVoice.length
                    for (let m = 0; m < len; m++) {
                      const jianpuEl = jianpuVoice[m]
                      const staffEl = (staffVoice && staffVoice[m]) ? staffVoice[m] : null

                      const myId = `note_${uid++}`

                      // 1. 给简谱元素注入 ID (核心修复：Workbench 即使没有 staff 也需要 ID)
                      if (jianpuEl) {
                        jianpuEl._myId = myId
                      }

                      // 2. 如果有五线谱元素，建立映射
                      if (staffEl) {
                        // 保存 abcjs 的 timing 信息
                        if (staffEl.midiPitches || staffEl.startTiming !== undefined) {
                          noteIdToTimingMap.set(myId, {
                            midiPitches: staffEl.midiPitches,
                            startTiming: staffEl.startTiming,
                            duration: staffEl.duration
                          })
                        }

                        // 建立 SVG 元素到 _myId 的映射
                        if (staffEl.abselem && staffEl.abselem.elemset) {
                          staffEl.abselem.elemset.forEach(svgEl => {
                            if (svgEl) {
                              elemToIdMap.set(svgEl, myId)
                            }
                          })
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[useAbcRenderer] 渲染异常:', err)
      syntaxError.value = err?.message || 'Syntax Error'
    }
  }

  if (abcStringRef && immediate) {
    watch(
      () => abcStringRef.value,
      () => {
        doRender()
      },
      { immediate: true }
    )
  }

  onUnmounted(() => {
    elemToIdMap.clear()
    noteIdToTimingMap.clear()
  })

  return {
    visualObj,
    syntaxError,
    elemToIdMap,
    noteIdToTimingMap,
    renderAbc: doRender
  }
}

