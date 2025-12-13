<template>
  <div class="visitor-logs">
    <n-space vertical size="large">
      <n-h2>访客日志</n-h2>
      
      <n-data-table
        :columns="columns"
        :data="logs"
        :loading="loading"
        :pagination="pagination"
        :bordered="false"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />

      <n-card v-if="error" title="错误">
        <n-alert type="error" :title="error" />
        <n-button style="margin-top: 12px;" @click="fetchData">重试</n-button>
      </n-card>
    </n-space>
  </div>
</template>

<script setup>
import { ref, onMounted, h } from 'vue'
import { NH2, NSpace, NDataTable, NCard, NAlert, NButton, NTag, useMessage } from 'naive-ui'
import { getVisitorLogs } from '../../utils/adminApi'

const message = useMessage()
const loading = ref(false)
const error = ref(null)
const logs = ref([])
const pagination = ref({
  page: 1,
  pageSize: 20,
  pageCount: 1,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  showQuickJumper: true
})

const columns = [
  {
    title: 'ID',
    key: 'id',
    width: 80
  },
  {
    title: 'IP地址',
    key: 'ip_address',
    width: 140
  },
  {
    title: '地理位置',
    key: 'location',
    width: 180,
    render: (row) => {
      const location = [row.country, row.city].filter(Boolean).join(' / ')
      return location || '-'
    }
  },
  {
    title: '设备类型',
    key: 'device_type',
    width: 100,
    render: (row) => {
      const typeMap = {
        'pc': 'PC',
        'mobile': '移动端',
        'tablet': '平板'
      }
      return typeMap[row.device_type] || row.device_type || '-'
    }
  },
  {
    title: '操作系统',
    key: 'os',
    width: 120
  },
  {
    title: '浏览器',
    key: 'browser',
    width: 120
  },
  {
    title: '请求路径',
    key: 'request_path',
    width: 200,
    ellipsis: {
      tooltip: true
    }
  },
  {
    title: '请求方法',
    key: 'request_method',
    width: 100,
    render: (row) => {
      const method = row.request_method || '-'
      const colorMap = {
        'GET': 'default',
        'POST': 'info',
        'PUT': 'warning',
        'DELETE': 'error',
        'PATCH': 'success'
      }
      return h(NTag, { type: colorMap[method] || 'default', size: 'small' }, { default: () => method })
    }
  },
  {
    title: '状态码',
    key: 'status_code',
    width: 100,
    render: (row) => {
      const code = row.status_code
      const colorMap = {
        '2xx': 'success',
        '3xx': 'info',
        '4xx': 'warning',
        '5xx': 'error'
      }
      const type = code >= 200 && code < 300 ? 'success' :
                   code >= 300 && code < 400 ? 'info' :
                   code >= 400 && code < 500 ? 'warning' : 'error'
      return h(NTag, { type, size: 'small' }, { default: () => code })
    }
  },
  {
    title: '访问时间',
    key: 'created_at',
    width: 180,
    render: (row) => {
      if (!row.created_at) return '-'
      const date = new Date(row.created_at)
      return date.toLocaleString('zh-CN')
    }
  }
]

const fetchData = async () => {
  loading.value = true
  error.value = null
  try {
    const data = await getVisitorLogs(pagination.value.page, pagination.value.pageSize)
    logs.value = Array.isArray(data) ? data : []
    // 注意：API返回的是数组，不是分页对象，这里假设后端返回所有数据
    // 如果需要真正的分页，需要后端返回分页信息
  } catch (err) {
    error.value = err.message || '获取数据失败'
    message.error(error.value)
  } finally {
    loading.value = false
  }
}

const handlePageChange = (page) => {
  pagination.value.page = page
  fetchData()
}

const handlePageSizeChange = (pageSize) => {
  pagination.value.pageSize = pageSize
  pagination.value.page = 1
  fetchData()
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.visitor-logs {
  max-width: 1400px;
}
</style>

