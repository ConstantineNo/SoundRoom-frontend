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
         */
        async fetchUserInfo() {
            if (!this.token) {
                return null
            }
            
            try {
                // 尝试多个可能的用户信息接口
                const endpoints = ['/api/auth/me', '/api/auth/user', '/api/user/me', '/api/user/info']
                let userInfo = null
                
                for (const endpoint of endpoints) {
                    try {
                        const response = await axios.get(endpoint, {
                            headers: { 'Authorization': `Bearer ${this.token}` }
                        })
                        userInfo = response.data
                        break
                    } catch (err) {
                        // 继续尝试下一个接口
                        continue
                    }
                }
                
                if (userInfo) {
                    if (userInfo.role) {
                        this.role = userInfo.role
                        localStorage.setItem('role', this.role)
                    }
                    if (userInfo.username && !this.username) {
                        this.username = userInfo.username
                        localStorage.setItem('username', this.username)
                    }
                    return userInfo
                }
                
                return null
            } catch (error) {
                console.error('获取用户信息失败:', error)
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
