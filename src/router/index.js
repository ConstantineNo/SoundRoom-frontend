import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import Library from '../views/Library.vue'
import Playlist from '../views/Playlist.vue'
import Workbench from '../views/Workbench.vue'
import Editor from '../views/Editor.vue'
import AdminDashboard from '../views/AdminDashboard.vue'
import { useUserStore } from '../stores/user'

const routes = [
    { path: '/login', component: Login },
    { path: '/register', component: Register },
    { path: '/library', component: Library },
    { path: '/playlist', component: Playlist },
    { path: '/practice/:scoreId', component: Workbench },
    { path: '/editor/:scoreId', component: Editor },
    { 
        path: '/dashboard', 
        component: AdminDashboard,
        meta: { requiresAdmin: true }
    },
    { path: '/', redirect: '/library' }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
    const userStore = useUserStore()
    
    // 检查是否需要管理员权限
    if (to.meta.requiresAdmin) {
        if (!userStore.isLoggedIn) {
            // 未登录，重定向到登录页
            next({ path: '/login', query: { redirect: to.fullPath } })
            return
        }
        
        if (!userStore.isAdmin) {
            // 不是管理员，重定向到首页
            // 提示消息将在组件中显示
            next({ 
                path: '/library',
                query: { error: 'no_admin_permission' }
            })
            return
        }
    }
    
    next()
})

export default router
