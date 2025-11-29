<template>
  <div style="max-width: 400px; margin: 0 auto; padding-top: 50px;">
    <n-card title="登录">
      <n-form>
        <n-form-item label="用户名">
          <n-input v-model:value="username" placeholder="请输入用户名" />
        </n-form-item>
        <n-form-item label="密码">
          <n-input v-model:value="password" type="password" placeholder="请输入密码" />
        </n-form-item>
        <n-button type="primary" block @click="handleLogin" :loading="loading">
          登录
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useUserStore } from '../stores/user'
import { useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, useMessage } from 'naive-ui'

const username = ref('')
const password = ref('')
const loading = ref(false)
const userStore = useUserStore()
const router = useRouter()
const message = useMessage()

const handleLogin = async () => {
  if (!username.value || !password.value) {
    message.warning('请输入用户名和密码')
    return
  }
  
  loading.value = true
  try {
    await userStore.login(username.value, password.value)
    message.success('登录成功')
    router.push('/library')
  } catch (error) {
    message.error('登录失败，请检查用户名或密码')
  } finally {
    loading.value = false
  }
}
</script>
