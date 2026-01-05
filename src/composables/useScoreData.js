// src/composables/useScoreData.js
import { ref } from 'vue'
import axios from 'axios'

/**
 * 曲谱数据获取与状态管理
 * - 统一封装 /api/scores/:id 的请求逻辑
 * - 可在 Editor / Workbench 等页面复用
 */
export function useScoreData() {
  const score = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const fetchScore = async (id) => {
    if (!id) return
    loading.value = true
    error.value = null
    try {
      const response = await axios.get(`/api/scores/${id}`)
      score.value = response.data
    } catch (err) {
      console.error('[useScoreData] 加载曲谱失败:', err)
      error.value = err
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    score,
    loading,
    error,
    fetchScore
  }
}

