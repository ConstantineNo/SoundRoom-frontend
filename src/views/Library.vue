<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2>曲谱库</h2>
      <n-space>

        <n-button v-if="userStore.isLoggedIn" type="primary" @click="openUploadModal">上传曲谱</n-button>
      </n-space>
    </div>

    <n-grid x-gap="12" y-gap="12" cols="1 s:2 m:3 l:4" responsive="screen">
      <n-grid-item v-for="score in scores" :key="score.id">
        <n-card :title="score.title" hoverable>
          <template #cover>
            <img :src="getScoreImageUrl(score.image_path)" style="height: 200px; object-fit: cover;" />
          </template>
          <n-space vertical>
            <n-tag>原调: {{ score.song_key }}</n-tag>
            <n-tag>笛子: {{ score.flute_key }}</n-tag>
            <n-tag>指法: {{ score.fingering }}</n-tag>
            <n-button block secondary type="info" @click="goToPractice(score.id)">进入练习</n-button>
            <n-button v-if="userStore.isLoggedIn" block secondary type="warning" @click="goToEditor(score.id)">编辑曲谱</n-button>
            <n-button v-if="userStore.isLoggedIn" block secondary @click="addToPlaylist(score.id)">加入列表</n-button>
          </n-space>
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-modal v-model:show="showUploadModal">
      <n-card style="width: 600px" :title="isEditing ? '编辑曲谱' : '上传新曲谱'" :bordered="false" size="huge" role="dialog" aria-modal="true">
        <n-form>
          <n-form-item label="曲名" required>
            <n-input v-model:value="uploadForm.title" placeholder="请输入曲名" />
          </n-form-item>
          <n-form-item label="曲子调性 (如 降B)" required>
            <n-input v-model:value="uploadForm.song_key" placeholder="请输入曲子原调" />
          </n-form-item>
          <n-form-item label="笛子调性 (如 F调)" required>
            <n-input v-model:value="uploadForm.flute_key" placeholder="请输入使用的笛子调性" />
          </n-form-item>
          <n-form-item label="指法 (如 全按作2)" required>
            <n-input v-model:value="uploadForm.fingering" placeholder="请输入指法" />
          </n-form-item>
          <n-form-item label="曲谱图片">
            <input type="file" @change="handleImageChange" accept="image/*" />
          </n-form-item>
          <n-form-item label="伴奏音频">
            <input type="file" @change="handleAudioChange" accept="audio/*" />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showUploadModal = false">取消</n-button>
            <n-button type="primary" @click="handleUpload" :loading="uploading">{{ isEditing ? '保存' : '上传' }}</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>


  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { NGrid, NGridItem, NCard, NButton, NSpace, NTag, NModal, NForm, NFormItem, NInput, useMessage } from 'naive-ui'
import { useUserStore } from '../stores/user'

const scores = ref([])
const showUploadModal = ref(false)
const uploading = ref(false)
const isEditing = ref(false)
const currentScoreId = ref(null)
const router = useRouter()
const message = useMessage()
const userStore = useUserStore()

const uploadForm = ref({
  title: '',
  song_key: '',
  flute_key: '',
  fingering: '',
  image: null,
  audio: null
})



const fetchScores = async () => {
  try {
    const response = await axios.get('/api/scores/')
    scores.value = response.data
  } catch (error) {
    message.error('获取曲谱失败')
  }
}

const getScoreImageUrl = (path) => {
  // path is like "uploads/img_filename.jpg"
  // Use relative path to leverage Vite proxy
  return `/${path}`
}

const handleImageChange = (event) => {
  uploadForm.value.image = event.target.files[0]
}

const handleAudioChange = (event) => {
  uploadForm.value.audio = event.target.files[0]
}

const openUploadModal = () => {
  isEditing.value = false
  currentScoreId.value = null
  uploadForm.value = {
    title: '',
    song_key: '',
    flute_key: '',
    fingering: '',
    image: null,
    audio: null
  }
  showUploadModal.value = true
}

const openEditModal = (score) => {
  isEditing.value = true
  currentScoreId.value = score.id
  uploadForm.value = {
    title: score.title,
    song_key: score.song_key,
    flute_key: score.flute_key,
    fingering: score.fingering,
    image: null,
    audio: null
  }
  showUploadModal.value = true
}

const handleUpload = async () => {
  if (!uploadForm.value.title || !uploadForm.value.song_key || !uploadForm.value.flute_key || !uploadForm.value.fingering) {
    message.warning('请填写完整信息')
    return
  }
  if (!isEditing.value && (!uploadForm.value.image || !uploadForm.value.audio)) {
    message.warning('请上传文件')
    return
  }
  
  uploading.value = true
  const formData = new FormData()
  formData.append('title', uploadForm.value.title)
  formData.append('song_key', uploadForm.value.song_key)
  formData.append('flute_key', uploadForm.value.flute_key)
  formData.append('fingering', uploadForm.value.fingering)
  if (uploadForm.value.image) formData.append('image', uploadForm.value.image)
  if (uploadForm.value.audio) formData.append('audio', uploadForm.value.audio)
  
  try {
    const config = {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${userStore.token}`
      }
    }

    if (isEditing.value) {
      await axios.put(`/api/scores/${currentScoreId.value}`, formData, config)
      message.success('修改成功')
    } else {
      await axios.post('/api/scores/', formData, config)
      message.success('上传成功')
    }
    showUploadModal.value = false
    fetchScores()
  } catch (error) {
    message.error(isEditing.value ? '修改失败' : '上传失败')
  } finally {
    uploading.value = false
  }
}


const goToPractice = (id) => {
  router.push(`/practice/${id}`)
}

const goToEditor = (id) => {
  router.push(`/editor/${id}`)
}

const addToPlaylist = async (scoreId) => {
  // For v0.1, just add to the first playlist or create one if none exists
  // This is a simplified logic
  try {
    // Get playlists
    let playlistsRes = await axios.get('/api/playlists/', {
      headers: { 'Authorization': `Bearer ${userStore.token}` }
    })
    let playlistId
    if (playlistsRes.data.length === 0) {
      // Create default playlist
      const createRes = await axios.post('/api/playlists/', { name: '默认列表' }, {
        headers: { 'Authorization': `Bearer ${userStore.token}` }
      })
      playlistId = createRes.data.id
    } else {
      playlistId = playlistsRes.data[0].id
    }
    
    // Add item
    await axios.post(`/api/playlists/${playlistId}/items`, null, {
      params: { score_id: scoreId },
      headers: { 'Authorization': `Bearer ${userStore.token}` }
    })
    message.success('已加入播放列表')
  } catch (error) {
    message.error('加入列表失败')
  }
}

onMounted(() => {
  fetchScores()
})
</script>
