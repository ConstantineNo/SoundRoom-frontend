<template>
  <n-config-provider :theme="null">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-layout style="height: 100vh; display: flex; flex-direction: column;">
            <n-layout-header v-if="!isWorkbenchPage" bordered style="padding: 12px; display: flex; justify-content: space-between; align-items: center;">
              <div style="font-size: 1.2rem; font-weight: bold;">乐器学习一步到位</div>
              <n-space align="center">
                <router-link to="/library"><n-button text>曲谱库</n-button></router-link>
                <router-link v-if="userStore.isLoggedIn" to="/playlist"><n-button text>播放列表</n-button></router-link>
                <router-link v-if="userStore.isAdmin" to="/dashboard"><n-button text>管理后台</n-button></router-link>
                <div v-if="userStore.isLoggedIn">
                  <span style="margin-right: 10px;">{{ userStore.username }}</span>
                  <n-button text @click="handleLogout">退出</n-button>
                </div>
                <div v-else>
                  <router-link to="/login"><n-button text>登录</n-button></router-link>
                </div>
              </n-space>
            </n-layout-header>
            <n-layout-content :content-style="{ padding: isFullWidthPage ? '0' : '24px', flex: 1 }">
              <router-view />
            </n-layout-content>
            <n-layout-footer v-if="!isWorkbenchPage" bordered style="padding: 10px; text-align: center;">
              <div>&copy; 2025 乐器学习一步到位</div>
              <div style="margin-top: 5px;">
                <a href="https://beian.miit.gov.cn/" target="_blank" style="text-decoration: none; color: inherit;">
                  ICP备案号：粤ICP备2025505237号-1
                </a>
              </div>
              <div style="margin-top: 5px;">
                <a href="https://beian.mps.gov.cn/#/query/webSearch?code=44195202000246" rel="noreferrer" target="_blank" style="text-decoration: none; color: inherit; display: inline-flex; align-items: center; gap: 4px;">
                  <img src="/备案图标.png" alt="备案图标" style="height: 14px; vertical-align: middle;" />
                  粤公网安备44195202000246号
                </a>
              </div>
            </n-layout-footer>
          </n-layout>
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { computed } from 'vue'
import { 
  NConfigProvider, 
  NMessageProvider, 
  NDialogProvider, 
  NNotificationProvider,
  NLayout, 
  NLayoutHeader, 
  NLayoutContent, 
  NLayoutFooter,
  NSpace, 
  NButton 
} from 'naive-ui'
import { useUserStore } from './stores/user'
import { useRouter, useRoute } from 'vue-router'

const userStore = useUserStore()
const router = useRouter()
const route = useRoute()

const isFullWidthPage = computed(() => {
  return route.path.startsWith('/editor') || route.path.startsWith('/practice')
})

const isWorkbenchPage = computed(() => {
  return route.path.startsWith('/practice')
})

const handleLogout = () => {
  userStore.logout()
  router.push('/login')
}
</script>

<style>
body {
  margin: 0;
  font-family: v-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
}
a {
  text-decoration: none;
  color: inherit;
}
</style>
