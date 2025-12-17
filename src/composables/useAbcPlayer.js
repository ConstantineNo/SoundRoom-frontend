import { ref, onUnmounted } from 'vue'
import abcjs from 'abcjs'

/**
 * ABC 音频播放封装
 *
 * 设计目标：
 * - 基于 abcjs.synth 提供统一的播放控制接口（play / pause / seek / stop）
 * - 暴露 activeNoteIds，供简谱/五线谱高亮联动
 *
 * 使用方式（基础版）：
 * const { initAudio, play, pause, seek, stop, activeNoteIds } = useAbcPlayer(visualObj)
 * initAudio('#audio')
 */
export function useAbcPlayer(visualObjRef) {
  const activeNoteIds = ref([])
  let synthControl = null

  // 简单版 cursorControl：仅同步 activeNoteIds，不处理跨视图的 DOM 高亮
  const cursorControl = {
    onStart() {
      activeNoteIds.value = []
    },
    onEvent(ev) {
      if (!ev || !ev.elements) {
        activeNoteIds.value = []
        return
      }
      const ids = []
      ev.elements.forEach((group) => {
        const arr = Array.isArray(group) ? group : [group]
        arr.forEach((el) => {
          if (el && el.abselem && el.abselem.elemset) {
            // abcjs 在 abselem 中会有 tune 对象引用，可以从 tune.abcelem 中找到 id
            const abselem = el.abselem
            if (abselem.elemset && abselem.elemset[0]) {
              const node = abselem.elemset[0]
              if (node && node.getAttribute) {
                const id = node.getAttribute('data-note-id')
                if (id) ids.push(id)
              }
            }
          }
        })
      })
      activeNoteIds.value = ids
    },
    onFinished() {
      activeNoteIds.value = []
    }
  }

  const initAudio = async (container, options = {}) => {
    const visualObj = visualObjRef?.value
    if (!visualObj) return

    if (!abcjs.synth.supportsAudio()) {
      console.warn('[useAbcPlayer] 当前环境不支持 WebAudio')
      return
    }

    if (synthControl) {
      try {
        synthControl.disable(true)
      } catch (e) {
        console.warn('[useAbcPlayer] 旧 synthControl 清理失败:', e)
      }
      synthControl = null
    }

    const target = typeof container === 'string' ? container : container
    synthControl = new abcjs.synth.SynthController()
    synthControl.load(target, cursorControl, {
      displayLoop: true,
      displayRestart: true,
      displayPlay: true,
      displayProgress: true,
      displayWarp: true,
      ...options.controllerOptions
    })

    try {
      await synthControl.setTune(visualObj, true, {
        chordsOff: true,
        ...options.tuneOptions
      })
    } catch (err) {
      console.error('[useAbcPlayer] 初始化音频失败:', err)
      throw err
    }
  }

  const play = () => {
    if (synthControl) synthControl.play()
  }

  const pause = () => {
    if (synthControl) synthControl.pause()
  }

  const stop = () => {
    if (synthControl) synthControl.stop()
  }

  const seek = (position, unit = 'seconds') => {
    if (!synthControl) return
    if (unit === 'percent') {
      synthControl.seek(position, 'percent')
    } else {
      synthControl.seek(position, 'seconds')
    }
  }

  onUnmounted(() => {
    if (synthControl) {
      try {
        synthControl.disable(true)
      } catch (e) {
        console.warn('[useAbcPlayer] 卸载时清理 synthControl 失败:', e)
      }
      synthControl = null
    }
  })

  return {
    initAudio,
    play,
    pause,
    stop,
    seek,
    activeNoteIds
  }
}

