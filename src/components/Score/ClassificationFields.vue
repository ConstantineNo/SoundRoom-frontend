<script setup>
import { computed, ref, watch } from 'vue'
import { createScoreApi, errorMessage, statusLabel, noticeLabel } from '../../utils/scoreApi'
import { useUserStore } from '../../stores/user'

const props = defineProps({ modelValue: Object, originalKey: String, options: Object, advanced: Boolean })
const emit = defineEmits(['update:modelValue'])
const user = useUserStore()
const api = createScoreApi(() => user.token)
const candidate = ref(null)
const loading = ref(false)
const error = ref('')
const manualKey = ref(null)
const changed = ref(false)
let request = 0
const value = computed(() => props.modelValue)
const fingeringOptions = computed(() => [...(props.options?.fingerings || []).map(x => ({ label: x.label, value: x.code })), { label: '其他指法（保留原文）', value: 'raw' }])
const fluteOptions = computed(() => (props.options?.flute_keys || []).map(x => ({ label: x.label, value: x.code })))
const basisOptions = [{ label: '按曲目原调', value: 'original' }, { label: '按段落调性', value: 'local' }, { label: '按实际演奏调性', value: 'performance' }]
function update(patch) { emit('update:modelValue', { ...value.value, ...patch }) }
const basis = computed(() => JSON.stringify([props.originalKey, value.value.fingering, value.value.local_key, value.value.performance_key, value.value.key_basis, value.value.instrument_profile]))
watch(basis, () => {
  request++; candidate.value = null; error.value = ''; manualKey.value = null; loading.value = false; changed.value = true
  update({ classification_decision: undefined })
}, { flush: 'sync' })
async function infer() {
  const current = ++request
  loading.value = true; error.value = ''; candidate.value = null
  try {
    const result = await api('post', '/flute-key-candidates', { data: {
      original_key: props.originalKey, fingering: value.value.fingering,
      local_key: value.value.local_key || null, performance_key: value.value.performance_key || null,
      key_basis: value.value.key_basis || 'original', instrument_profile: value.value.instrument_profile || 'standard_six_hole_dizi'
    } })
    if (current === request) candidate.value = result.data
  } catch (e) { if (current === request) error.value = errorMessage(e) }
  finally { if (current === request) loading.value = false }
}
function adopt(item) {
  update({ classification_decision: { method: 'candidate', flute_key: item.flute_key, candidate_token: candidate.value.candidate_token } })
}
function manual() { if (manualKey.value) update({ classification_decision: { method: 'manual', flute_key: manualKey.value } }) }
const describe = noticeLabel
</script>

<template>
  <div class="classification-fields">
    <div class="form-grid">
      <n-form-item label="筒音指法" required>
        <n-select aria-label="筒音指法" :value="value.fingering.code || 'raw'" :options="fingeringOptions" @update:value="code => update({ fingering: code === 'raw' ? { raw: '' } : { code } })" />
      </n-form-item>
      <n-form-item v-if="!value.fingering.code" label="指法原文" required>
        <n-input aria-label="指法原文" :value="value.fingering.raw" placeholder="填写自己的指法标注" @update:value="raw => update({ fingering: { raw } })" />
      </n-form-item>
      <n-form-item v-if="advanced" label="分类依据">
        <n-select aria-label="分类依据" :value="value.key_basis" :options="basisOptions" @update:value="key_basis => update({ key_basis })" />
      </n-form-item>
      <n-form-item v-if="advanced" label="段落调性（选填）">
        <n-input :value="value.local_key" placeholder="例如 1=G，不改变曲目原调" @update:value="local_key => update({ local_key })" />
      </n-form-item>
      <n-form-item v-if="advanced" label="实际演奏调性（选填）">
        <n-input :value="value.performance_key" placeholder="例如 1=D 或 6=A" @update:value="performance_key => update({ performance_key })" />
      </n-form-item>
    </div>
    <div class="candidate-panel">
      <div class="row-between">
        <div><strong>确认这段使用的笛子</strong><p class="muted">可先登记，之后再确认。推算不代表整曲音域已验证。</p></div>
        <n-button :loading="loading" :disabled="!originalKey?.trim() || (!value.fingering.code && !value.fingering.raw?.trim())" @click="infer">推算候选</n-button>
      </div>
      <n-alert v-if="error" type="warning" :show-icon="false">{{ error }} 可以人工确认，或保留为待归类。</n-alert>
      <div v-if="candidate" class="candidate-result">
        <p v-for="(item, i) in [...(candidate.assumptions || []), ...(candidate.warnings || [])]" :key="i" class="muted">{{ describe(item) }}</p>
        <p v-if="!candidate.candidates?.length">{{ candidate.outcome === 'missing_input' ? '需要补充调性信息' : '当前规则不支持此组合' }}。可人工确认或稍后归类。</p>
        <p v-if="candidate.missing_fields?.length" class="muted">需补充：{{ candidate.missing_fields.map(describe).join('、') }}</p>
        <div v-for="item in candidate.candidates" :key="item.flute_key" class="candidate-choice">
          <div><strong>{{ item.label }}</strong><p class="muted">{{ item.reason }}</p></div>
          <n-button secondary type="primary" @click="adopt(item)">采用此候选</n-button>
        </div>
      </div>
      <div class="manual-choice">
        <n-select v-model:value="manualKey" aria-label="人工选择笛调" placeholder="已知用哪支笛？选择笛调" :options="fluteOptions" :disabled="!value.fingering.code" clearable />
        <n-button :disabled="!manualKey || !value.fingering.code" @click="manual">人工确认</n-button>
      </div>
      <p v-if="value.classification_decision" class="confirmed-line">已选择 {{ value.classification_decision.flute_key }} 调笛 · {{ value.classification_decision.method === 'candidate' ? '采用候选' : '人工确认' }}，保存后生效 <n-button text @click="update({ classification_decision: undefined })">取消选择</n-button></p>
      <p v-else-if="changed && value.id" class="muted">分类依据有修改，保存后将重新核验；受影响的旧确认需要复核。</p>
      <p v-else-if="value.id" class="muted">当前：{{ statusLabel(value.classification_status) }}{{ value.flute_key ? ` · ${value.flute_key} 调笛` : '' }}<span v-if="value.classification_evidence?.previous_flute_key">（原确认 {{ value.classification_evidence.previous_flute_key }} 调笛，仅供复核）</span></p>
      <p v-else class="muted">尚未确认笛调，将保存为「待归类」。</p>
    </div>
  </div>
</template>
