// ========== api-client.js - Rafeeq API Client ==========
// يتصل بـ Cloudflare Workers API

window.RafeeqAPI = {
    BASE_URL: 'https://rafeeq-api.ali-a77.workers.dev',
    token: null,
    user: null,
    
    // ==================== Token Management ====================
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('rafeeq_token', token);
        } else {
            localStorage.removeItem('rafeeq_token');
        }
    },
    
    getToken() {
        if (!this.token) {
            this.token = localStorage.getItem('rafeeq_token');
        }
        return this.token;
    },
    
    setUser(user) {
        this.user = user;
        if (user) {
            localStorage.setItem('rafeeq_user', JSON.stringify(user));
        } else {
            localStorage.removeItem('rafeeq_user');
        }
    },
    
    getUser() {
        if (!this.user) {
            try {
                this.user = JSON.parse(localStorage.getItem('rafeeq_user'));
            } catch (e) {
                this.user = null;
            }
        }
        return this.user;
    },
    
    clearAll() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('rafeeq_token');
        localStorage.removeItem('rafeeq_user');
    },
    
    // ==================== HTTP Request ====================
    async request(endpoint, options = {}) {
        const url = `${this.BASE_URL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        
        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        try {
            const response = await fetch(url, {
                ...options,
                headers
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                // إذا انتهت الجلسة
                if (response.status === 401) {
                    this.clearAll();
                    if (typeof window.onSessionExpired === 'function') {
                        window.onSessionExpired();
                    }
                }
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            
            return data;
            
        } catch (error) {
            console.error(`❌ API Error [${endpoint}]:`, error.message);
            throw error;
        }
    },
    
    // ==================== HTTP Methods ====================
    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },
    
    post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    
    put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },
    
    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },
    
    // ==================== Auth API ====================
    auth: {
        // تسجيل الدخول بـ Google idToken
        async signInWithGoogle(idToken) {
            const response = await RafeeqAPI.post('/api/auth/google', { idToken });
            if (response.success && response.token) {
                RafeeqAPI.setToken(response.token);
                RafeeqAPI.setUser(response.user);
            }
            return response;
        },
        
        // التحقق من الجلسة
        async verify() {
            return await RafeeqAPI.post('/api/auth/verify');
        },
        
        // تسجيل خروج
        async logout() {
            try {
                await RafeeqAPI.post('/api/auth/logout');
            } finally {
                RafeeqAPI.clearAll();
            }
        },
        
        // بيانات المستخدم الحالي
        async me() {
            return await RafeeqAPI.get('/api/auth/me');
        }
    },
    
    // ==================== Users API ====================
    users: {
        async search(shareableId) {
            return await RafeeqAPI.get(`/api/users/search?id=${encodeURIComponent(shareableId)}`);
        },
        
        async getProfile() {
            return await RafeeqAPI.get('/api/users/profile');
        },
        
        async updateProfile(data) {
            return await RafeeqAPI.put('/api/users/profile', data);
        },
        
        async getById(userId) {
            return await RafeeqAPI.get(`/api/users/${userId}`);
        }
    },
    
    // ==================== Friends API ====================
    friends: {
        async getMyFriends() {
            return await RafeeqAPI.get('/api/friends');
        },
        
        async sendRequest(targetUserId) {
            return await RafeeqAPI.post('/api/friends/request', { targetUserId });
        },
        
        async getRequests() {
            return await RafeeqAPI.get('/api/friends/requests');
        },
        
        async accept(requestId) {
            return await RafeeqAPI.post('/api/friends/accept', { requestId });
        },
        
        async reject(requestId) {
            return await RafeeqAPI.post('/api/friends/reject', { requestId });
        },
        
        async remove(friendId) {
            return await RafeeqAPI.delete(`/api/friends/${friendId}`);
        }
    },
    
    // ==================== Messages API ====================
    messages: {
        async getWithFriend(friendId) {
            return await RafeeqAPI.get(`/api/messages/${friendId}`);
        },
        
        async send(toUser, packageData) {
            return await RafeeqAPI.post('/api/messages/send', {
                toUser,
                package: packageData
            });
        },
        
        async getPending(since = 0) {
            return await RafeeqAPI.get(`/api/messages/pending?since=${since}`);
        },
        
        async markAsRead(messageId) {
            return await RafeeqAPI.post('/api/messages/mark-read', { messageId });
        }
    },
    
    // ==================== Posts API ====================
    posts: {
        async getPosts(type = 'job', country = null, category = null) {
            let url = `/api/posts?type=${type}`;
            if (country && country !== 'all') url += `&country=${country}`;
            if (category && category !== 'all') url += `&category=${category}`;
            return await RafeeqAPI.get(url);
        },
        
        async getMyPosts() {
            return await RafeeqAPI.get('/api/posts/my');
        },
        
        async create(postData) {
            return await RafeeqAPI.post('/api/posts', postData);
        },
        
        async delete(postId) {
            return await RafeeqAPI.delete(`/api/posts/${postId}`);
        }
    },
    
    // ==================== Wallet API ====================
    wallet: {
        async getMyWallet() {
            return await RafeeqAPI.get('/api/wallet');
        },
        
        async requestDeposit(amount, receiptImage, note = '') {
            return await RafeeqAPI.post('/api/wallet/deposit', {
                amount,
                receiptImage,
                note
            });
        },
        
        async getTransactions(limit = 50) {
            return await RafeeqAPI.get(`/api/wallet/transactions?limit=${limit}`);
        }
    },
    
    // ==================== Admin API ====================
    admin: {
        async setup() {
            return await RafeeqAPI.post('/api/admin/setup');
        },
        
        async getStats() {
            return await RafeeqAPI.get('/api/admin/stats');
        },
        
        async getPendingPosts() {
            return await RafeeqAPI.get('/api/admin/posts/pending');
        },
        
        async approvePost(postId) {
            return await RafeeqAPI.post(`/api/admin/posts/${postId}/approve`);
        },
        
        async rejectPost(postId, reason) {
            return await RafeeqAPI.post(`/api/admin/posts/${postId}/reject`, { reason });
        },
        
        async getPendingDeposits() {
            return await RafeeqAPI.get('/api/admin/wallet/pending');
        },
        
        async approveDeposit(txId) {
            return await RafeeqAPI.post(`/api/admin/wallet/${txId}/approve`);
        },
        
        async rejectDeposit(txId, reason) {
            return await RafeeqAPI.post(`/api/admin/wallet/${txId}/reject`, { reason });
        },
        
        async getSettings() {
            return await RafeeqAPI.get('/api/admin/settings');
        },
        
        async updateSettings(settings) {
            return await RafeeqAPI.post('/api/admin/settings', { settings });
        },
        
        async getUsers(search = null) {
            let url = '/api/admin/users';
            if (search) url += `?search=${encodeURIComponent(search)}`;
            return await RafeeqAPI.get(url);
        },
        
        async getAdmins() {
            return await RafeeqAPI.get('/api/admin/admins');
        },
        
        async addAdmin(data) {
            return await RafeeqAPI.post('/api/admin/admins', data);
        },
        
        async removeAdmin(adminId) {
            return await RafeeqAPI.delete(`/api/admin/admins/${adminId}`);
        }
    }
};

console.log('✅ api-client.js loaded - Connected to:', RafeeqAPI.BASE_URL);
