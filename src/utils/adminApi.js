import axios from 'axios'
import { useUserStore } from '../stores/user'

/**
 * 获取认证头
 */
const getAuthHeaders = () => {
  // 在函数内部获取store，确保每次调用时都能获取最新的token
  const userStore = useUserStore()
  if (!userStore.token) {
    throw new Error('未登录')
  }
  return {
    'Authorization': `Bearer ${userStore.token}`
  }
}

/**
 * 处理API错误
 */
const handleError = (error) => {
  if (error.response) {
    if (error.response.status === 401) {
      throw new Error('未授权，请重新登录')
    } else if (error.response.status === 403) {
      throw new Error('权限不足，需要管理员权限')
    } else if (error.response.status === 404) {
      throw new Error('接口不存在')
    } else {
      throw new Error(error.response.data?.detail || '请求失败')
    }
  } else {
    throw new Error('网络错误，请检查网络连接')
  }
}

/**
 * 获取仪表盘概览数据
 */
export const getDashboardSummary = async () => {
  try {
    const response = await axios.get('/api/admin/dashboard/summary', {
      headers: getAuthHeaders()
    })
    return response.data
  } catch (error) {
    handleError(error)
  }
}

/**
 * 获取访客日志列表
 * @param {number} page - 页码，默认1
 * @param {number} size - 每页数量，默认20
 */
export const getVisitorLogs = async (page = 1, size = 20) => {
  try {
    const response = await axios.get('/api/admin/logs/visitors', {
      params: { page, size },
      headers: getAuthHeaders()
    })
    return response.data
  } catch (error) {
    handleError(error)
  }
}

/**
 * 获取每日流量趋势
 * @param {string} startDate - 开始日期 (YYYY-MM-DD)
 * @param {string} endDate - 结束日期 (YYYY-MM-DD)
 * @param {number} limit - 返回最近多少天的数据，默认30
 */
export const getDailyStats = async (startDate = null, endDate = null, limit = 30) => {
  try {
    const params = {}
    if (limit) params.limit = limit
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate
    
    const response = await axios.get('/api/admin/stats/daily', {
      params,
      headers: getAuthHeaders()
    })
    return response.data
  } catch (error) {
    handleError(error)
  }
}

/**
 * 获取封禁IP列表
 */
export const getBannedIPs = async () => {
  try {
    const response = await axios.get('/api/admin/security/bans', {
      headers: getAuthHeaders()
    })
    return response.data
  } catch (error) {
    handleError(error)
  }
}

/**
 * 手动封禁IP
 * @param {string} ipAddress - IP地址
 * @param {string} reason - 封禁原因
 * @param {number} durationMinutes - 封禁时长（分钟），不填则为永久封禁
 */
export const banIP = async (ipAddress, reason, durationMinutes = null) => {
  try {
    const params = {}
    if (durationMinutes !== null) {
      params.duration_minutes = durationMinutes
    }
    
    const response = await axios.post('/api/admin/security/bans', 
      { ip_address: ipAddress, reason },
      {
        params,
        headers: getAuthHeaders()
      }
    )
    return response.data
  } catch (error) {
    handleError(error)
  }
}

/**
 * 解封IP
 * @param {string} ipAddress - IP地址
 */
export const unbanIP = async (ipAddress) => {
  try {
    const response = await axios.delete(`/api/admin/security/bans/${ipAddress}`, {
      headers: getAuthHeaders()
    })
    return response.data
  } catch (error) {
    handleError(error)
  }
}

