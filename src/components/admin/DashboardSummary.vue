<template>
  <div class="dashboard-summary">
    <n-space vertical size="large">
      <n-h2>仪表盘概览</n-h2>
      
      <n-grid :cols="4" :x-gap="16" :y-gap="16" responsive="screen">
        <n-grid-item>
          <n-statistic label="今日PV" :value="summaryData.today_pv || 0">
            <template #suffix>
              <span style="font-size: 14px; color: #999;">次</span>
            </template>
          </n-statistic>
        </n-grid-item>
        <n-grid-item>
          <n-statistic label="今日UV" :value="summaryData.today_uv || 0">
            <template #suffix>
              <span style="font-size: 14px; color: #999;">人</span>
            </template>
          </n-statistic>
        </n-grid-item>
        <n-grid-item>
          <n-statistic label="总用户数" :value="summaryData.total_users || 0">
            <template #suffix>
              <span style="font-size: 14px; color: #999;">人</span>
            </template>
          </n-statistic>
        </n-grid-item>
        <n-grid-item>
          <n-statistic label="活跃封禁" :value="summaryData.active_bans || 0">
            <template #suffix>
              <span style="font-size: 14px; color: #999;">个</span>
            </template>
          </n-statistic>
        </n-grid-item>
      </n-grid>

      <n-card v-if="loading" title="加载中...">
        <n-spin size="large" />
      </n-card>

      <n-card v-if="error" title="错误">
        <n-alert type="error" :title="error" />
        <n-button style="margin-top: 12px;" @click="fetchData">重试</n-button>
      </n-card>
    </n-space>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { NH2, NSpace, NGrid, NGridItem, NStatistic, NCard, NSpin, NAlert, NButton, useMessage } from 'naive-ui'
import { getDashboardSummary } from '../../utils/adminApi'

const message = useMessage()
const loading = ref(false)
const error = ref(null)
const summaryData = ref({
  today_pv: 0,
  today_uv: 0,
  total_users: 0,
  active_bans: 0
})

const fetchData = async () => {
  loading.value = true
  error.value = null
  try {
    const data = await getDashboardSummary()
    summaryData.value = data
  } catch (err) {
    error.value = err.message || '获取数据失败'
    message.error(error.value)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.dashboard-summary {
  max-width: 1200px;
}
</style>

