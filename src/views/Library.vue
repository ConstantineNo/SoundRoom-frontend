<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useUserStore } from '../stores/user'
import ClassificationFields from '../components/Score/ClassificationFields.vue'
import { createScoreApi, createIntent, errorMessage, newSection, practiceLabel } from '../utils/scoreApi'

const user = useUserStore()
const router = useRouter()
const route = useRoute()
const message = useMessage()
const api = createScoreApi(() => user.token)
const options = ref({ flute_keys: [], fingerings: [] })
const categories = ref({ groups: [] })
const scores = ref([])
const details = ref({})
const detailsLoading = ref(false)
const scope = ref(user.isLoggedIn ? 'mine' : 'public')
const flute = ref(null)
const fingering = ref(null)
const classification = ref('all')
const whole = ref(false)
const search = ref('')
const query = ref('')
const page = ref(1)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const showCreate = ref(false)
const saving = ref(false)
const createError = ref('')
const form = ref({})
let intent = createIntent()
let version = 0
let searchTimer
const selectedGroup = computed(() => categories.value.groups.find(x => x.flute_key === flute.value))
const currentFluteLabel = computed(() => options.value.flute_keys.find(x => x.code === flute.value)?.label)
const currentFingeringLabel = computed(() => options.value.fingerings.find(x => x.code === fingering.value)?.label)
const filterOptions = [{ label: '全部状态', value: 'all' }, { label: '全部已确认', value: 'confirmed' }, { label: '待归类', value: 'pending' }, { label: '待复核', value: 'needs_review' }]
async function load() {
  const current = ++version
  loading.value = true; error.value = ''; scores.value = []; details.value = {}; total.value = 0; detailsLoading.value = true
  try {
    const [groups, list] = await Promise.all([
      api('get', '/score-categories', { params: { scope: scope.value, q: query.value || undefined } }),
      api('get', '/scores/', { params: {
        scope: scope.value, q: query.value || undefined, page: page.value, size: 12,
        flute_key: flute.value || undefined, fingering: fingering.value || undefined,
        match: whole.value && flute.value && fingering.value ? 'whole' : 'any',
        classification: scope.value === 'mine' ? classification.value : 'all'
      } })
    ])
    if (current !== version) return
    categories.value = groups.data; scores.value = list.data.items; total.value = list.data.total
    if (page.value > Math.max(1, list.data.total_pages)) { page.value = Math.max(1, list.data.total_pages); return }
    loading.value = false
    // Summary DTO omits section labels and practice capability. Enrich only this page.
    const results = await Promise.allSettled(list.data.items.map(item => api('get', `/scores/${item.id}`)))
    if (current !== version) return
    details.value = Object.fromEntries(results.flatMap((result, index) => result.status === 'fulfilled' ? [[list.data.items[index].id, result.value.data]] : []))
  } catch (e) { if (current === version) { error.value = errorMessage(e); categories.value = { groups: [] } } }
  finally { if (current === version) { loading.value = false; detailsLoading.value = false } }
}
watch(search, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { query.value = search.value.trim() }, 300) })
watch([scope, flute, fingering, classification, whole, query], () => { if (page.value !== 1) page.value = 1; else load() })
watch(page, load)
watch(() => user.token, () => { showCreate.value = false; scope.value = user.isLoggedIn ? 'mine' : 'public'; classification.value = 'all'; load() })
function selectFlute(code) { flute.value = code; fingering.value = null; whole.value = false }
function selectScope(value) { scope.value = value; classification.value = 'all'; selectFlute(null) }
function showStatus(value) { selectFlute(null); classification.value = value }
function reset() { selectFlute(null); classification.value = 'all'; search.value = ''; query.value = '' }
function openCreate() {
  form.value = { title: '', original_key: '', notes: '', section: newSection() }
  intent = createIntent(); createError.value = ''; showCreate.value = true
}
async function create() {
  const f = form.value
  if (!f.title.trim() || !f.original_key.trim() || (!f.section.fingering.code && !f.section.fingering.raw?.trim())) { createError.value = '请填写曲名、原调和指法。'; return }
  const payload = { title: f.title.trim(), original_key: f.original_key.trim(), notes: f.notes || null, fingering: f.section.fingering,
    ...(f.section.classification_decision ? { classification_decision: f.section.classification_decision } : {}) }
  saving.value = true; createError.value = ''
  try {
    const { data } = await api('post', '/scores/', { data: payload, key: intent(payload) })
    showCreate.value = false; message.success('已登记为私有曲目，可继续补充演奏方案和资料')
    router.push(`/scores/${data.id}`)
  } catch (e) { createError.value = errorMessage(e) }
  finally { saving.value = false }
}
const matchArrangement = (scoreId, match) => details.value[scoreId]?.arrangements.find(a => a.id === match.arrangement_id)
const matchedSections = (scoreId, match) => matchArrangement(scoreId, match)?.sections.filter(s => match.section_ids?.includes(s.id)).map(s => s.location_label).join('、')
const combinationLabel = (item) => `${item.flute_key} 调笛 / ${options.value.fingerings.find(x => x.code === (item.fingering?.code || item.fingering || item.fingering_code))?.label || item.fingering?.label || item.fingering_code || item.fingering || '未知指法'}`
onMounted(async () => {
  if (route.query.error === 'no_admin_permission') { message.warning('您没有访问管理后台的权限'); router.replace('/library') }
  try { options.value = (await api('get', '/score-classification-options')).data }
  catch (e) { message.error(errorMessage(e)) }
  load()
})
onBeforeUnmount(() => { version++; clearTimeout(searchTimer) })
</script>

<template>
  <main class="score-library">
    <header class="library-heading">
      <div><div class="eyebrow">SOUNDROOM · 竹笛曲谱</div><h1>找到适合这支笛的曲子</h1><p class="muted">从笛调开始，按指法整理每一套演奏安排。</p></div>
      <n-button v-if="user.isLoggedIn" type="primary" size="large" @click="openCreate">＋ 快速登记</n-button>
      <n-button v-else size="large" @click="router.push('/login')">登录，整理我的曲谱</n-button>
    </header>
    <div class="library-toolbar">
      <n-radio-group :value="scope" @update:value="selectScope" aria-label="曲谱范围">
        <n-radio-button value="public">公开曲谱</n-radio-button><n-radio-button v-if="user.isLoggedIn" value="mine">我的曲谱</n-radio-button>
      </n-radio-group>
      <n-input v-model:value="search" class="library-search" clearable placeholder="搜索曲名或标签" aria-label="搜索曲名或标签"><template #prefix>⌕</template></n-input>
    </div>
    <section class="library-stats" aria-label="曲谱概览">
      <button :class="{ active: classification === 'all' }" @click="showStatus('all')"><span>全部曲目</span><strong>{{ categories.total_visible_scores ?? '—' }}</strong></button>
      <div><span>已有分类</span><strong>{{ categories.classified_score_count ?? '—' }}</strong></div>
      <button v-if="scope === 'mine'" :class="{ active: classification === 'pending' }" @click="showStatus('pending')"><span>待归类</span><strong>{{ categories.pending_score_count ?? '—' }}</strong></button>
      <button v-if="scope === 'mine'" :class="{ active: classification === 'needs_review' }" @click="showStatus('needs_review')"><span>待复核</span><strong>{{ categories.review_score_count ?? '—' }}</strong></button>
    </section>
    <div class="library-body">
      <aside class="classification-nav">
        <div class="step-heading"><span>01</span><h2>选择笛调</h2></div>
        <button class="category-button" :class="{ selected: !flute }" @click="selectFlute(null)"><span>全部笛调</span><span>{{ categories.total_visible_scores ?? 0 }}</span></button>
        <div class="flute-grid">
          <button v-for="group in categories.groups" :key="group.flute_key" class="category-button" :class="{ selected: flute === group.flute_key }" @click="selectFlute(group.flute_key)"><span>{{ group.label }}</span><span>{{ group.score_count }}</span></button>
        </div>
        <p class="nav-note">同一首曲目可以出现在多个分类中，各组数量不相加。</p>
      </aside>
      <section class="library-results">
        <div class="fingering-filter">
          <div class="step-heading"><span>02</span><h2>选择指法</h2><span v-if="currentFluteLabel" class="muted">{{ currentFluteLabel }}</span></div>
          <div v-if="flute" class="filter-chips">
            <n-button size="small" :type="!fingering ? 'primary' : 'default'" @click="fingering = null; whole = false">全部指法</n-button>
            <n-button v-for="item in selectedGroup?.fingerings || []" :key="item.code" size="small" :type="fingering === item.code ? 'primary' : 'default'" @click="fingering = item.code">{{ item.label }} · {{ item.score_count }}</n-button>
          </div>
          <p v-else class="muted">先选择笛调，再按指法筛选。下方展示全部曲目。</p>
        </div>
        <div class="results-toolbar">
          <div><strong>{{ currentFluteLabel || '全部曲谱' }}{{ currentFingeringLabel ? ` / ${currentFingeringLabel}` : '' }}</strong><span class="muted"> · {{ total }} 首</span></div>
          <div class="result-filters"><n-select v-if="scope === 'mine'" v-model:value="classification" :options="filterOptions" aria-label="分类状态" style="width: 140px" />
            <n-checkbox v-model:checked="whole" :disabled="!flute || !fingering">此组合覆盖全曲</n-checkbox>
          </div>
        </div>
        <n-alert v-if="error" type="error" title="加载失败"><p>{{ error }}</p><n-button @click="load">重新加载</n-button><n-button v-if="scope === 'mine'" text @click="router.push('/login')">重新登录</n-button></n-alert>
        <div v-else-if="loading" class="score-grid" aria-label="正在加载"><n-skeleton v-for="n in 6" :key="n" height="220px" :sharp="false" /></div>
        <div v-else-if="scores.length" class="score-grid">
          <article v-for="score in scores" :key="score.id" class="score-card">
            <div class="score-card-top"><div class="score-symbol">♫</div><n-tag size="small" :bordered="false">{{ score.visibility === 'public' ? '公开' : '私有' }}</n-tag></div>
            <h3><router-link :to="`/scores/${score.id}`">{{ score.title }}</router-link></h3>
            <p class="score-original">原调 {{ score.original_key }}</p>
            <p v-if="score.notes" class="score-notes">{{ score.notes }}</p>
            <n-tag v-if="score.classification_incomplete" size="small" type="warning" :bordered="false">部分安排待归类或复核</n-tag>
            <div v-for="match in score.matched_arrangements || []" :key="match.arrangement_id" class="match-summary">
              <strong>{{ matchArrangement(score.id, match)?.label || match.label || `方案 ${match.arrangement_id}` }} · {{ match.whole_match ? '此组合覆盖全曲' : '局部段落使用' }}</strong>
              <p v-if="match.section_ids?.length" class="muted">{{ matchedSections(score.id, match) || `命中 ${match.section_ids.length} 个演奏段` }}</p>
              <p v-if="match.requires_flute_switch">演奏时需换笛</p><p v-if="match.requires_fingering_switch">演奏时需换指法</p>
              <p v-if="!match.classification_complete">尚有未确认段，不能确定完整用笛安排</p>
              <p v-for="(combo, i) in match.required_combinations || []" :key="i" class="muted">{{ combinationLabel(combo) }}</p>
            </div>
            <div class="card-capabilities"><p v-for="arrangement in details[score.id]?.arrangements || []" :key="arrangement.id" class="muted">{{ arrangement.label }} · {{ practiceLabel(arrangement.practice_capability) }}</p><p v-if="!details[score.id]" class="muted">{{ detailsLoading ? '正在读取演奏方案…' : '方案状态未能加载，请进入详情重试' }}</p></div>
            <div class="score-card-footer"><span class="muted">查看完整演奏安排</span><n-button text type="primary" @click="router.push(`/scores/${score.id}`)">查看曲目 →</n-button></div>
          </article>
        </div>
        <div v-else class="library-empty"><div class="empty-symbol">♫</div><h3>{{ query || flute || classification !== 'all' ? '没有符合条件的曲目' : '曲谱库等待第一首曲子' }}</h3><p class="muted">{{ query || flute || classification !== 'all' ? '试试其他笛调、指法，或清除筛选。' : '只需曲名、原调和指法，谱图和音频以后再补。' }}</p><n-button @click="reset">清除筛选</n-button><n-button v-if="user.isLoggedIn" secondary type="primary" @click="openCreate">登记曲目</n-button></div>
        <n-pagination v-if="total > 12" v-model:page="page" :item-count="total" :page-size="12" :page-slot="5" class="library-pagination" />
      </section>
    </div>
    <n-modal v-model:show="showCreate" :mask-closable="!saving" :close-on-esc="!saving">
      <n-card class="score-modal" title="快速登记曲目" :bordered="false" role="dialog" aria-modal="true" aria-label="快速登记曲目">
        <p class="muted">先记下来。默认仅自己可见，不需要上传文件。</p>
        <n-form :disabled="saving" @submit.prevent="create">
          <div class="form-grid"><n-form-item label="曲名" required><n-input v-model:value="form.title" placeholder="例如：大鱼" :maxlength="100" /></n-form-item><n-form-item label="曲目原调" required><n-input v-model:value="form.original_key" placeholder="例如 D、1=D 或 6=A" :maxlength="200" /></n-form-item></div>
          <ClassificationFields v-model="form.section" :original-key="form.original_key" :options="options" />
          <n-form-item label="备注（选填）"><n-input v-model:value="form.notes" type="textarea" placeholder="例如：有低音3，演奏时注意气息" /></n-form-item>
          <n-alert v-if="createError" type="error" class="form-error">{{ createError }}</n-alert>
          <div class="modal-actions"><n-button :disabled="saving" @click="showCreate = false">取消</n-button><n-button type="primary" :loading="saving" attr-type="submit">{{ form.section?.classification_decision ? '确认并登记' : '先保存，稍后归类' }}</n-button></div>
        </n-form>
      </n-card>
    </n-modal>
  </main>
</template>
