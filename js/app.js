document.addEventListener('DOMContentLoaded', () => {
    console.log('App loaded - منصة وظائف واستثمار');
    ensureSinglePage();
    setupNavigation();
    setupModals();
    loadChats();
    setupChatListeners();
    
    // تحميل البيانات الأولية
    loadJobs();
    loadInvestments();
    updateUserStats();
});

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}

// ========== إدارة الصفحات ==========

function ensureSinglePage() {
    const pages = document.querySelectorAll('.page');
    const subpages = document.querySelectorAll('.profile-subpage');
    subpages.forEach(page => page.style.display = 'none');
    pages.forEach(page => {
        page.style.display = page.classList.contains('active') ? 'block' : 'none';
    });
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');
    
    if (!navItems.length || !pages.length) return;
    
    function switchPage(pageId) {
        pages.forEach(page => page.classList.remove('active'));
        const targetPage = document.querySelector(`.page.${pageId}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
            targetPage.style.display = 'block';
        }
        pages.forEach(page => {
            if (!page.classList.contains('active')) page.style.display = 'none';
        });
        document.querySelectorAll('.profile-subpage').forEach(sp => sp.style.display = 'none');
        
        // إخفاء صفحات التفاصيل والنشر
        document.getElementById('jobDetailsPage').style.display = 'none';
        document.getElementById('investmentDetailsPage').style.display = 'none';
        document.getElementById('postJobPage').style.display = 'none';
        document.getElementById('postInvestmentPage').style.display = 'none';
        
        // إخفاء صفحة المحادثة
        const conversationPage = document.getElementById('conversationPage');
        if (conversationPage) {
            conversationPage.style.display = 'none';
            document.body.classList.remove('conversation-open');
        }
        
        // تحميل البيانات حسب الصفحة
        if (pageId === 'home') {
            loadJobs();
            loadInvestments();
        } else if (pageId === 'profile') {
            loadUserProfile();
        }
        
        navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageId));
    }
    
    navItems.forEach(item => item.addEventListener('click', () => switchPage(item.dataset.page)));
}

function setupModals() {
    window.openLanguageModal = () => {
        document.getElementById('languageModal')?.classList.add('active');
    };
    
    window.openAccountTypeModal = () => {
        document.getElementById('accountTypeModal')?.classList.add('active');
    };
    
    window.closeModal = () => {
        document.querySelectorAll('.modal').forEach(modal => modal.classList.remove('active'));
    };
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
    
    document.querySelectorAll('.settings-item').forEach(item => {
        if (item.querySelector('[data-i18n="language"]')) {
            item.addEventListener('click', openLanguageModal);
        }
    });
}

// ========== نظام الوظائف ==========

let currentJobs = [];
let currentFilter = {
    governorate: '',
    category: ''
};

// تحميل الوظائف
async function loadJobs() {
    const jobsList = document.getElementById('jobsList');
    if (!jobsList) return;
    
    try {
        let query = window.db.collection('jobs').orderBy('createdAt', 'desc');
        
        // تطبيق الفلترة
        if (currentFilter.governorate) {
            query = query.where('governorate', '==', currentFilter.governorate);
        }
        if (currentFilter.category) {
            query = query.where('category', '==', currentFilter.category);
        }
        
        const snapshot = await query.limit(20).get();
        
        if (snapshot.empty) {
            jobsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-briefcase"></i>
                    <h3>لا توجد وظائف</h3>
                    <p>لا توجد وظائف متاحة حالياً</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        currentJobs = [];
        
        snapshot.forEach(doc => {
            const job = { id: doc.id, ...doc.data() };
            currentJobs.push(job);
            
            const time = job.createdAt ? new Date(job.createdAt.seconds * 1000) : new Date();
            const timeAgo = getTimeAgo(time);
            
            html += `
                <div class="job-card" onclick="showJobDetails('${doc.id}')">
                    <div class="job-header">
                        <div class="job-avatar-emoji">💼</div>
                        <div class="job-title">
                            <h3>${job.title || 'وظيفة'}</h3>
                            <span class="job-company">
                                <i class="fas fa-building"></i>
                                ${job.company || 'شركة غير محددة'}
                            </span>
                        </div>
                    </div>
                    
                    <div class="job-details">
                        <span class="job-detail">
                            <i class="fas fa-map-marker-alt"></i>
                            ${job.governorate || 'غير محدد'} ${job.area ? `- ${job.area}` : ''}
                        </span>
                        <span class="job-detail">
                            <i class="fas fa-clock"></i>
                            ${getJobTypeText(job.type)}
                        </span>
                        <span class="job-detail">
                            <i class="fas fa-briefcase"></i>
                            ${getExperienceText(job.experience)}
                        </span>
                    </div>
                    
                    <div class="job-description">
                        ${job.description?.substring(0, 100)}...
                    </div>
                    
                    ${job.skills?.length ? `
                        <div class="job-tags">
                            ${job.skills.slice(0, 3).map(skill => `<span class="tag">${skill}</span>`).join('')}
                            ${job.skills.length > 3 ? `<span class="tag">+${job.skills.length - 3}</span>` : ''}
                        </div>
                    ` : ''}
                    
                    <div class="job-footer">
                        <span class="job-salary">${job.salary || 'راتب غير محدد'}</span>
                        <span class="job-time">${timeAgo}</span>
                    </div>
                </div>
            `;
        });
        
        jobsList.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading jobs:', error);
        jobsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ في تحميل الوظائف</h3>
                <p>حاول مرة أخرى</p>
            </div>
        `;
    }
}

// تحميل الاستثمارات
async function loadInvestments() {
    const investmentsList = document.getElementById('investmentsList');
    if (!investmentsList) return;
    
    try {
        const snapshot = await window.db.collection('investments')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();
        
        if (snapshot.empty) {
            investmentsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-line"></i>
                    <h3>لا توجد فرص استثمارية</h3>
                    <p>لا توجد فرص استثمارية متاحة حالياً</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        snapshot.forEach(doc => {
            const investment = doc.data();
            const time = investment.createdAt ? new Date(investment.createdAt.seconds * 1000) : new Date();
            const timeAgo = getTimeAgo(time);
            
            html += `
                <div class="investment-card" onclick="showInvestmentDetails('${doc.id}')">
                    <div class="investment-header">
                        <div class="investment-avatar-emoji">💰</div>
                        <div class="investment-title">
                            <h3>${investment.title || 'فرصة استثمارية'}</h3>
                            <span class="investment-owner">
                                <i class="fas fa-user"></i>
                                ${investment.ownerName || 'مستثمر'}
                            </span>
                        </div>
                    </div>
                    
                    <div class="investment-details">
                        <span class="investment-detail">
                            <i class="fas fa-map-marker-alt"></i>
                            ${investment.governorate || 'غير محدد'} ${investment.area ? `- ${investment.area}` : ''}
                        </span>
                        <span class="investment-detail">
                            <i class="fas fa-tag"></i>
                            ${getInvestmentFieldText(investment.field)}
                        </span>
                        <span class="investment-detail">
                            <i class="fas fa-clock"></i>
                            ${investment.duration || 'مدة غير محددة'}
                        </span>
                    </div>
                    
                    <div class="investment-description">
                        ${investment.description?.substring(0, 100)}...
                    </div>
                    
                    <div class="investment-footer">
                        <span class="investment-capital">
                            💰 رأس المال: ${formatNumber(investment.capital)} د.ع
                        </span>
                        <span class="investment-profit">
                            📈 أرباح: ${investment.profit || 'غير محددة'}
                        </span>
                        <span class="investment-time">${timeAgo}</span>
                    </div>
                </div>
            `;
        });
        
        investmentsList.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading investments:', error);
        investmentsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ في تحميل الفرص الاستثمارية</h3>
                <p>حاول مرة أخرى</p>
            </div>
        `;
    }
}

// ========== دوال الفلترة والتبويب ==========

window.switchTab = function(tab) {
    const jobsList = document.getElementById('jobsList');
    const investmentsList = document.getElementById('investmentsList');
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach(t => t.classList.remove('active'));
    event.target.closest('.tab').classList.add('active');
    
    if (tab === 'jobs') {
        jobsList.style.display = 'block';
        investmentsList.style.display = 'none';
        loadJobs();
    } else {
        jobsList.style.display = 'none';
        investmentsList.style.display = 'block';
        loadInvestments();
    }
};

window.applyFilters = function() {
    const governorate = document.getElementById('governorateFilter').value;
    const category = document.getElementById('categoryFilter').value;
    
    currentFilter = { governorate, category };
    loadJobs();
};

// ========== دوال مساعدة ==========

function getJobTypeText(type) {
    const types = {
        'full-time': 'دوام كامل',
        'part-time': 'دوام جزئي',
        'remote': 'عن بعد',
        'freelance': 'حر',
        'internship': 'تدريب'
    };
    return types[type] || 'دوام كامل';
}

function getExperienceText(exp) {
    const exps = {
        '0': 'بدون خبرة',
        '1': 'سنة - سنتين',
        '3': '٣ - ٥ سنوات',
        '5': '٥+ سنوات'
    };
    return exps[exp] || 'خبرة غير محددة';
}

function getInvestmentFieldText(field) {
    const fields = {
        'industrial': 'صناعي',
        'commercial': 'تجاري',
        'agricultural': 'زراعي',
        'service': 'خدماتي',
        'tech': 'تقني'
    };
    return fields[field] || 'غير محدد';
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'الآن';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} دقيقة`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} ساعة`;
    return `${Math.floor(seconds / 86400)} يوم`;
}

// ========== دوال النشر ==========

window.showPostJobModal = function() {
    document.querySelector('.home-page').style.display = 'none';
    document.getElementById('postJobPage').style.display = 'block';
};

window.showPostInvestmentModal = function() {
    document.querySelector('.home-page').style.display = 'none';
    document.getElementById('postInvestmentPage').style.display = 'block';
};

window.goBack = function() {
    document.querySelectorAll('.page').forEach(page => {
        if (page.id !== 'home-page' && page.id !== 'profile-page') {
            page.style.display = 'none';
        }
    });
    document.querySelector('.home-page').style.display = 'block';
    document.querySelector('.home-page').classList.add('active');
};

// ========== نظام الدردشة (مثل واتساب) ==========

const ChatSystem = {
    currentChat: null,
    messages: {},
    
    init() {
        this.loadAllChats();
    },
    
    loadAllChats() {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('chat_')) {
                const friendId = key.replace('chat_', '');
                try {
                    this.messages[friendId] = JSON.parse(localStorage.getItem(key)) || [];
                } catch (e) {
                    this.messages[friendId] = [];
                }
            }
        }
    },
    
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId;
        document.body.classList.add('conversation-open');
        
        const nameElement = document.getElementById('conversationName');
        const avatarElement = document.getElementById('conversationAvatar');
        const statusElement = document.getElementById('conversationStatus');
        
        if (nameElement) nameElement.textContent = friendName;
        if (avatarElement) avatarElement.textContent = friendAvatar || '👤';
        if (statusElement) statusElement.textContent = 'آخر زيارة اليوم';
        
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'flex';
        
        this.displayMessages(friendId);
        this.listenForNewMessages(friendId);
        
        setTimeout(() => {
            const input = document.getElementById('messageInput');
            if (input) input.focus();
        }, 300);
    },
    
    displayMessages(friendId) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        container.innerHTML = '';
        const messages = this.messages[friendId] || [];
        messages.forEach(msg => this.displayMessage(msg));
    },
    
    displayMessage(msg) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`;
        messageDiv.id = `msg-${msg.id}`;
        
        const time = new Date(msg.time).toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let statusHtml = '';
        if (msg.sender === 'me') {
            let statusIcon = msg.status === 'sending' ? '⏳' : 
                            msg.status === 'sent' ? '✓' : 
                            msg.status === 'delivered' ? '✓✓' : 
                            msg.status === 'read' ? '✓✓' : '✓';
            let statusClass = msg.status || 'sent';
            statusHtml = `<span class="message-status ${statusClass}">${statusIcon}</span>`;
        }
        
        if (msg.type === 'text') {
            messageDiv.innerHTML = `
                <div class="message-content">${this.escapeHtml(msg.text)}</div>
                <div class="message-info">
                    <span class="message-time">${time}</span>
                    ${statusHtml}
                </div>
            `;
        } else if (msg.type === 'image') {
            messageDiv.innerHTML = `
                <img src="${msg.data}" class="message-image" onclick="window.open('${msg.data}')">
                <div class="message-info">
                    <span class="message-time">${time}</span>
                    ${statusHtml}
                </div>
            `;
        } else if (msg.type === 'voice') {
            messageDiv.innerHTML = `
                <audio controls src="${msg.data}" class="message-audio"></audio>
                <div class="message-info">
                    <span class="message-time">${time}</span>
                    ${statusHtml}
                </div>
            `;
        }
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    },
    
    async sendMessage(text) {
        if (!this.currentChat || !text.trim()) return false;
        
        const messageId = Date.now().toString();
        const message = {
            id: messageId,
            type: 'text',
            text: text,
            sender: 'me',
            time: new Date().toISOString(),
            status: 'sending'
        };
        
        this.displayMessage(message);
        this.saveMessage(this.currentChat, message);
        
        try {
            const docRef = await window.db.collection('temp_messages').add({
                to: this.currentChat,
                from: window.auth.currentUser.uid,
                message: message,
                timestamp: new Date(),
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            });
            
            this.updateMessageStatus(messageId, 'sent');
            this.waitForDelivery(messageId, docRef.id);
            
        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
            this.updateMessageStatus(messageId, 'error');
        }
        
        return true;
    },
    
    updateMessageStatus(messageId, status) {
        const messageElement = document.getElementById(`msg-${messageId}`);
        if (!messageElement) return;
        
        const statusElement = messageElement.querySelector('.message-status');
        if (!statusElement) return;
        
        statusElement.className = `message-status ${status}`;
        statusElement.innerHTML = status === 'sending' ? '⏳' :
                                 status === 'sent' ? '✓' :
                                 status === 'delivered' ? '✓✓' :
                                 status === 'read' ? '✓✓' : '✓';
        
        if (status === 'read') statusElement.style.color = '#4fc3f7';
        else if (status === 'error') {
            statusElement.innerHTML = '⚠️';
            statusElement.style.color = '#f44336';
        }
        
        this.updateMessageStatusInStorage(messageId, status);
    },
    
    updateMessageStatusInStorage(messageId, status) {
        const key = `chat_${this.currentChat}`;
        try {
            let history = JSON.parse(localStorage.getItem(key)) || [];
            history = history.map(msg => {
                if (msg.id === messageId) {
                    return { ...msg, status: status };
                }
                return msg;
            });
            localStorage.setItem(key, JSON.stringify(history));
            this.messages[this.currentChat] = history;
        } catch (e) {
            console.error('خطأ في تحديث الحالة:', e);
        }
    },
    
    waitForDelivery(messageId, firebaseDocId) {
        const unsubscribe = window.db.collection('temp_messages')
            .doc(firebaseDocId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data.delivered) this.updateMessageStatus(messageId, 'delivered');
                    if (data.read) {
                        this.updateMessageStatus(messageId, 'read');
                        unsubscribe();
                    }
                }
            });
        
        setTimeout(() => {
            this.updateMessageStatus(messageId, 'delivered');
        }, 5000);
    },
    
    saveMessage(friendId, message) {
        const key = `chat_${friendId}`;
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem(key)) || [];
        } catch (e) {
            history = [];
        }
        history.push(message);
        if (history.length > 100) history = history.slice(-100);
        localStorage.setItem(key, JSON.stringify(history));
        this.messages[friendId] = history;
    },
    
    listenForNewMessages(friendId) {
        if (!window.auth?.currentUser) return;
        window.db.collection('temp_messages')
            .where('from', '==', friendId)
            .where('to', '==', window.auth.currentUser.uid)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        
                        if (data.message && data.message.id) {
                            this.updateMessageStatusFromFriend(data.message.id, 'delivered');
                        }
                        
                        const message = { ...data.message, sender: 'friend' };
                        this.saveMessage(friendId, message);
                        
                        if (this.currentChat === friendId) {
                            this.displayMessage(message);
                            setTimeout(() => {
                                this.markAsRead(data.message.id, change.doc.id);
                            }, 1000);
                        } else {
                            this.updateLastMessage(friendId, message.text || '📷 صورة' || '🎤 بصمة');
                        }
                        
                        change.doc.ref.delete();
                    }
                });
            });
    },
    
    updateMessageStatusFromFriend(messageId, status) {
        const key = `chat_${this.currentChat}`;
        try {
            let history = JSON.parse(localStorage.getItem(key)) || [];
            let updated = false;
            
            history = history.map(msg => {
                if (msg.id === messageId && msg.sender === 'me') {
                    updated = true;
                    return { ...msg, status: status };
                }
                return msg;
            });
            
            if (updated) {
                localStorage.setItem(key, JSON.stringify(history));
                this.messages[this.currentChat] = history;
                
                const msgElement = document.getElementById(`msg-${messageId}`);
                if (msgElement) {
                    const statusElement = msgElement.querySelector('.message-status');
                    if (statusElement) {
                        statusElement.className = `message-status ${status}`;
                        statusElement.innerHTML = status === 'delivered' ? '✓✓' : '✓✓';
                        if (status === 'read') statusElement.style.color = '#4fc3f7';
                    }
                }
            }
        } catch (e) {
            console.error('خطأ في تحديث الحالة:', e);
        }
    },
    
    async markAsRead(messageId, firebaseDocId) {
        try {
            await window.db.collection('temp_messages').doc(firebaseDocId).update({
                read: true,
                readAt: new Date()
            });
            this.updateMessageStatus(messageId, 'read');
        } catch (error) {
            console.error('خطأ في تحديث حالة القراءة:', error);
        }
    },
    
    updateLastMessage(friendId, lastMessage) {
        const chatItems = document.querySelectorAll('.chat-item');
        for (const item of chatItems) {
            if (item.getAttribute('onclick')?.includes(friendId)) {
                const lastMsgEl = item.querySelector('.last-message');
                const timeEl = item.querySelector('.chat-time');
                if (lastMsgEl) lastMsgEl.textContent = lastMessage;
                if (timeEl) timeEl.textContent = 'الآن';
                break;
            }
        }
    },
    
    closeChat() {
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        this.currentChat = null;
    },
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

ChatSystem.init();

// ========== تحميل المحادثات ==========

async function loadChats() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;
    
    try {
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (!userDoc.exists) return;
        
        const friends = userDoc.data().friends || [];
        
        if (friends.length === 0) {
            chatsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <h3>لا توجد محادثات</h3>
                    <p>تواصل مع أصحاب العمل والمستثمرين</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        for (const friendId of friends) {
            try {
                const friendDoc = await window.db.collection('users').doc(friendId).get();
                if (friendDoc.exists) {
                    const friend = friendDoc.data();
                    const avatarEmoji = window.getEmojiForUser ? 
                        window.getEmojiForUser(friend) : '👤';
                    
                    const key = `chat_${friendId}`;
                    let lastMessage = 'اضغط لبدء المحادثة';
                    let lastTime = '';
                    let unreadCount = 0;
                    
                    try {
                        const history = JSON.parse(localStorage.getItem(key)) || [];
                        if (history.length > 0) {
                            const last = history[history.length - 1];
                            lastMessage = last.type === 'text' ? last.text :
                                         last.type === 'image' ? '📷 صورة' :
                                         last.type === 'voice' ? '🎤 بصمة' : 'رسالة';
                            lastTime = new Date(last.time).toLocaleTimeString('ar-EG', {
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            
                            unreadCount = history.filter(msg => 
                                msg.sender === 'friend' && msg.status !== 'read'
                            ).length;
                        }
                    } catch (e) {}
                    
                    const unreadBadge = unreadCount > 0 ? 
                        `<span class="unread-badge">${unreadCount}</span>` : '';
                    
                    html += `
                        <div class="chat-item" onclick="openChat('${friendId}')">
                            <div class="chat-avatar-emoji">${avatarEmoji}</div>
                            <div class="chat-info">
                                <h4>${friend.name || 'مستخدم'}</h4>
                                <p class="last-message">${lastMessage}</p>
                            </div>
                            <div class="chat-meta">
                                <span class="chat-time">${lastTime || ''}</span>
                                ${unreadBadge}
                            </div>
                        </div>
                    `;
                }
            } catch (e) {
                console.error('Error loading friend:', e);
            }
        }
        
        chatsList.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading chats:', error);
        chatsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ في تحميل المحادثات</h3>
                <p>حاول مرة أخرى</p>
            </div>
        `;
    }
}

function setupChatListeners() {
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('attachmentMenu');
        const attachBtn = document.querySelector('.attach-btn');
        if (menu && attachBtn && !menu.contains(e.target) && !attachBtn.contains(e.target)) {
            menu.style.display = 'none';
        }
        
        const emojiPicker = document.getElementById('emojiPicker');
        const emojiBtn = document.querySelector('.emoji-btn');
        if (emojiPicker && emojiBtn && !emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
            emojiPicker.style.display = 'none';
        }
    });
    
    if (window.auth?.currentUser) {
        window.db.collection('temp_messages')
            .where('to', '==', window.auth.currentUser.uid)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        loadChats();
                    }
                });
            });
    }
}

// ========== دوال عامة للواجهة ==========

window.openChat = function(friendId) {
    window.db.collection('users').doc(friendId).get().then((doc) => {
        if (doc.exists) {
            const friend = doc.data();
            const avatarEmoji = window.getEmojiForUser ? 
                window.getEmojiForUser(friend) : '👤';
            ChatSystem.openChat(friendId, friend.name, avatarEmoji);
        }
    }).catch(error => {
        console.error('خطأ في فتح المحادثة:', error);
    });
};

window.sendMessage = function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (text) {
        ChatSystem.sendMessage(text).then(sent => {
            if (sent) input.value = '';
        });
    }
};

window.handleMessageKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        window.sendMessage();
    }
};

window.showAttachmentMenu = function() {
    const menu = document.getElementById('attachmentMenu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiPicker) emojiPicker.style.display = 'none';
};

window.showEmojiPicker = function() {
    const picker = document.getElementById('emojiPicker');
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    const menu = document.getElementById('attachmentMenu');
    if (menu) menu.style.display = 'none';
    
    if (picker.querySelector('.emoji-grid').children.length === 0) {
        loadEmojis();
    }
};

function loadEmojis() {
    const emojis = ['😊', '😂', '❤️', '👍', '🎉', '😢', '😡', '😍', '🤔', '👌', '🙏', '🔥', '✨', '⭐', '🌙', '☀️'];
    const grid = document.querySelector('.emoji-grid');
    if (!grid) return;
    
    emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.onclick = () => {
            const input = document.getElementById('messageInput');
            input.value += emoji;
            input.focus();
            document.getElementById('emojiPicker').style.display = 'none';
        };
        grid.appendChild(btn);
    });
}

window.sendImage = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file && ChatSystem.currentChat) ChatSystem.sendImage(file);
    };
    input.click();
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.sendVoiceNote = function() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            const mediaRecorder = new MediaRecorder(stream);
            const chunks = [];
            
            mediaRecorder.ondataavailable = e => chunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                ChatSystem.sendVoiceNote(blob);
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            
            const sendBtn = document.querySelector('.send-btn');
            const voiceBtn = document.querySelector('.voice-btn');
            if (sendBtn) sendBtn.style.display = 'none';
            if (voiceBtn) {
                voiceBtn.style.display = 'flex';
                voiceBtn.onclick = () => {
                    if (mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                        sendBtn.style.display = 'flex';
                        voiceBtn.style.display = 'none';
                    }
                };
            }
            
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    if (sendBtn) sendBtn.style.display = 'flex';
                    if (voiceBtn) voiceBtn.style.display = 'none';
                }
            }, 60000);
        });
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.shareLocation = function() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const locationUrl = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
            ChatSystem.sendMessage(`📍 موقعي: ${locationUrl}`);
        });
    }
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.closeConversation = function() {
    ChatSystem.closeChat();
};

window.viewContactInfo = function() {
    alert('معلومات الاتصال - قيد التطوير');
};

// ========== دوال الملف الشخصي ==========

async function loadUserProfile() {
    if (!window.auth?.currentUser) return;
    
    try {
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            document.getElementById('profileName').textContent = userData.name || 'مستخدم';
            document.getElementById('profileAvatarEmoji').textContent = 
                window.getEmojiForUser ? window.getEmojiForUser(userData) : '👤';
            document.getElementById('profileBio').textContent = userData.bio || '';
            document.getElementById('shareableId').textContent = userData.shareableId || '0000000000';
            document.getElementById('profileType').textContent = getAccountTypeText(userData.accountType);
            
            // تحميل إحصائيات المستخدم
            await loadUserStats(userData.uid);
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

function getAccountTypeText(type) {
    const types = {
        'jobseeker': 'باحث عن عمل',
        'employer': 'صاحب عمل',
        'investor': 'مستثمر',
        'project-owner': 'صاحب مشروع'
    };
    return types[type] || 'باحث عن عمل';
}

async function loadUserStats(userId) {
    try {
        // عدد إعلانات المستخدم
        const jobsSnapshot = await window.db.collection('jobs')
            .where('userId', '==', userId)
            .get();
        
        const investmentsSnapshot = await window.db.collection('investments')
            .where('userId', '==', userId)
            .get();
        
        const postsCount = jobsSnapshot.size + investmentsSnapshot.size;
        document.getElementById('postsCount').textContent = formatNumber(postsCount);
        
        // عدد الطلبات (سيتم تطويرها لاحقاً)
        document.getElementById('applicationsCount').textContent = '0';
        document.getElementById('savedCount').textContent = '0';
        
    } catch (error) {
        console.error('Error loading user stats:', error);
    }
}

window.showUserPosts = function() {
    switchProfileTab('posts');
};

window.showApplications = function() {
    switchProfileTab('applications');
};

window.showSaved = function() {
    switchProfileTab('saved');
};

window.switchProfileTab = function(tab) {
    const tabs = document.querySelectorAll('.profile-tab');
    const sections = {
        posts: document.getElementById('profilePostsSection'),
        applications: document.getElementById('profileApplicationsSection'),
        saved: document.getElementById('profileSavedSection')
    };
    
    tabs.forEach(t => t.classList.remove('active'));
    event.target.closest('.profile-tab').classList.add('active');
    
    Object.values(sections).forEach(s => s.style.display = 'none');
    if (sections[tab]) sections[tab].style.display = 'block';
    
    if (tab === 'posts') loadUserPosts();
};

async function loadUserPosts() {
    if (!window.auth?.currentUser) return;
    
    const postsSection = document.getElementById('profilePostsSection');
    if (!postsSection) return;
    
    try {
        const jobsSnapshot = await window.db.collection('jobs')
            .where('userId', '==', window.auth.currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        const investmentsSnapshot = await window.db.collection('investments')
            .where('userId', '==', window.auth.currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        if (jobsSnapshot.empty && investmentsSnapshot.empty) {
            postsSection.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <h3>لا توجد إعلانات</h3>
                    <p>لم تقم بنشر أي إعلان بعد</p>
                </div>
            `;
            return;
        }
        
        let html = '<div class="user-posts">';
        
        jobsSnapshot.forEach(doc => {
            const job = doc.data();
            html += `
                <div class="post-item job-item" onclick="showJobDetails('${doc.id}')">
                    <i class="fas fa-briefcase"></i>
                    <div class="post-info">
                        <h4>${job.title}</h4>
                        <span>${job.governorate || 'غير محدد'}</span>
                    </div>
                    <span class="post-type">وظيفة</span>
                </div>
            `;
        });
        
        investmentsSnapshot.forEach(doc => {
            const inv = doc.data();
            html += `
                <div class="post-item investment-item" onclick="showInvestmentDetails('${doc.id}')">
                    <i class="fas fa-chart-line"></i>
                    <div class="post-info">
                        <h4>${inv.title}</h4>
                        <span>${inv.governorate || 'غير محدد'}</span>
                    </div>
                    <span class="post-type">استثمار</span>
                </div>
            `;
        });
        
        html += '</div>';
        postsSection.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading user posts:', error);
    }
}

// ========== دوال النشر (سيتم تطويرها في jobs.js) ==========

window.publishJob = function() {
    alert('سيتم تطوير نشر الوظائف قريباً');
};

window.publishInvestment = function() {
    alert('سيتم تطوير نشر الفرص الاستثمارية قريباً');
};

// ========== إحصائيات المستخدم ==========

async function updateUserStats() {
    if (!window.auth?.currentUser) return;
    await loadUserStats(window.auth.currentUser.uid);
}

// ========== التهيئة ==========

console.log('✅ app.js محدث - منصة وظائف واستثمار');
