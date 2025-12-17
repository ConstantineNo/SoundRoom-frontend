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

  // 可选：渲染目标容器
  // - selector: 传入字符串选择器（如 '#paper'）
  // - element:  直接传入 DOM 元素引用
  const { selector, element, renderOptions = {}, immediate = true } = options

  const doRender = () => {
    const abc = abcStringRef?.value ?? ''
    syntaxError.value = ''
    visualObj.value = null

    if (!abc || !abc.trim()) {
      return
    }

    try {
      // 1. 渲染到 DOM（如果提供了容器），用于五线谱等可视化
      if (selector || element) {
        const target = element || selector
        abcjs.renderAbc(target, abc, {
          responsive: 'resize',
          add_classes: true,
          staffwidth: 800,
          ...renderOptions
        })
      }

      // 2. 单独生成一个 Tune 对象，不依赖 DOM，用于简谱等纯数据场景
      const tune = abcjs.renderAbc('*', abc, {
        add_classes: true
      })

      if (tune && tune[0]) {
        visualObj.value = tune[0]
      } else {
        visualObj.value = null
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
    // 目前没有持久化的 abcjs 实例需要清理，保留钩子以便未来扩展
  })

  return {
    visualObj,
    syntaxError,
    renderAbc: doRender
  }
}

