import { defineStore } from 'pinia'
import axios from 'axios'

export const useUserStore = defineStore('user', {
    state: () => ({
        token: localStorage.getItem('token') || null,
        username: localStorage.getItem('username') || null,
        role: localStorage.getItem('role') || null
    }),
    getters: {
        isLoggedIn: (state) => !!state.token,
        isAdmin: (state) => state.role === 'admin'
    },
    actions: {
        /**
         * 获取当前用户信息（包括role）
         * 使用 /api/auth/me 接口
         */
        async fetchUserInfo() {
            if (!this.token) {
                return null
            }
            
            try {
                const response = await axios.get('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                })
                
                const userInfo = response.data
                
                // 更新用户信息
                if (userInfo.role) {
                    this.role = userInfo.role
                    localStorage.setItem('role', this.role)
                }
                if (userInfo.username) {
                    this.username = userInfo.username
                    localStorage.setItem('username', this.username)
                }
                
                return userInfo
            } catch (error) {
                // 401 未授权，可能是token过期
                if (error.response && error.response.status === 401) {
                    console.error('获取用户信息失败: 未授权，可能需要重新登录')
                    // 可以选择清除token，让用户重新登录
                    // this.logout()
                } else {
                    console.error('获取用户信息失败:', error)
                }
                return null
            }
        },
        async login(username, password) {
            try {
                const formData = new FormData()
                formData.append('username', username)
                formData.append('password', password)

                const response = await axios.post('/api/auth/login', formData)
                this.token = response.data.access_token
                this.username = username

                // 尝试从响应中获取role
                if (response.data.role) {
                    this.role = response.data.role
                    localStorage.setItem('role', this.role)
                } else {
                    // 登录后尝试获取用户信息（包括role）
                    // 如果获取失败，role保持为null，后续在需要时再获取
                    await this.fetchUserInfo()
                }

                localStorage.setItem('token', this.token)
                localStorage.setItem('username', this.username)
                return true
            } catch (error) {
                console.error('Login failed:', error)
                throw error
            }
        },
        async register(username, password) {
            try {
                await axios.post('/api/auth/register', { username, password })
                return true
            } catch (error) {
                console.error('Registration failed:', error)
                throw error
            }
        },
        logout() {
            this.token = null
            this.username = null
            this.role = null
            localStorage.removeItem('token')
            localStorage.removeItem('username')
            localStorage.removeItem('role')
        }
    }
})
