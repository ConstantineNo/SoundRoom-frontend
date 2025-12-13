<template>
  <div class="admin-dashboard">
    <n-layout has-sider style="height: 100%;">
      <n-layout-sider
        bordered
        collapse-mode="width"
        :collapsed="collapsed"
        :collapsed-width="64"
        :width="240"
        show-trigger
        @collapse="collapsed = true"
        @expand="collapsed = false"
      >
        <n-menu
          v-model:value="activeKey"
          :collapsed="collapsed"
          :collapsed-width="64"
          :collapsed-icon-size="22"
          :options="menuOptions"
          @update:value="handleMenuSelect"
        />
      </n-layout-sider>
      <n-layout>
        <n-layout-header bordered style="padding: 12px 24px;">
          <div style="font-size: 1.2rem; font-weight: bold;">管理后台</div>
        </n-layout-header>
        <n-layout-content content-style="padding: 24px;">
          <component :is="currentComponent" />
        </n-layout-content>
      </n-layout>
    </n-layout>
  </div>
</template>

<script setup>
import { ref, h } from 'vue'
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu
} from 'naive-ui'
import DashboardSummary from '../components/admin/DashboardSummary.vue'
import VisitorLogs from '../components/admin/VisitorLogs.vue'
import TrafficTrends from '../components/admin/TrafficTrends.vue'
import IPBanManagement from '../components/admin/IPBanManagement.vue'

const collapsed = ref(false)
const activeKey = ref('summary')

const menuOptions = [
  {
    label: '仪表盘概览',
    key: 'summary',
    icon: () => h('span', '📊')
  },
  {
    label: '访客日志',
    key: 'logs',
    icon: () => h('span', '📝')
  },
  {
    label: '流量统计',
    key: 'traffic',
    icon: () => h('span', '📈')
  },
  {
    label: 'IP封禁管理',
    key: 'bans',
    icon: () => h('span', '🔒')
  }
]

const componentMap = {
  summary: DashboardSummary,
  logs: VisitorLogs,
  traffic: TrafficTrends,
  bans: IPBanManagement
}

const currentComponent = ref(componentMap[activeKey.value])

const handleMenuSelect = (key) => {
  activeKey.value = key
  currentComponent.value = componentMap[key]
}
</script>

<style scoped>
.admin-dashboard {
  height: calc(100vh - 64px);
}
</style>

