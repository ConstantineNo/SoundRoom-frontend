import { watch } from 'vue'

/**
 * 高亮音符自动滚屏
 *
 * @param {import('vue').Ref<HTMLElement | null>} containerRef - 滚动容器（如简谱/五线谱外层 div）
 * @param {import('vue').Ref<string[]>} activeNoteIds - 当前高亮的 noteId 列表
 * @param {(id: string) => HTMLElement | null} getNoteElementById - 从 noteId 映射到具体 DOM 元素的函数（由各 Renderer 提供）
 * @param {Object} options - 选项
 * @param {number} options.offset - 滚动时希望元素出现在容器顶部向下的偏移（像素）
 */
export function useAutoScroll(containerRef, activeNoteIds, getNoteElementById, options = {}) {
  const { offset = 80 } = options

  const scrollToNote = (id) => {
    const container = containerRef?.value
    if (!container || !id) return

    const el = getNoteElementById(id)
    if (!el) return

    const containerRect = container.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()

    const delta = elRect.top - containerRect.top
    const targetScrollTop = container.scrollTop + delta - offset

    container.scrollTo({
      top: Math.max(targetScrollTop, 0),
      behavior: 'smooth'
    })
  }

  // 当高亮音符变化时，滚动到第一个高亮音符位置
  watch(
    activeNoteIds,
    (ids) => {
      if (!ids || ids.length === 0) return
      scrollToNote(ids[0])
    },
    { deep: false }
  )

  return {
    scrollToNote
  }
}

