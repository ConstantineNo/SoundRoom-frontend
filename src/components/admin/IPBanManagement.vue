<template>
  <div class="ip-ban-management">
    <n-space vertical size="large">
      <n-h2>IP封禁管理</n-h2>
      
      <n-card title="手动封禁IP">
        <n-form :model="banForm" :rules="banRules" ref="banFormRef">
          <n-form-item label="IP地址" path="ipAddress">
            <n-input
              v-model:value="banForm.ipAddress"
              placeholder="请输入IP地址，如：192.168.1.1"
            />
          </n-form-item>
          <n-form-item label="封禁原因" path="reason">
            <n-input
              v-model:value="banForm.reason"
              type="textarea"
              placeholder="请输入封禁原因"
              :rows="3"
            />
          </n-form-item>
          <n-form-item label="封禁时长（分钟）">
            <n-input-number
              v-model:value="banForm.durationMinutes"
              :min="1"
              placeholder="留空则为永久封禁"
              style="width: 100%;"
            />
            <template #feedback>
              <span style="color: #999; font-size: 12px;">留空则为永久封禁</span>
            </template>
          </n-form-item>
          <n-form-item>
            <n-button type="error" @click="handleBan" :loading="banning">封禁</n-button>
          </n-form-item>
        </n-form>
      </n-card>

      <n-card title="封禁IP列表">
        <n-data-table
          :columns="columns"
          :data="bannedIPs"
          :loading="loading"
          :bordered="false"
        />

        <n-card v-if="error" title="错误" style="margin-top: 16px;">
          <n-alert type="error" :title="error" />
          <n-button style="margin-top: 12px;" @click="fetchData">重试</n-button>
        </n-card>
      </n-card>
    </n-space>
  </div>
</template>

<script setup>
import { ref, onMounted, h } from 'vue'
import {
  NH2,
  NSpace,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NButton,
  NDataTable,
  NTag,
  NPopconfirm,
  NAlert,
  useMessage
} from 'naive-ui'
import { getBannedIPs, banIP, unbanIP } from '../../utils/adminApi'
import { formatToCST } from '../../utils/dateFormat'

const message = useMessage()
const loading = ref(false)
const banning = ref(false)
const error = ref(null)
const bannedIPs = ref([])
const banFormRef = ref(null)

const banForm = ref({
  ipAddress: '',
  reason: '',
  durationMinutes: null
})

const banRules = {
  ipAddress: [
    { required: true, message: '请输入IP地址', trigger: 'blur' },
    {
      pattern: /^(\d{1,3}\.){3}\d{1,3}$/,
      message: '请输入有效的IP地址',
      trigger: 'blur'
    }
  ],
  reason: [
    { required: true, message: '请输入封禁原因', trigger: 'blur' }
  ]
}

const columns = [
  {
    title: 'ID',
    key: 'id',
    width: 80
  },
  {
    title: 'IP地址',
    key: 'ip_address',
    width: 150
  },
  {
    title: '封禁原因',
    key: 'reason',
    width: 200,
    ellipsis: {
      tooltip: true
    }
  },
  {
    title: '封禁时间',
    key: 'banned_at',
    width: 180,
    render: (row) => {
      return formatToCST(row.banned_at)
    }
  },
  {
    title: '过期时间',
    key: 'expires_at',
    width: 180,
    render: (row) => {
      if (!row.expires_at) return h(NTag, { type: 'error' }, { default: () => '永久封禁' })
      return formatToCST(row.expires_at)
    }
  },
  {
    title: '状态',
    key: 'is_active',
    width: 100,
    render: (row) => {
      return h(
        NTag,
        { type: row.is_active ? 'error' : 'default' },
        { default: () => row.is_active ? '已封禁' : '已解封' }
      )
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 120,
    render: (row) => {
      if (!row.is_active) return '-'
      return h(
        NPopconfirm,
        {
          onPositiveClick: () => handleUnban(row.ip_address)
        },
        {
          trigger: () => h(NButton, { size: 'small', type: 'warning' }, { default: () => '解封' }),
          default: () => '确定要解封此IP吗？'
        }
      )
    }
  }
]

const fetchData = async () => {
  loading.value = true
  error.value = null
  try {
    const data = await getBannedIPs()
    bannedIPs.value = Array.isArray(data) ? data : []
  } catch (err) {
    error.value = err.message || '获取数据失败'
    message.error(error.value)
  } finally {
    loading.value = false
  }
}

const handleBan = async () => {
  if (!banFormRef.value) return
  
  try {
    await banFormRef.value.validate()
    banning.value = true
    
    try {
      await banIP(
        banForm.value.ipAddress,
        banForm.value.reason,
        banForm.value.durationMinutes || null
      )
      message.success('IP封禁成功')
      banForm.value = {
        ipAddress: '',
        reason: '',
        durationMinutes: null
      }
      banFormRef.value.restoreValidation()
      fetchData()
    } catch (err) {
      message.error(err.message || '封禁失败')
    } finally {
      banning.value = false
    }
  } catch (err) {
    // 表单验证失败
  }
}

const handleUnban = async (ipAddress) => {
  try {
    await unbanIP(ipAddress)
    message.success('IP解封成功')
    fetchData()
  } catch (err) {
    message.error(err.message || '解封失败')
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.ip-ban-management {
  max-width: 1400px;
}
</style>

