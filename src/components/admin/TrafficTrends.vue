<template>
  <div class="traffic-trends">
    <n-space vertical size="large">
      <n-h2>流量统计</n-h2>
      
      <n-card title="日期范围选择">
        <n-space>
          <n-date-picker
            v-model:value="startDate"
            type="date"
            placeholder="开始日期"
            clearable
          />
          <n-date-picker
            v-model:value="endDate"
            type="date"
            placeholder="结束日期"
            clearable
          />
          <n-input-number
            v-model:value="limit"
            :min="7"
            :max="365"
            placeholder="最近天数"
            style="width: 150px;"
          />
          <n-button type="primary" @click="fetchData" :loading="loading">查询</n-button>
        </n-space>
      </n-card>

      <n-card v-if="loading" title="加载中...">
        <n-spin size="large" />
      </n-card>

      <n-card v-if="error" title="错误">
        <n-alert type="error" :title="error" />
        <n-button style="margin-top: 12px;" @click="fetchData">重试</n-button>
      </n-card>

      <n-card v-if="!loading && !error && stats.length > 0" title="PV/UV趋势">
        <div ref="chartContainer" style="height: 400px;"></div>
      </n-card>

      <n-card v-if="!loading && !error && stats.length > 0" title="热门URL">
        <n-list>
          <n-list-item v-for="(stat, index) in stats" :key="stat.id">
            <template #prefix>
              <n-tag>{{ index + 1 }}</n-tag>
            </template>
            <n-space vertical size="small">
              <div><strong>日期：</strong>{{ stat.date }}</div>
              <div v-if="stat.top_urls && Object.keys(stat.top_urls).length > 0">
                <strong>热门URL：</strong>
                <n-space style="margin-top: 8px;">
                  <n-tag
                    v-for="(count, url) in stat.top_urls"
                    :key="url"
                    type="info"
                  >
                    {{ url }}: {{ count }}
                  </n-tag>
                </n-space>
              </div>
            </n-space>
          </n-list-item>
        </n-list>
      </n-card>
    </n-space>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, onUnmounted } from 'vue'
import { NH2, NSpace, NCard, NSpin, NAlert, NButton, NDatePicker, NInputNumber, NList, NListItem, NTag, useMessage } from 'naive-ui'
import { getDailyStats } from '../../utils/adminApi'

const message = useMessage()
const loading = ref(false)
const error = ref(null)
const stats = ref([])
const startDate = ref(null)
const endDate = ref(null)
const limit = ref(30)
const chartContainer = ref(null)
let chartInstance = null

// 简单的图表绘制函数（使用Canvas）
const drawChart = () => {
  if (!chartContainer.value || stats.value.length === 0) return

  const canvas = document.createElement('canvas')
  canvas.width = chartContainer.value.offsetWidth
  canvas.height = 400
  chartContainer.value.innerHTML = ''
  chartContainer.value.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  const padding = 60
  const chartWidth = canvas.width - padding * 2
  const chartHeight = canvas.height - padding * 2

  // 清空画布
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 找出最大值
  const maxPV = Math.max(...stats.value.map(s => s.pv || 0))
  const maxUV = Math.max(...stats.value.map(s => s.uv || 0))
  const maxValue = Math.max(maxPV, maxUV)

  // 绘制坐标轴
  ctx.strokeStyle = '#ddd'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padding, padding)
  ctx.lineTo(padding, canvas.height - padding)
  ctx.lineTo(canvas.width - padding, canvas.height - padding)
  ctx.stroke()

  // 绘制网格线
  ctx.strokeStyle = '#f0f0f0'
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight / 5) * i
    ctx.beginPath()
    ctx.moveTo(padding, y)
    ctx.lineTo(canvas.width - padding, y)
    ctx.stroke()
  }

  // 计算 x 坐标的辅助函数，处理单个数据点的情况
  const getXCoordinate = (index) => {
    if (stats.value.length === 1) {
      // 只有一个数据点时，放在图表中间
      return padding + chartWidth / 2
    }
    // 多个数据点时，均匀分布
    return padding + (chartWidth / (stats.value.length - 1)) * index
  }

  // 绘制PV折线
  if (stats.value.length > 0) {
    ctx.strokeStyle = '#18a058'
    ctx.lineWidth = 2
    ctx.beginPath()
    stats.value.forEach((stat, index) => {
      const x = getXCoordinate(index)
      const y = canvas.height - padding - ((stat.pv || 0) / maxValue) * chartHeight
      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.stroke()

    // 绘制PV点
    ctx.fillStyle = '#18a058'
    stats.value.forEach((stat, index) => {
      const x = getXCoordinate(index)
      const y = canvas.height - padding - ((stat.pv || 0) / maxValue) * chartHeight
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  // 绘制UV折线
  if (stats.value.length > 0) {
    ctx.strokeStyle = '#2080f0'
    ctx.lineWidth = 2
    ctx.beginPath()
    stats.value.forEach((stat, index) => {
      const x = getXCoordinate(index)
      const y = canvas.height - padding - ((stat.uv || 0) / maxValue) * chartHeight
      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.stroke()

    // 绘制UV点
    ctx.fillStyle = '#2080f0'
    stats.value.forEach((stat, index) => {
      const x = getXCoordinate(index)
      const y = canvas.height - padding - ((stat.uv || 0) / maxValue) * chartHeight
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  // 绘制标签
  ctx.fillStyle = '#333'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  stats.value.forEach((stat, index) => {
    const x = getXCoordinate(index)
    const date = new Date(stat.date)
    const label = `${date.getMonth() + 1}/${date.getDate()}`
    ctx.fillText(label, x, canvas.height - padding + 20)
  })

  // 绘制图例
  ctx.fillStyle = '#18a058'
  ctx.fillRect(canvas.width - 150, 20, 20, 10)
  ctx.fillStyle = '#333'
  ctx.textAlign = 'left'
  ctx.fillText('PV', canvas.width - 125, 30)

  ctx.fillStyle = '#2080f0'
  ctx.fillRect(canvas.width - 150, 40, 20, 10)
  ctx.fillStyle = '#333'
  ctx.fillText('UV', canvas.width - 125, 50)

  chartInstance = canvas
}

const fetchData = async () => {
  loading.value = true
  error.value = null
  try {
    const start = startDate.value ? new Date(startDate.value).toISOString().split('T')[0] : null
    const end = endDate.value ? new Date(endDate.value).toISOString().split('T')[0] : null
    const data = await getDailyStats(start, end, limit.value)
    stats.value = Array.isArray(data) ? data : []
    
    // 按日期排序
    stats.value.sort((a, b) => {
      return new Date(a.date) - new Date(b.date)
    })
    
    await nextTick()
    drawChart()
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

onUnmounted(() => {
  if (chartInstance && chartInstance.parentNode) {
    chartInstance.parentNode.removeChild(chartInstance)
  }
})
</script>

<style scoped>
.traffic-trends {
  max-width: 1400px;
}
</style>

