<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import { useUserStore } from '../stores/user'
import ClassificationFields from '../components/Score/ClassificationFields.vue'
import { createScoreApi, createIntent, errorMessage, newSection, practiceLabel, sectionInput, statusLabel, noticeLabel } from '../utils/scoreApi'

const route = useRoute(), router = useRouter(), user = useUserStore()
const message = useMessage(), dialog = useDialog()
const api = createScoreApi(() => user.token)
const score = ref(null), etag = ref(null), loading = ref(false), error = ref(''), busy = ref(false)
const options = ref({ flute_keys: [], fingerings: [] })
const editing = ref(null), draft = ref(null), editError = ref(''), conflict = ref(false)
let editEtag, intent = createIntent(), copyIntent = createIntent(), generation = 0
const uploadPurpose = ref('score_image'), uploadArrangement = ref(null), uploadFile = ref(null), fileInput = ref(null), uploadError = ref('')
let uploadIntent = createIntent()
let previewGeneration = 0
const previews = ref({})
const previewLoading = ref(null)
const isOwner = computed(() => !!user.id && score.value?.owner?.id === user.id)
const arrangementOptions = computed(() => (score.value?.arrangements || []).map(a => ({ label: a.label, value: a.id })))
const purposeOptions = [{ label: '谱图 · PNG / JPEG', value: 'score_image' }, { label: '参考音频 · PCM WAV', value: 'reference_audio' }, { label: '机器谱 · UTF-8 ABC', value: 'machine_notation' }]
const accept = computed(() => ({ score_image: '.png,.jpg,.jpeg', reference_audio: '.wav', machine_notation: '.abc' })[uploadPurpose.value])
const purposeLabel = (purpose) => ({ score_image: '谱图', reference_audio: '参考音频', machine_notation: '机器谱' })[purpose] || purpose
const readable = noticeLabel
function clearPreviews() { previewGeneration++; Object.values(previews.value).forEach(x => URL.revokeObjectURL(x)); previews.value = {} }
async function load() {
  const current = ++generation
  loading.value = true; error.value = ''; clearPreviews()
  try {
    const result = await api('get', `/scores/${route.params.scoreId}`)
    if (current !== generation) return
    score.value = result.data; etag.value = result.etag
  } catch (e) { if (current === generation) { score.value = null; error.value = errorMessage(e) } }
  finally { if (current === generation) loading.value = false }
}
async function refresh() {
  const result = await api('get', `/scores/${score.value.id}`)
  score.value = result.data; etag.value = result.etag; clearPreviews()
}
function editMetadata() {
  draft.value = { title: score.value.title, original_key: score.value.original_key, notes: score.value.notes || '', tags: [...score.value.tags] }
  beginEdit('metadata')
}
function editArrangement(arrangement) {
  draft.value = arrangement ? JSON.parse(JSON.stringify(arrangement)) : { label: '', coverage: 'complete', is_default: false, notes: '', sections: [newSection()] }
  beginEdit('arrangement')
}
function beginEdit(kind) { editing.value = kind; editEtag = etag.value; editError.value = ''; conflict.value = false; intent = createIntent() }
function move(index, offset) { const sections = draft.value.sections; [sections[index], sections[index + offset]] = [sections[index + offset], sections[index]] }
function addSection() { draft.value.sections.push({ ...newSection(), location_label: '', key_basis: 'local' }) }
function warnings() {
  const notices = (score.value?.arrangements || []).flatMap(a => a.sections.flatMap(s => s.classification_evidence?.warnings || []))
  if (notices.some(x => x.reason === 'KEY_RELATION_MISMATCH' || x === 'KEY_RELATION_MISMATCH')) message.warning('已保留人工确认的笛调；它与当前规则的音级关系不同，请自行核实。')
}
async function save() {
  if (busy.value || conflict.value) return
  let data, path = `/scores/${score.value.id}`, method
  if (editing.value === 'metadata') {
    if (!draft.value.title?.trim() || !draft.value.original_key?.trim()) { editError.value = '请填写曲名和原调。'; return }
    data = { ...draft.value, title: draft.value.title.trim(), original_key: draft.value.original_key.trim() }; method = 'patch'
  } else {
    const d = draft.value
    if (!d.label?.trim() || d.sections.some(s => !s.location_label?.trim() || (!s.fingering.code && !s.fingering.raw?.trim()))) { editError.value = '请填写方案名称，以及每段的位置和指法。'; return }
    data = { label: d.label.trim(), coverage: d.coverage, notes: d.notes || null, is_default: d.is_default, sections: d.sections.map(sectionInput) }
    path += `/arrangements${d.id ? `/${d.id}` : ''}`; method = d.id ? 'put' : 'post'
  }
  busy.value = true; editError.value = ''
  try {
    const result = await api(method, path, { data, etag: editEtag, ...(method === 'post' ? { key: intent(data) } : {}) })
    etag.value = result.etag; editing.value = null
    message.success('已保存演奏安排')
    try { await refresh(); warnings() } catch { error.value = '内容已保存，但刷新失败，请重新加载。' }
  } catch (e) {
    editError.value = errorMessage(e)
    if (e.response?.status === 412) {
      conflict.value = true
      try { await refresh() } catch { editError.value += ' 最新内容加载失败，请关闭表单后重试。' }
    }
  } finally { busy.value = false }
}
async function mutate(method, suffix, config = {}, success = '操作已完成') {
  if (busy.value) return
  busy.value = true
  try {
    await api(method, `/scores/${score.value.id}${suffix}`, { etag: etag.value, ...config })
    message.success(success)
    try { await refresh() } catch { error.value = '操作已完成，但刷新失败，请重新加载。' }
  } catch (e) {
    message.error(errorMessage(e))
    if (e.response?.status === 412) { try { await refresh() } catch { error.value = '最新内容加载失败，请重新加载。' } }
  } finally { busy.value = false }
}
function visibility() {
  const publish = score.value.visibility !== 'public'
  dialog.warning({ title: publish ? '公开曲目？' : '撤回公开？', content: publish ? '其他人将能查看、使用和复制曲目及演奏方案。附件仍独立私有；公开不代表跟练谱就绪。' : '撤回后其他人将无法继续访问此曲目。', positiveText: publish ? '确认公开' : '确认撤回', negativeText: '取消', onPositiveClick: () => mutate('post', publish ? '/publish' : '/unpublish', {}, publish ? '曲目已公开，附件保持独立权限' : '已撤回公开') })
}
const deleting = ref(null), replacement = ref(null)
function deleteArrangement(a) { deleting.value = a; replacement.value = null }
async function confirmDelete() {
  const a = deleting.value
  if (a.is_default && !replacement.value) return
  await mutate('delete', `/arrangements/${a.id}`, { params: a.is_default ? { replacement_default_id: replacement.value } : undefined }, '方案已删除，曲目资料保留')
  deleting.value = null
}
async function copy() {
  if (!user.isLoggedIn) { router.push('/login'); return }
  busy.value = true
  try {
    const { data } = await api('post', `/scores/${score.value.id}/copies`, { key: copyIntent(score.value.id) })
    message.success('已复制到我的曲谱，默认私有'); router.push(`/scores/${data.id}`)
  } catch (e) { message.error(errorMessage(e)) }
  finally { busy.value = false }
}
function chooseFile(event) { uploadFile.value = event.target.files[0] || null; uploadError.value = ''; uploadIntent = createIntent() }
watch(uploadPurpose, () => { uploadFile.value = null; if (fileInput.value) fileInput.value.value = ''; uploadError.value = '' })
async function upload() {
  const file = uploadFile.value
  if (!file || (uploadPurpose.value === 'machine_notation' && !uploadArrangement.value)) { uploadError.value = '请选择文件；机器谱还需要选择所属方案。'; return }
  if (file.size > 20 * 1024 * 1024) { uploadError.value = '文件不能超过 20 MiB。'; return }
  const data = new FormData(); data.append('file', file); data.append('purpose', uploadPurpose.value)
  if (uploadArrangement.value) data.append('arrangement_id', uploadArrangement.value)
  busy.value = true; uploadError.value = ''
  try {
    await api('post', `/scores/${score.value.id}/assets`, { data, etag: etag.value, key: uploadIntent([file.name, file.size, file.lastModified, uploadPurpose.value, uploadArrangement.value]) })
    uploadFile.value = null; if (fileInput.value) fileInput.value.value = ''; uploadIntent = createIntent()
    message.success('资料已保存；跟练能力需另行验证')
    try { await refresh() } catch { error.value = '上传成功，但刷新失败，请重新加载。' }
  } catch (e) { uploadError.value = errorMessage(e); if (e.response?.status === 412) { try { await refresh() } catch { /* Keep the upload error and file for retry. */ } } }
  finally { busy.value = false }
}
async function preview(asset) {
  if (previews.value[asset.id]) { URL.revokeObjectURL(previews.value[asset.id]); delete previews.value[asset.id]; return }
  const current = previewGeneration, token = user.token
  previewLoading.value = asset.id
  try {
    const result = await api('get', `/scores/${score.value.id}/assets/${asset.id}`, { blob: true })
    if (current !== previewGeneration || token !== user.token) return
    previews.value[asset.id] = URL.createObjectURL(result.data)
  } catch (e) { message.error(errorMessage(e)) }
  finally { previewLoading.value = null }
}
function removeAsset(asset) { dialog.warning({ title: '移除此资料？', content: '曲目分类会保留，关联的跟练能力可能失效。', positiveText: '确认移除', negativeText: '取消', onPositiveClick: () => mutate('delete', `/assets/${asset.id}`, {}, '已移除资料关联') }) }
async function initialize() {
  editing.value = null; deleting.value = null; score.value = null; etag.value = null; clearPreviews(); copyIntent = createIntent()
  await Promise.all([load(), user.fetchUserInfo()])
}
watch(() => route.params.scoreId, initialize)
watch(() => user.token, initialize)
onMounted(async () => { await initialize(); try { options.value = (await api('get', '/score-classification-options')).data } catch (e) { message.error(errorMessage(e)) } })
onBeforeUnmount(() => { generation++; clearPreviews() })
</script>

<template>
  <main class="score-detail">
    <n-button text @click="router.push('/library')">← 返回曲谱库</n-button>
    <n-skeleton v-if="loading" height="300px" style="margin-top: 24px" />
    <n-alert v-if="error" type="error" style="margin-top: 20px">{{ error }} <n-button @click="load">重新加载</n-button></n-alert>
    <template v-if="score && !loading">
      <header class="detail-heading"><div><div class="eyebrow">曲目档案 · {{ score.visibility === 'public' ? '公开' : '仅自己可见' }}</div><h1>{{ score.title }}</h1><p class="muted">原调 {{ score.original_key }} · {{ score.arrangements.length }} 套演奏方案</p></div>
        <n-space v-if="isOwner"><n-button :disabled="busy || !etag" @click="editMetadata">编辑曲目信息</n-button><n-button :disabled="busy || !etag" @click="visibility">{{ score.visibility === 'public' ? '撤回公开' : '公开曲目' }}</n-button></n-space>
        <n-button v-else-if="score.visibility === 'public'" :loading="busy" @click="copy">复制到我的曲谱</n-button>
      </header>
      <p v-if="score.notes" class="detail-notes">{{ score.notes }}</p>
      <n-space v-if="score.tags.length" style="margin-bottom: 20px"><n-tag v-for="tag in score.tags" :key="tag">{{ tag }}</n-tag></n-space>
      <n-alert v-if="score.classification_incomplete" type="warning" :show-icon="false">部分演奏段尚未归类或需要复核。已知笛调不代表完整用笛安排。</n-alert>
      <div class="section-heading"><div><h2>演奏方案</h2><p class="muted">每套方案是一种可选安排；同一方案内的演奏段需要按顺序组合使用。</p></div><n-button v-if="isOwner" :disabled="busy || !etag" type="primary" secondary @click="editArrangement(null)">＋ 另一套方案</n-button></div>
      <article v-for="arrangement in score.arrangements" :key="arrangement.id" class="arrangement-card">
        <div class="row-between"><div><h3>{{ arrangement.label }} <n-tag v-if="arrangement.is_default" size="small" type="success" :bordered="false">默认方案</n-tag></h3><p class="muted">{{ arrangement.coverage === 'complete' ? '已登记完整安排' : '演奏范围待核实' }}</p></div><n-space v-if="isOwner"><n-button size="small" :disabled="busy || !etag" @click="editArrangement(arrangement)">编辑方案</n-button><n-button size="small" :disabled="busy || !etag || score.arrangements.length === 1" @click="deleteArrangement(arrangement)">删除</n-button></n-space></div>
        <p v-if="arrangement.notes" class="detail-notes">{{ arrangement.notes }}</p>
        <n-space class="arrangement-flags"><n-tag v-if="arrangement.requires_flute_switch" type="warning" size="small">需换笛</n-tag><n-tag v-if="arrangement.requires_fingering_switch" type="info" size="small">需换指法</n-tag><n-tag v-if="!arrangement.classification_complete" type="warning" size="small">安排尚未全部确认</n-tag></n-space>
        <ol class="section-sequence"><li v-for="(section, index) in arrangement.sections" :key="section.id"><div class="section-number">{{ index + 1 }}</div><div class="section-content"><div class="row-between"><strong>{{ section.location_label }}</strong><n-tag :type="section.classification_status === 'confirmed' ? 'success' : 'warning'" size="small" :bordered="false">{{ statusLabel(section.classification_status) }}</n-tag></div><p class="section-combination">{{ section.flute_key ? `${section.flute_key} 调笛` : '笛调待确认' }} <span>/</span> {{ section.fingering.label || section.fingering.raw || '指法待确认' }}</p><p v-if="section.local_key || section.performance_key" class="muted">{{ section.local_key ? `段落调性 ${section.local_key}` : '' }} {{ section.performance_key ? `实际演奏调性 ${section.performance_key}` : '' }}</p><p v-if="section.notes" class="muted">{{ section.notes }}</p><p v-if="isOwner && section.classification_evidence?.previous_flute_key && !section.flute_key" class="muted">原确认 {{ section.classification_evidence.previous_flute_key }} 调笛，仅供复核</p><p v-for="(warning, i) in section.classification_evidence?.warnings || []" :key="i" class="muted">{{ readable(warning) }}</p></div></li></ol>
        <div class="practice-status"><div><strong>{{ practiceLabel(arrangement.practice_capability) }}</strong><p v-for="(reason, i) in arrangement.practice_capability?.reasons || []" :key="i" class="muted">{{ readable(reason) }}</p><p class="muted">谱图、参考音频或已保存的机器谱，不等于可跟练。</p></div><n-button disabled>{{ arrangement.practice_capability?.available ? '跟练入口待接入' : '暂不可跟练' }}</n-button></div>
      </article>
      <div class="section-heading"><div><h2>曲谱与参考资料</h2><p class="muted">资料可随时补充。曲目公开不会自动公开附件。</p></div></div>
      <section class="assets-panel">
        <div v-if="!score.assets?.length" class="asset-empty">还没有可查看的资料，曲目分类仍可正常使用。</div>
        <article v-for="asset in score.assets || []" :key="asset.id" class="asset-item"><div class="row-between"><div><strong>{{ purposeLabel(asset.purpose) }} #{{ asset.id }}</strong><p class="muted">{{ asset.media_type }} · {{ ((asset.size || 0) / 1024).toFixed(1) }} KB <span v-if="asset.arrangement_id">· {{ score.arrangements.find(a => a.id === asset.arrangement_id)?.label || '关联方案' }}</span> · {{ ({ stored: '已保存', processing: '处理中', ready: '资料已就绪', failed: '处理失败' })[asset.processing_status] || asset.processing_status }}</p></div><n-space><n-button size="small" :loading="previewLoading === asset.id" @click="preview(asset)">{{ previews[asset.id] ? '收起' : '查看资料' }}</n-button><n-button v-if="isOwner" size="small" :disabled="busy || !etag" @click="removeAsset(asset)">移除</n-button></n-space></div><p v-for="(issue, i) in asset.issues || []" :key="i" class="muted">{{ readable(issue) }}</p><div v-if="previews[asset.id]" class="asset-preview"><img v-if="asset.purpose === 'score_image'" :src="previews[asset.id]" alt="曲谱图片" /><audio v-else-if="asset.purpose === 'reference_audio'" controls :src="previews[asset.id]" /><a v-else :href="previews[asset.id]" :download="`score-${score.id}-${asset.id}.abc`">下载 ABC 曲谱</a></div></article>
        <n-form v-if="isOwner" class="upload-form" :disabled="busy" @submit.prevent="upload"><h3>补充资料</h3><div class="form-grid"><n-form-item label="资料类型"><n-select v-model:value="uploadPurpose" :options="purposeOptions" /></n-form-item><n-form-item label="所属方案" :required="uploadPurpose === 'machine_notation'"><n-select v-model:value="uploadArrangement" clearable :options="arrangementOptions" placeholder="机器谱必须选择方案" /></n-form-item></div><label class="file-label">选择文件（最多 20 MiB）<input ref="fileInput" type="file" :accept="accept" :disabled="busy" @change="chooseFile" /></label><n-alert v-if="uploadError" type="error" class="form-error">{{ uploadError }}</n-alert><n-button attr-type="submit" :loading="busy" :disabled="!uploadFile || !etag" type="primary" secondary>上传资料</n-button></n-form>
      </section>
    </template>
    <n-modal :show="!!editing" :mask-closable="false" :close-on-esc="!busy" @update:show="value => { if (!value) editing = null }"><n-card class="score-modal wide-modal" :title="editing === 'metadata' ? '编辑曲目信息' : draft?.id ? '编辑演奏方案' : '新增另一套演奏方案'" role="dialog" aria-modal="true">
      <n-form v-if="draft" :disabled="busy || conflict" @submit.prevent="save">
        <template v-if="editing === 'metadata'"><div class="form-grid"><n-form-item label="曲名" required><n-input v-model:value="draft.title" :maxlength="100" /></n-form-item><n-form-item label="曲目原调" required><n-input v-model:value="draft.original_key" :maxlength="200" /></n-form-item></div><p class="muted">修改原调后，依赖此原调的已确认段将需要复核。</p><n-form-item label="标签"><n-dynamic-tags v-model:value="draft.tags" /></n-form-item></template>
        <template v-else><div class="form-grid"><n-form-item label="方案名称" required><n-input v-model:value="draft.label" placeholder="例如：常用方案" :maxlength="100" /></n-form-item><n-form-item label="演奏范围"><n-select v-model:value="draft.coverage" :options="[{ label: '完整安排', value: 'complete' }, { label: '范围待核实', value: 'unknown' }]" /></n-form-item></div><n-checkbox v-model:checked="draft.is_default" :disabled="score?.arrangements.find(a => a.id === draft.id)?.is_default">设为默认方案</n-checkbox>
          <div v-for="(section, index) in draft.sections" :key="section.id || section._key || index" class="section-editor"><div class="row-between"><h3>演奏段 {{ index + 1 }}</h3><n-space><n-button size="small" :disabled="index === 0" @click="move(index, -1)">上移</n-button><n-button size="small" :disabled="index === draft.sections.length - 1" @click="move(index, 1)">下移</n-button><n-button size="small" :disabled="draft.sections.length === 1" @click="draft.sections.splice(index, 1)">移除段</n-button></n-space></div><n-form-item label="段落位置" required><n-input v-model:value="section.location_label" placeholder="全曲、开头、转调后、尾声……无需小节号" :maxlength="200" /></n-form-item><ClassificationFields v-model="draft.sections[index]" :original-key="score.original_key" :options="options" advanced /><n-form-item label="本段备注"><n-input v-model:value="section.notes" placeholder="演奏提示（选填）" /></n-form-item></div>
          <n-button dashed block @click="addSection">＋ 在当前方案添加演奏段（演奏中切换）</n-button><p class="muted">重复指法段会按顺序保留。例如开头 → 转调后 → 返回原指法。</p>
        </template>
        <n-form-item :label="editing === 'metadata' ? '曲目备注' : '方案备注'"><n-input v-model:value="draft.notes" type="textarea" /></n-form-item>
        <n-alert v-if="editError" type="error" class="form-error">{{ editError }}<p v-if="conflict">你的草稿保留在本表单中，最新内容已在详情页加载。请先复制需要保留的文字，关闭草稿后重新编辑。</p></n-alert>
        <div class="modal-actions"><n-button :disabled="busy" @click="editing = null">{{ conflict ? '关闭草稿，查看最新内容' : '取消' }}</n-button><n-button attr-type="submit" type="primary" :loading="busy" :disabled="conflict || !editEtag">保存</n-button></div>
      </n-form>
    </n-card></n-modal>
    <n-modal :show="!!deleting" :mask-closable="!busy" @update:show="value => { if (!value) deleting = null }"><n-card class="score-modal" title="删除演奏方案" role="dialog" aria-modal="true"><p>将删除「{{ deleting?.label }}」及其分段，曲目和资料保留。</p><n-form-item v-if="deleting?.is_default" label="请选择替代的默认方案" required><n-select v-model:value="replacement" :options="arrangementOptions.filter(a => a.value !== deleting.id)" /></n-form-item><div class="modal-actions"><n-button :disabled="busy" @click="deleting = null">取消</n-button><n-button type="error" :loading="busy" :disabled="deleting?.is_default && !replacement" @click="confirmDelete">确认删除</n-button></div></n-card></n-modal>
  </main>
</template>
