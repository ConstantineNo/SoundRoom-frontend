/**
 * 将日期时间格式化为东八区（UTC+8）时间
 * @param {string|Date} dateTime - ISO 8601 格式的日期时间字符串或 Date 对象
 * @returns {string} 格式化后的日期时间字符串 (YYYY/MM/DD HH:mm:ss)
 */
export function formatToCST(dateTime) {
  if (!dateTime) return '-'
  
  const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime
  
  if (isNaN(date.getTime())) {
    return '-'
  }
  
  // 转换为东八区时间（UTC+8）
  const cstOffset = 8 * 60 // 8小时 = 480分钟
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000)
  const cstTime = new Date(utcTime + (cstOffset * 60000))
  
  // 格式化为 YYYY/MM/DD HH:mm:ss
  const year = cstTime.getFullYear()
  const month = String(cstTime.getMonth() + 1).padStart(2, '0')
  const day = String(cstTime.getDate()).padStart(2, '0')
  const hours = String(cstTime.getHours()).padStart(2, '0')
  const minutes = String(cstTime.getMinutes()).padStart(2, '0')
  const seconds = String(cstTime.getSeconds()).padStart(2, '0')
  
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
}

