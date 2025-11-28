import { defineStore } from 'pinia'
import axios from 'axios'

export const useUserStore = defineStore('user', {
    state: () => ({
        token: localStorage.getItem('token') || null,
        username: localStorage.getItem('username') || null
    }),
    getters: {
        isLoggedIn: (state) => !!state.token
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
            localStorage.removeItem('token')
            localStorage.removeItem('username')
        }
    }
})
