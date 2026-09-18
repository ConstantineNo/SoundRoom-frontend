import axios from 'axios'

// Classification endpoints use an envelope; authentication still returns bare JSON.
export function createScoreApi(getToken) {
  return async (method, path, { data, params, etag, key, blob = false } = {}) => {
    const token = getToken()
    const response = await axios.request({
      method, url: `/api${path}`, data, params, timeout: data instanceof FormData ? 120000 : 20000,
      responseType: blob ? 'blob' : 'json',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(etag ? { 'If-Match': etag } : {}),
        ...(key ? { 'Idempotency-Key': key } : {})
      }
    })
    if (!blob && response.data?.code !== 0) throw new Error('服务响应格式不符合分类接口约定')
    return { data: blob ? response.data : response.data.data, etag: response.headers.etag }
  }
}

export const reasonOf = (error) => error.response?.data?.detail?.reason
export function errorMessage(error) {
  const messages = {
    OWNER_REQUIRED: '只有创建者可以修改此曲目。',
    CANDIDATE_STALE: '候选已过期或依据已变化，请重新推算，或明确选择人工确认。',
    EDIT_CONFLICT: '内容已在其他位置更新。请对照最新内容，再重新编辑保存。',
    LAST_ARRANGEMENT: '至少需要保留一套演奏方案。',
    DEFAULT_REPLACEMENT_REQUIRED: '请先选择另一套默认方案。',
    NOTATION_NOT_READY: '跟练谱尚未就绪，分类和资料仍可正常管理。',
    IDEMPOTENCY_CONFLICT: '此次请求内容已改变，请刷新后重试。'
  }
  if (messages[reasonOf(error)]) return messages[reasonOf(error)]
  const status = error.response?.status
  return ({ 401: '登录已过期，请重新登录后继续。', 403: '服务拒绝了访问，请稍后重试或联系管理员。',
    404: '曲目或资料不存在，或你没有访问权限。', 412: messages.EDIT_CONFLICT,
    413: '文件超过 20 MiB，请选择较小的文件。', 415: '不支持此文件，请使用 PNG、JPEG、PCM WAV 或 UTF-8 ABC。',
    429: '请求过于频繁，请稍后再试。',
    422: '填写内容不符合要求，请检查必填项、调性和指法。', 428: '未取得编辑凭据，请重新加载曲目。'
  })[status] || (error.response ? '操作未完成，请稍后重试。' : '无法连接服务，请检查网络后重试。')
}

// One key per unchanged intent, including retries after a lost response.
export function createIntent() {
  let signature, key
  return (payload) => {
    const next = JSON.stringify(payload)
    if (next !== signature) { signature = next; key = crypto.randomUUID() }
    return key
  }
}

export const statusLabel = (status) => ({ pending: '待归类', needs_review: '待复核', confirmed: '已确认' })[status] || '待归类'
export const practiceLabel = (capability) => capability?.available ? '可跟练' : ({
  not_provided: '未提供跟练谱', unverified: '跟练谱待验证', unavailable: '跟练暂不可用'
})[capability?.status] || '未提供跟练谱'

export function newSection() {
  return { _key: crypto.randomUUID(), location_label: '全曲', fingering: { code: 'closed_2' }, key_basis: 'original',
    local_key: null, performance_key: null, instrument_profile: 'standard_six_hole_dizi', notes: null }
}

export function sectionInput(section) {
  return {
    ...(section.id ? { id: section.id } : {}), location_label: section.location_label.trim(),
    fingering: section.fingering.code ? { code: section.fingering.code } : { raw: section.fingering.raw?.trim() },
    local_key: section.local_key || null, performance_key: section.performance_key || null,
    key_basis: section.key_basis || 'original', instrument_profile: section.instrument_profile || 'standard_six_hole_dizi',
    notes: section.notes || null,
    ...(section.classification_decision ? { classification_decision: section.classification_decision } : {})
  }
}

export function noticeLabel(notice) {
  const code = typeof notice === 'string' ? notice : notice?.reason
  const labels = {
    NOTATION_NOT_PROVIDED: '这套方案还未提供跟练谱。',
    NOTATION_NOT_READY: '跟练谱尚未就绪。',
    NOTATION_UNVERIFIED: '曲谱已保存，仍需完成跟练验证。',
    NOTATION_NOT_VERIFIED: '曲谱已保存，仍需完成跟练验证。',
    KEY_RELATION_MISMATCH: '已保留人工确认的笛调；它与当前规则的音级关系不同，请自行核实。',
    RELATION_NOT_CHECKED: '当前规则无法核对这套组合，请自行确认。'
  }
  if (labels[code]) return labels[code]
  const text = typeof notice === 'string' ? notice : notice?.message || code || ''
  return /^[A-Z][A-Z0-9_]+$/.test(text) ? '此项仍需核实，暂不代表已可跟练。' : text
}
