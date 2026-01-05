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

  // 映射表 (Map)
  const elemToIdMap = new Map()
  const noteIdToTimingMap = new Map()

  const { selector, element, renderOptions = {}, immediate = true } = options

  const doRender = () => {
    const abc = abcStringRef?.value ?? ''
    syntaxError.value = ''
    visualObj.value = null
    elemToIdMap.clear()
    noteIdToTimingMap.clear()

    if (!abc || !abc.trim()) return

    try {
      // 1. 渲染五线谱 (用于显示和播放)
      // 注意：这里可能会发生 visualTranspose，且宽度是响应式的
      let tuneStaff = null
      if (selector || element) {
        const target = element || selector
        tuneStaff = abcjs.renderAbc(target, abc, {
          responsive: 'resize',
          add_classes: true,
          staffwidth: 800, // 保持与 Editor 一致的宽度策略
          ...renderOptions
        })
      }

      // 2. 渲染简谱数据源 (Headless)
      // 这是一个纯数据对象，不依赖 DOM 宽度
      const tuneJianpu = abcjs.renderAbc('*', abc, {
        add_classes: true
      })

      // 3. 建立映射 (Flatten Strategy - 核心修复)
      // 无论五线谱和简谱各自换了多少行，它们的音符总序列是绝对一致的。
      // 我们把它们“拍扁”成一维数组，然后一一对应。

      if (tuneJianpu && tuneJianpu[0]) {
        const flatJianpuNotes = flattenNotes(tuneJianpu[0])
        // 如果没有 tuneStaff (比如只在简谱模式)，我们只处理简谱 ID
        const flatStaffNotes = (tuneStaff && tuneStaff[0]) ? flattenNotes(tuneStaff[0]) : []

        // 校验：如果两者都存在，长度理论上应该一致
        // 如果不一致（极罕见），我们取较短的长度以防止报错
        const count = flatStaffNotes.length > 0 ? Math.min(flatJianpuNotes.length, flatStaffNotes.length) : flatJianpuNotes.length

        let uid = 0
        for (let i = 0; i < count; i++) {
          const jEl = flatJianpuNotes[i]
          const sEl = flatStaffNotes.length > 0 ? flatStaffNotes[i] : null

          // 为简谱元素生成 ID (供 JianpuRenderer 使用)
          const myId = `note_${uid++}`
          jEl._myId = myId

          // 如果有五线谱对应元素，建立关联
          if (sEl) {
            // 1. 记录时间信息 (供点击跳转)
            // 优先使用五线谱的时间信息，因为它对应音频
            if (sEl.midiPitches || sEl.startTiming !== undefined) {
              noteIdToTimingMap.set(myId, {
                midiPitches: sEl.midiPitches,
                startTiming: sEl.startTiming,
                duration: sEl.duration
              })
            }

            // 2. 建立 SVG 元素映射 (供播放高亮反查)
            if (sEl.abselem && sEl.abselem.elemset) {
              sEl.abselem.elemset.forEach(svgEl => {
                if (svgEl) elemToIdMap.set(svgEl, myId)
              })
            }
          }
        }

        // 赋值给响应式对象，驱动 UI 更新
        // Debug: Print visual note sequence
        console.groupCollapsed("[useAbcRenderer] Visual Note Sequence")
        flatJianpuNotes.forEach((el, idx) => {
          console.log(`#${idx} ID:${el._myId} Type:${el.el_type} Pitch:${el.pitches?.[0]?.pitch} Dur:${el.duration}`)
        })
        console.groupEnd()

        visualObj.value = tuneJianpu[0]
      }

    } catch (err) {
      console.error('[useAbcRenderer] Render Error:', err)
      syntaxError.value = err?.message || 'Syntax Error'
    }
  }

  // 辅助：将嵌套的 lines/staff/voices 结构展平为音符数组
  function flattenNotes(tune) {
    const notes = []
    if (!tune.lines) return notes

    tune.lines.forEach(line => {
      if (line.staff) {
        line.staff.forEach(staff => {
          if (staff.voices) {
            staff.voices.forEach(voice => {
              voice.forEach(el => {
                // 只提取实际音符/休止符，跳过小节线(bar)、调号(key)等
                // 必须与 Editor.vue 中的判定逻辑一致：
                // if (jianpuEl && jianpuEl.el_type === 'note') ...
                if (el.el_type === 'note') {
                  // 进一步过滤：必须是有内容的音符
                  if (el.rest || (el.pitches && el.pitches.length > 0)) {
                    notes.push(el)
                  }
                }
              })
            })
          }
        })
      }
    })
    return notes
  }

  if (abcStringRef && immediate) {
    watch(() => abcStringRef.value, doRender, { immediate: true })
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