<template>
  <div>
    <h2>我的播放列表</h2>
    <div v-if="playlists.length === 0">
      <n-empty description="暂无播放列表" />
      <n-button @click="createDefaultPlaylist">创建默认列表</n-button>
    </div>
    <div v-else>
      <n-card v-for="playlist in playlists" :key="playlist.id" :title="playlist.name" style="margin-bottom: 20px;">
        <n-list>
          <n-list-item v-for="item in playlist.items" :key="item.id">
            <template #prefix>
              <n-icon size="20"><MusicalNote /></n-icon>
            </template>
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <span>{{ item.score ? item.score.title : '未知曲目' }}</span>
              <n-button size="small" type="primary" @click="goToPractice(item.score_id)">练习</n-button>
            </div>
          </n-list-item>
        </n-list>
      </n-card>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { NCard, NList, NListItem, NButton, NEmpty, NIcon, useMessage } from 'naive-ui'
import { MusicalNote } from '@vicons/ionicons5' // Need to install @vicons/ionicons5 or just use text
import { useUserStore } from '../stores/user'

const playlists = ref([])
const router = useRouter()
const message = useMessage()
const userStore = useUserStore()

const fetchPlaylists = async () => {
  try {
    const response = await axios.get('/api/playlists/', {
      headers: { 'Authorization': `Bearer ${userStore.token}` }
    })
    playlists.value = response.data
    // Note: The API returns playlists, but items might not be populated fully with Score details 
    // depending on the backend model relationship loading. 
    // SQLAlchemy default lazy loading might mean items are there but score inside item is not loaded unless joined.
    // Let's check backend models. PlaylistItem has relationship score. 
    // But Pydantic schema PlaylistItem doesn't include Score details, only score_id.
    // We need to update backend schema to include Score details or fetch them separately.
    // For v0.1, let's update schema to include Score nested.
  } catch (error) {
    message.error('获取播放列表失败')
  }
}

const createDefaultPlaylist = async () => {
  try {
    await axios.post('/api/playlists/', { name: '默认列表' }, {
      headers: { 'Authorization': `Bearer ${userStore.token}` }
    })
    fetchPlaylists()
  } catch (error) {
    message.error('创建失败')
  }
}

const goToPractice = (scoreId) => {
  router.push(`/practice/${scoreId}`)
}

onMounted(() => {
  fetchPlaylists()
})
</script>
