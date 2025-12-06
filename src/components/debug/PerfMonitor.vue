<template>
  <div class="perf-monitor" :class="{ collapsed: !enabled }">
    <div class="perf-header">
      <div class="title">Perf Debug</div>
      <div class="actions">
        <button class="chip" @click="$emit('toggle', !enabled)">
          {{ enabled ? '关闭' : '开启' }}
        </button>
        <button class="chip" @click="exportSamples" :disabled="!hasSamples">
          导出
        </button>
        <button class="chip" @click="showDetail = !showDetail" :disabled="!hasSamples">
          {{ showDetail ? '收起' : '展开' }}
        </button>
      </div>
    </div>

    <div class="summary">
      <div class="metric">
        <div class="label">FPS(avg)</div>
        <div class="value">{{ fpsAvg.toFixed(1) }}</div>
      </div>
      <div class="metric">
        <div class="label">帧耗(P50/P95)</div>
        <div class="value">
          {{ pct(frameMs, 50).toFixed(1) }} / {{ pct(frameMs, 95).toFixed(1) }} ms
        </div>
      </div>
      <div class="metric">
        <div class="label">YIN均值</div>
        <div class="value">{{ avg(pitchMs).toFixed(2) }} ms</div>
      </div>
      <div class="metric">
        <div class="label">FFT均值</div>
        <div class="value">{{ avg(fftMs).toFixed(2) }} ms</div>
      </div>
      <div class="metric">
        <div class="label">RAF P95</div>
        <div class="value">{{ pct(rafLag, 95).toFixed(1) }} ms</div>
      </div>
      <div class="metric">
        <div class="label">Pitch置信</div>
        <div class="value">{{ avgPitchProb.toFixed(2) }}</div>
      </div>
    </div>

    <div v-if="showDetail" class="details">
      <div class="chart">
        <div class="chart-title">帧耗堆叠（最近 {{ samples.length }} 帧）</div>
        <div class="bars">
          <div
            v-for="(s, idx) in samples"
            :key="idx"
            class="bar"
            :style="barStyle(s)"
            :title="barTitle(s)"
          />
        </div>
      </div>
      <div class="chart">
        <div class="chart-title">RAF 延迟 / Pitch 置信度</div>
        <div class="lines">
          <div
            v-for="(s, idx) in samples"
            :key="idx"
            class="line-point lag"
            :style="lagStyle(s, idx)"
          />
          <div
            v-for="(s, idx) in samples"
            :key="'p' + idx"
            class="line-point prob"
            :style="probStyle(s, idx)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  samples: { type: Array, default: () => [] },
  enabled: { type: Boolean, default: false }
})

defineEmits(['toggle', 'export'])

const showDetail = ref(false)

const hasSamples = computed(() => props.samples.length > 0)

const frameMs = computed(() => props.samples.map((s) => s.totalMs || 0))
const fftMs = computed(() => props.samples.map((s) => s.fftMs || 0))
const pitchMs = computed(() => props.samples.map((s) => s.pitchMs || 0))
const rafLag = computed(() => props.samples.map((s) => s.rafLagMs || 0))
const fpsAvg = computed(() => {
  if (props.samples.length < 2) return 0
  const dts = []
  for (let i = 1; i < props.samples.length; i++) {
    const dt = props.samples[i].ts - props.samples[i - 1].ts
    if (dt > 0) dts.push(dt)
  }
  const avgDt = avg(dts)
  return avgDt > 0 ? 1000 / avgDt : 0
})

const avgPitchProb = computed(() => {
  const probs = props.samples.map((s) => s.pitchProb).filter((v) => typeof v === 'number')
  if (!probs.length) return 0
  return avg(probs)
})

const avg = (arr) => {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

const pct = (arr, p) => {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[rank]
}

const barStyle = (s) => {
  const max = Math.max(...frameMs.value, 16.7)
  const ratio = Math.min(1, (s.totalMs || 0) / max)
  return {
    height: `${ratio * 100}%`,
    background: `linear-gradient(
      180deg,
      #22d3ee 0% ${pctPortion(s.drawMs, s.totalMs)}%,
      #4ade80 ${pctPortion(s.drawMs, s.totalMs)}% ${pctPortion(s.drawMs + s.pitchMs, s.totalMs)}%,
      #fbbf24 ${pctPortion(s.drawMs + s.pitchMs, s.totalMs)}% ${pctPortion(s.drawMs + s.pitchMs + s.fftMs, s.totalMs)}%,
      #ef4444 ${pctPortion(s.drawMs + s.pitchMs + s.fftMs, s.totalMs)}% 100%
    )`
  }
}

const pctPortion = (part, total) => {
  if (!total || total <= 0) return 0
  return Math.min(100, Math.max(0, (part / total) * 100))
}

const barTitle = (s) =>
  `total:${s.totalMs?.toFixed(2)}ms draw:${s.drawMs?.toFixed(2)}ms pitch:${s.pitchMs?.toFixed(
    2
  )}ms fft:${s.fftMs?.toFixed(2)}ms rafLag:${s.rafLagMs?.toFixed(2)}ms prob:${s.pitchProb ?? '-'}`

const lagStyle = (s, idx) => {
  const maxLag = Math.max(...rafLag.value, 1)
  const y = Math.min(1, (s.rafLagMs || 0) / maxLag)
  return {
    left: `${(idx / Math.max(props.samples.length - 1, 1)) * 100}%`,
    bottom: `${y * 100}%`
  }
}

const probStyle = (s, idx) => {
  const prob = typeof s.pitchProb === 'number' ? s.pitchProb : 0
  return {
    left: `${(idx / Math.max(props.samples.length - 1, 1)) * 100}%`,
    bottom: `${prob * 100}%`
  }
}

const exportSamples = () => {
  if (!props.samples.length) return
  const blob = new Blob([JSON.stringify(props.samples, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `perf-samples-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.perf-monitor {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 30;
  width: 320px;
  background: rgba(0, 0, 0, 0.72);
  color: #e0e0e0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 10px;
  backdrop-filter: blur(8px);
  pointer-events: auto;
}

.perf-monitor.collapsed .details {
  display: none;
}

.perf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.title {
  font-weight: 700;
  letter-spacing: 0.5px;
}

.actions {
  display: flex;
  gap: 6px;
}

.chip {
  background: #1f2937;
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}

.chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.metric {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 6px;
}

.label {
  font-size: 11px;
  color: #9ca3af;
}

.value {
  font-weight: 700;
  margin-top: 2px;
}

.details {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chart {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 8px;
}

.chart-title {
  font-size: 12px;
  color: #cbd5e1;
  margin-bottom: 6px;
}

.bars {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(2px, 1fr));
  align-items: end;
  gap: 2px;
  height: 80px;
}

.bar {
  width: 100%;
  border-radius: 2px;
}

.lines {
  position: relative;
  height: 80px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(0, 0, 0, 0));
}

.line-point {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
}

.line-point.lag {
  background: #f59e0b;
}

.line-point.prob {
  background: #22d3ee;
}
</style>

