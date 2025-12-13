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
        async login(username, password) {
            try {
                const formData = new FormData()
                formData.append('username', username)
                formData.append('password', password)

                const response = await axios.post('/api/auth/login', formData)
                this.token = response.data.access_token
                this.username = username

                // 尝试从响应中获取role，如果没有则调用用户信息接口
                if (response.data.role) {
                    this.role = response.data.role
                } else {
                    // 调用获取用户信息接口获取role
                    try {
                        const userInfoResponse = await axios.get('/api/auth/me', {
                            headers: { 'Authorization': `Bearer ${this.token}` }
                        })
                        this.role = userInfoResponse.data.role || 'user'
                    } catch (err) {
                        // 如果获取用户信息失败，默认为user
                        this.role = 'user'
                    }
                }

                localStorage.setItem('token', this.token)
                localStorage.setItem('username', this.username)
                localStorage.setItem('role', this.role)
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
