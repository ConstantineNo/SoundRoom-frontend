<template>
  <n-config-provider :theme="null">
    <n-layout style="height: 100vh">
      <n-layout-header bordered style="padding: 12px; display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 1.2rem; font-weight: bold;">竹笛智能练习平台</div>
        <n-space>
          <router-link to="/library"><n-button text>曲谱库</n-button></router-link>
          <router-link to="/playlist"><n-button text>播放列表</n-button></router-link>
          <router-link to="/login"><n-button text>登录</n-button></router-link>
          <router-link to="/register"><n-button text>注册</n-button></router-link>
        </n-space>
      </n-layout-header>
      <n-layout-content content-style="padding: 24px;">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-config-provider>
</template>

<script setup>
import { NConfigProvider, NLayout, NLayoutHeader, NLayoutContent, NSpace, NButton } from 'naive-ui'
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
