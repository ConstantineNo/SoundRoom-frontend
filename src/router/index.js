import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import Library from '../views/Library.vue'
import Playlist from '../views/Playlist.vue'
import Workbench from '../views/Workbench.vue'
import Editor from '../views/Editor.vue'

const routes = [
    { path: '/login', component: Login },
    { path: '/register', component: Register },
    { path: '/library', component: Library },
    { path: '/playlist', component: Playlist },
    { path: '/practice/:scoreId', component: Workbench },
    { path: '/editor/:scoreId', component: Editor },
    { path: '/', redirect: '/library' }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

export default router
