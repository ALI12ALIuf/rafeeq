document.addEventListener('DOMContentLoaded', () => {
    console.log('App loaded, setting up navigation...');
    ensureSinglePage();
    setupNavigation();
    setupSideMenu();
    setupModals();
    loadStories();
    loadChats();
    setupChatListeners();
    
    updateTripsCount();
    loadBlockedUsers();
});

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}

async function updateTripsCount() {
    if (!window.auth || !window.auth.currentUser) return;
    try {
        const snapshot = await window.db.collection('trips')
            .where('userId', '==', window.auth.currentUser.uid)
            .where('status', '==', 'ended')
            .get();
        const tripsCount = document.getElementById('tripsCount');
        if (tripsCount) tripsCount.textContent = formatNumber(snapshot.size);
    } catch (error) {
        console.error('Error updating trips count:', error);
    }
}

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
    const menuLinks = document.querySelectorAll('.menu-items a');
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
        if (pageId === 'chat') loadChats();
        if (pageId === 'settings') loadBlockedUsers();
        
        // إخفاء صفحة المحادثة وإزالة كلاس conversation-open
        const conversationPage = document.getElementById('conversationPage');
        if (conversationPage) {
            conversationPage.style.display = 'none';
            document.body.classList.remove('conversation-open');
        }
        
        navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageId));
        const sideMenu = document.getElementById('sideMenu');
        if (sideMenu) sideMenu.classList.remove('open');
    }
    
    navItems.forEach(item => item.addEventListener('click', () => switchPage(item.dataset.page)));
    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (link.dataset.page) switchPage(link.dataset.page);
        });
    });
    
    const menuBtn = document.getElementById('menuBtn');
    const sideMenu = document.getElementById('sideMenu');
    
    if (menuBtn && sideMenu) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sideMenu.classList.toggle('open');
        });
    }
    
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('sideMenu');
        const btn = document.getElementById('menuBtn');
        if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
            menu.classList.remove('open');
        }
    });
}

function setupSideMenu() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof logout === 'function') logout();
        });
    }
}

function setupModals() {
    window.openLanguageModal = () => {
        document.getElementById('languageModal')?.classList.add('active');
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

function loadStories() {
    const container = document.getElementById('storiesContainer');
    if (!container) return;
    const stories = [
        { name: 'قصتك', emoji: '👤' },
        { name: 'محمد', emoji: '👨' },
        { name: 'أحمد', emoji: '👨‍🦳' },
        { name: 'سارة', emoji: '👩' },
    ];
    container.innerHTML = stories.map(story => `
        <div class="story-item">
            <div class="story-avatar-emoji">${story.emoji}</div>
            <span class="story-name">${story.name}</span>
        </div>
    `).join('');
}

// ========== نظام الدردشة المتكامل (مثل واتساب) ==========

const ChatSystem = {
    currentChat: null,
    currentFriendData: null,
    messages: {},
    peer: null,
    currentCall: null,
    localStream: null,
    blockedUsers: [],
    
    init() {
        this.loadAllChats();
        this.initPeer();
        this.loadBlockedUsers();
    },
    
    initPeer() {
        if (!window.auth?.currentUser) return;
        this.peer = new Peer(window.auth.currentUser.uid);
        this.peer.on('call', (call) => {
            // التحقق من أن المتصل ليس محظوراً
            if (this.blockedUsers.includes(call.peer)) {
                call.close();
                return;
            }
            
            if (confirm('مكالمة واردة. هل تريد الرد؟')) {
                navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                    .then(stream => {
                        this.localStream = stream;
                        call.answer(stream);
                        this.currentCall = call;
                        this.showVideoCall(call, stream);
                    });
            } else {
                call.close();
            }
        });
    },
    
    loadBlockedUsers() {
        if (!window.auth?.currentUser) return;
        window.db.collection('users').doc(window.auth.currentUser.uid).get()
            .then(doc => {
                if (doc.exists) {
                    this.blockedUsers = doc.data().blocked || [];
                }
            });
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
    
    // فتح المحادثة
    async openChat(friendId, friendName, friendAvatar) {
        // التحقق من الحظر
        if (this.blockedUsers.includes(friendId)) {
            alert('لا يمكنك فتح المحادثة مع مستخدم محظور');
            return;
        }
        
        this.currentChat = friendId;
        
        // جلب بيانات الصديق
        const friendDoc = await window.db.collection('users').doc(friendId).get();
        this.currentFriendData = friendDoc.data();
        
        // إضافة كلاس للـ body لإخفاء القوائم
        document.body.classList.add('conversation-open');
        
        // تحديث واجهة المحادثة
        const nameElement = document.getElementById('conversationName');
        const avatarElement = document.getElementById('conversationAvatar');
        const statusElement = document.getElementById('conversationStatus');
        
        if (nameElement) nameElement.textContent = friendName;
        if (avatarElement) avatarElement.textContent = friendAvatar || '👤';
        
        // التحقق من حالة الاتصال
        this.checkFriendStatus(friendId);
        
        // إظهار صفحة المحادثة
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'flex';
        
        this.displayMessages(friendId);
        this.listenForNewMessages(friendId);
        
        // التركيز على حقل الإدخال
        setTimeout(() => {
            const input = document.getElementById('messageInput');
            if (input) input.focus();
        }, 300);
        
        // التمرير لآخر رسالة
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            if (container) container.scrollTop = container.scrollHeight;
        }, 100);
    },
    
    // التحقق من حالة الصديق
    checkFriendStatus(friendId) {
        const statusElement = document.getElementById('conversationStatus');
        if (!statusElement) return;
        
        // التحقق من اتصال WebRTC
        const peer = this.peer?.connections[friendId];
        if (peer && peer[0]?.open) {
            statusElement.textContent = 'متصل';
            statusElement.className = 'conversation-status online';
        } else {
            statusElement.textContent = 'آخر زيارة اليوم';
            statusElement.className = 'conversation-status offline';
        }
        
        // تحديث كل 10 ثواني
        setTimeout(() => this.checkFriendStatus(friendId), 10000);
    },
    
    displayMessages(friendId) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        container.innerHTML = '';
        const messages = this.messages[friendId] || [];
        messages.forEach(msg => this.displayMessage(msg));
    },
    
    // عرض الرسالة مع الحالة
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
        
        // إضافة حالة الرسالة (داخل الفقاعة)
        let statusHtml = '';
        if (msg.sender === 'me') {
            let statusIcon = '';
            let statusClass = '';
            
            if (msg.status === 'sending') {
                statusIcon = '⏳';
                statusClass = 'sending';
            } else if (msg.status === 'sent') {
                statusIcon = '✓';
                statusClass = 'sent';
            } else if (msg.status === 'delivered') {
                statusIcon = '✓✓';
                statusClass = 'delivered';
            } else if (msg.status === 'read') {
                statusIcon = '✓✓';
                statusClass = 'read';
            } else {
                statusIcon = '✓';
                statusClass = 'sent';
            }
            
            statusHtml = `<span class="message-status ${statusClass}">${statusIcon}</span>`;
        }
        
        if (msg.type === 'text') {
            // التحقق إذا كان الرابط رابط خريطة
            if (msg.text.includes('maps.google.com') || msg.text.includes('📍')) {
                const url = msg.text.match(/https?:\/\/[^\s]+/g)?.[0] || '';
                messageDiv.innerHTML = `
                    <div class="message-content">
                        <a href="${url}" target="_blank" class="location-link">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>الموقع على الخريطة</span>
                        </a>
                    </div>
                    <div class="message-info">
                        <span class="message-time">${time}</span>
                        ${statusHtml}
                    </div>
                `;
            } else {
                messageDiv.innerHTML = `
                    <div class="message-content">${this.escapeHtml(msg.text)}</div>
                    <div class="message-info">
                        <span class="message-time">${time}</span>
                        ${statusHtml}
                    </div>
                `;
            }
        } else if (msg.type === 'image') {
            messageDiv.innerHTML = `
                <div class="message-content">
                    <img src="${msg.data}" class="message-image" onclick="openImageViewer('${msg.data}')">
                </div>
                <div class="message-info">
                    <span class="message-time">${time}</span>
                    ${statusHtml}
                </div>
            `;
        } else if (msg.type === 'voice') {
            messageDiv.innerHTML = `
                <div class="message-content">
                    <audio controls src="${msg.data}" class="message-audio" onplay="pauseOtherAudio(this)"></audio>
                </div>
                <div class="message-info">
                    <span class="message-time">${time}</span>
                    ${statusHtml}
                </div>
            `;
        }
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    },
    
    // إرسال رسالة مع حالة
    async sendMessage(text) {
        if (!this.currentChat || !text.trim()) return false;
        
        // التحقق من الحظر
        if (this.blockedUsers.includes(this.currentChat)) {
            alert('لا يمكنك إرسال رسالة إلى مستخدم محظور');
            return false;
        }
        
        const messageId = Date.now().toString();
        const message = {
            id: messageId,
            type: 'text',
            text: text,
            sender: 'me',
            time: new Date().toISOString(),
            status: 'sending'
        };
        
        // عرض الرسالة فوراً
        this.displayMessage(message);
        
        // حفظ في localStorage
        this.saveMessage(this.currentChat, message);
        
        // محاولة الإرسال عبر Firebase
        try {
            const docRef = await window.db.collection('temp_messages').add({
                to: this.currentChat,
                from: window.auth.currentUser.uid,
                message: message,
                timestamp: new Date(),
                delivered: false,
                read: false,
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            });
            
            // تحديث حالة الرسالة إلى "مرسلة"
            this.updateMessageStatus(messageId, 'sent');
            
            // مراقبة وصول الرسالة
            this.waitForDelivery(messageId, docRef.id);
            
        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
            this.updateMessageStatus(messageId, 'error');
        }
        
        return true;
    },
    
    // إرسال صورة مع حالة
    async sendImage(file) {
        if (this.blockedUsers.includes(this.currentChat)) {
            alert('لا يمكنك إرسال صورة إلى مستخدم محظور');
            return;
        }
        
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const messageId = Date.now().toString();
                const message = {
                    id: messageId,
                    type: 'image',
                    data: e.target.result,
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
                        delivered: false,
                        read: false,
                        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    });
                    
                    this.updateMessageStatus(messageId, 'sent');
                    this.waitForDelivery(messageId, docRef.id);
                    
                } catch (error) {
                    console.error('خطأ في إرسال الصورة:', error);
                    this.updateMessageStatus(messageId, 'error');
                }
                resolve();
            };
            reader.readAsDataURL(file);
        });
    },
    
    // إرسال بصمة صوتية مع حالة
    async sendVoiceNote(audioBlob) {
        if (this.blockedUsers.includes(this.currentChat)) {
            alert('لا يمكنك إرسال بصمة صوتية إلى مستخدم محظور');
            return;
        }
        
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const messageId = Date.now().toString();
                const message = {
                    id: messageId,
                    type: 'voice',
                    data: e.target.result,
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
                        delivered: false,
                        read: false,
                        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    });
                    
                    this.updateMessageStatus(messageId, 'sent');
                    this.waitForDelivery(messageId, docRef.id);
                    
                } catch (error) {
                    console.error('خطأ في إرسال البصمة:', error);
                    this.updateMessageStatus(messageId, 'error');
                }
                resolve();
            };
            reader.readAsDataURL(audioBlob);
        });
    },
    
    // تحديث حالة الرسالة
    updateMessageStatus(messageId, status) {
        const messageElement = document.getElementById(`msg-${messageId}`);
        if (!messageElement) return;
        
        const statusElement = messageElement.querySelector('.message-status');
        if (!statusElement) return;
        
        statusElement.className = `message-status ${status}`;
        
        if (status === 'sending') {
            statusElement.innerHTML = '⏳';
        } else if (status === 'sent') {
            statusElement.innerHTML = '✓';
        } else if (status === 'delivered') {
            statusElement.innerHTML = '✓✓';
        } else if (status === 'read') {
            statusElement.innerHTML = '✓✓';
            statusElement.style.color = '#4fc3f7';
        } else if (status === 'error') {
            statusElement.innerHTML = '⚠️';
            statusElement.style.color = '#f44336';
        }
        
        // تحديث في localStorage
        this.updateMessageStatusInStorage(messageId, status);
    },
    
    // تحديث حالة الرسالة في localStorage
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
    
    // انتظار وصول الرسالة
    waitForDelivery(messageId, firebaseDocId) {
        // مراقبة تغييرات حالة الرسالة
        const unsubscribe = window.db.collection('temp_messages')
            .doc(firebaseDocId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data.delivered) {
                        this.updateMessageStatus(messageId, 'delivered');
                    }
                    if (data.read) {
                        this.updateMessageStatus(messageId, 'read');
                        unsubscribe();
                    }
                }
            });
        
        // إذا لم تصل بعد 5 ثواني، اعتبر أنها وصلت
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
        
        // التحقق من الحظر
        if (this.blockedUsers.includes(friendId)) return;
        
        window.db.collection('temp_messages')
            .where('from', '==', friendId)
            .where('to', '==', window.auth.currentUser.uid)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        
                        // تحديث حالة الرسالة إلى "تم التوصيل"
                        if (data.message && data.message.id) {
                            this.updateMessageStatusFromFriend(data.message.id, 'delivered');
                        }
                        
                        const message = { ...data.message, sender: 'friend' };
                        this.saveMessage(friendId, message);
                        
                        if (this.currentChat === friendId) {
                            this.displayMessage(message);
                            
                            // إرسال إشعار بالقراءة
                            setTimeout(() => {
                                this.markAsRead(data.message.id, change.doc.id);
                            }, 1000);
                            
                        } else {
                            this.updateLastMessage(friendId, message.text || '📷 صورة' || '🎤 بصمة');
                            this.showNotification('رسالة جديدة', message.text || 'صورة' || 'بصمة صوتية');
                        }
                        
                        change.doc.ref.delete();
                    }
                });
            });
    },
    
    // تحديث حالة الرسالة من الصديق
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
                
                // تحديث الواجهة
                const msgElement = document.getElementById(`msg-${messageId}`);
                if (msgElement) {
                    const statusElement = msgElement.querySelector('.message-status');
                    if (statusElement) {
                        statusElement.className = `message-status ${status}`;
                        if (status === 'delivered') {
                            statusElement.innerHTML = '✓✓';
                        } else if (status === 'read') {
                            statusElement.innerHTML = '✓✓';
                            statusElement.style.color = '#4fc3f7';
                        }
                    }
                }
            }
        } catch (e) {
            console.error('خطأ في تحديث الحالة:', e);
        }
    },
    
    // تحديد الرسالة كمقروءة
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
    
    async startVideoCall() {
        if (!this.currentChat || !this.peer) return;
        
        // التحقق من الحظر
        if (this.blockedUsers.includes(this.currentChat)) {
            alert('لا يمكنك إجراء مكالمة مع مستخدم محظور');
            return;
        }
        
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            const call = this.peer.call(this.currentChat, this.localStream);
            this.currentCall = call;
            this.showVideoCall(call, this.localStream);
        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول إلى الكاميرا');
        }
    },
    
    async startVoiceCall() {
        if (!this.currentChat || !this.peer) return;
        
        // التحقق من الحظر
        if (this.blockedUsers.includes(this.currentChat)) {
            alert('لا يمكنك إجراء مكالمة مع مستخدم محظور');
            return;
        }
        
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });
            const call = this.peer.call(this.currentChat, this.localStream);
            this.currentCall = call;
            this.showVoiceCall(call, this.localStream);
        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول إلى الميكروفون');
        }
    },
    
    showVideoCall(call, stream) {
        const videoContainer = document.getElementById('videoContainer');
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        
        localVideo.srcObject = stream;
        call.on('stream', (remoteStream) => {
            remoteVideo.srcObject = remoteStream;
        });
        videoContainer.style.display = 'flex';
        
        call.on('close', () => {
            videoContainer.style.display = 'none';
            this.currentCall = null;
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
        });
    },
    
    showVoiceCall(call, stream) {
        const videoContainer = document.getElementById('videoContainer');
        const localVideo = document.getElementById('localVideo');
        localVideo.style.display = 'none';
        videoContainer.style.display = 'flex';
        
        call.on('close', () => {
            videoContainer.style.display = 'none';
            localVideo.style.display = 'block';
            this.currentCall = null;
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
        });
    },
    
    endCall() {
        if (this.currentCall) this.currentCall.close();
        document.getElementById('videoContainer').style.display = 'none';
        document.getElementById('localVideo').style.display = 'block';
    },
    
    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const btn = document.querySelector('.call-controls button:nth-child(2) i');
                if (btn) btn.className = audioTrack.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
            }
        }
    },
    
    toggleCamera() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const btn = document.querySelector('.call-controls button:nth-child(3) i');
                if (btn) btn.className = videoTrack.enabled ? 'fas fa-video' : 'fas fa-video-slash';
            }
        }
    },
    
    // إغلاق المحادثة
    closeChat() {
        if (this.currentCall) this.endCall();
        
        // إزالة كلاس الـ body
        document.body.classList.remove('conversation-open');
        
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        this.currentChat = null;
        this.currentFriendData = null;
    },
    
    // حظر مستخدم
    async blockUser(userId) {
        if (!window.auth?.currentUser) return;
        
        if (!confirm('هل أنت متأكد من حظر هذا المستخدم؟')) return;
        
        try {
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                blocked: firebase.firestore.FieldValue.arrayUnion(userId)
            });
            
            this.blockedUsers.push(userId);
            
            // إذا كان هذا المستخدم هو المحادثة الحالية، أغلقها
            if (this.currentChat === userId) {
                this.closeChat();
            }
            
            alert('تم حظر المستخدم بنجاح');
            
        } catch (error) {
            console.error('خطأ في حظر المستخدم:', error);
            alert('حدث خطأ في حظر المستخدم');
        }
    },
    
    // إلغاء حظر مستخدم
    async unblockUser(userId) {
        if (!window.auth?.currentUser) return;
        
        try {
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                blocked: firebase.firestore.FieldValue.arrayRemove(userId)
            });
            
            this.blockedUsers = this.blockedUsers.filter(id => id !== userId);
            
            alert('تم إلغاء حظر المستخدم بنجاح');
            
        } catch (error) {
            console.error('خطأ في إلغاء الحظر:', error);
            alert('حدث خطأ في إلغاء الحظر');
        }
    },
    
    // مسح المحادثة
    clearChat(friendId) {
        const confirmDiv = document.querySelector('.clear-chat-confirm');
        if (confirmDiv) {
            confirmDiv.classList.add('active');
            
            const confirmBtn = confirmDiv.querySelector('.confirm');
            const cancelBtn = confirmDiv.querySelector('.cancel');
            
            const handleConfirm = () => {
                const key = `chat_${friendId}`;
                localStorage.removeItem(key);
                this.messages[friendId] = [];
                
                if (this.currentChat === friendId) {
                    document.getElementById('messagesContainer').innerHTML = '';
                }
                
                confirmDiv.classList.remove('active');
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                
                alert('تم مسح المحادثة بنجاح');
            };
            
            const handleCancel = () => {
                confirmDiv.classList.remove('active');
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
            };
            
            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
        }
    },
    
    // عرض معلومات الاتصال
    async showContactInfo() {
        if (!this.currentFriendData) return;
        
        const contactPage = document.getElementById('contactInfoPage');
        if (!contactPage) return;
        
        // تحديث المعلومات
        const avatar = contactPage.querySelector('.avatar-emoji');
        const name = contactPage.querySelector('h2');
        const id = contactPage.querySelector('.contact-id');
        const status = contactPage.querySelector('.contact-status .value');
        
        if (avatar) avatar.textContent = this.currentFriendData.avatarEmoji || '👤';
        if (name) name.textContent = this.currentFriendData.name || 'مستخدم';
        if (id) id.textContent = this.currentFriendData.shareableId || '0000000000';
        
        // حالة الاتصال
        const statusElement = contactPage.querySelector('.contact-status .value');
        if (statusElement) {
            const isOnline = this.checkFriendStatus(this.currentChat);
            statusElement.textContent = isOnline ? 'متصل' : 'غير متصل';
            statusElement.className = `value ${isOnline ? 'online' : 'offline'}`;
        }
        
        // أزرار الإجراءات
        const blockBtn = contactPage.querySelector('.block-btn');
        if (blockBtn) {
            const isBlocked = this.blockedUsers.includes(this.currentChat);
            blockBtn.textContent = isBlocked ? 'إلغاء الحظر' : 'حظر';
            blockBtn.className = isBlocked ? 'unblock-btn' : 'block-btn';
            
            blockBtn.onclick = () => {
                if (isBlocked) {
                    this.unblockUser(this.currentChat);
                } else {
                    this.blockUser(this.currentChat);
                }
                contactPage.classList.remove('active');
            };
        }
        
        const clearChatBtn = contactPage.querySelector('.clear-chat-btn');
        if (clearChatBtn) {
            clearChatBtn.onclick = () => {
                this.clearChat(this.currentChat);
                contactPage.classList.remove('active');
            };
        }
        
        contactPage.classList.add('active');
    },
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

ChatSystem.init();

// ========== تحميل قائمة المحادثات ==========

async function loadChats() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;
    
    try {
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (!userDoc.exists) return;
        
        const userData = userDoc.data();
        const friends = userData.friends || [];
        const blocked = userData.blocked || [];
        
        if (friends.length === 0) {
            chatsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <h3>لا توجد محادثات</h3>
                    <p>أضف أصدقاء لبدء المحادثة</p>
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
                    
                    // إذا كان محظوراً، أضف علامة
                    const isBlocked = blocked.includes(friendId);
                    const blockedClass = isBlocked ? 'blocked' : '';
                    
                    const avatarEmoji = window.getEmojiForUser(friend);
                    
                    const key = `chat_${friendId}`;
                    let lastMessage = 'اضغط لبدء المحادثة';
                    let lastTime = '';
                    let unreadCount = 0;
                    
                    try {
                        const history = JSON.parse(localStorage.getItem(key)) || [];
                        if (history.length > 0) {
                            const last = history[history.length - 1];
                            if (last.type === 'text') lastMessage = last.text;
                            else if (last.type === 'image') lastMessage = '📷 صورة';
                            else if (last.type === 'voice') lastMessage = '🎤 بصمة';
                            lastTime = new Date(last.time).toLocaleTimeString('ar-EG', {
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            
                            // حساب الرسائل غير المقروءة
                            unreadCount = history.filter(msg => 
                                msg.sender === 'friend' && msg.status !== 'read'
                            ).length;
                        }
                    } catch (e) {}
                    
                    const unreadBadge = unreadCount > 0 ? 
                        `<span class="unread-badge">${unreadCount}</span>` : '';
                    
                    const blockedBadge = isBlocked ? 
                        `<span class="blocked-badge"><i class="fas fa-ban"></i> محظور</span>` : '';
                    
                    html += `
                        <div class="chat-item ${blockedClass}" onclick="${!isBlocked ? `openChat('${friendId}')` : 'alert(\'لا يمكن فتح محادثة مع مستخدم محظور\')'}">
                            <div class="chat-avatar-emoji">${avatarEmoji}</div>
                            <div class="chat-info">
                                <h4>${friend.name || 'مستخدم'}</h4>
                                <p class="last-message">${blockedBadge || lastMessage}</p>
                            </div>
                            <div class="chat-meta">
                                ${!isBlocked ? `<span class="chat-time">${lastTime || ''}</span>` : ''}
                                ${!isBlocked ? unreadBadge : ''}
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

// ========== تحميل قائمة المحظورين ==========

async function loadBlockedUsers() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const blockedList = document.getElementById('blockedUsersList');
    if (!blockedList) return;
    
    try {
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (!userDoc.exists) return;
        
        const blockedIds = userDoc.data().blocked || [];
        
        if (blockedIds.length === 0) {
            blockedList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-ban"></i>
                    <h3>لا يوجد محظورين</h3>
                    <p>لم تقم بحظر أي مستخدم بعد</p>
                </div>
            `;
            return;
        }
        
        let html = '<div class="blocked-users-list">';
        
        for (const userId of blockedIds) {
            try {
                const userDoc = await window.db.collection('users').doc(userId).get();
                if (userDoc.exists) {
                    const user = userDoc.data();
                    const avatarEmoji = window.getEmojiForUser(user);
                    
                    html += `
                        <div class="blocked-user-item">
                            <div class="user-avatar-emoji">${avatarEmoji}</div>
                            <div class="blocked-user-info">
                                <h4>${user.name || 'مستخدم'}</h4>
                                <p>${user.shareableId || ''}</p>
                            </div>
                            <button class="unblock-btn" onclick="unblockUser('${userId}')">
                                <i class="fas fa-ban"></i> إلغاء الحظر
                            </button>
                        </div>
                    `;
                }
            } catch (e) {
                console.error('Error loading blocked user:', e);
            }
        }
        
        html += '</div>';
        blockedList.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading blocked users:', error);
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

let mediaRecorder = null;
let recordingChunks = [];

window.sendVoiceNote = function() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            recordingChunks = [];
            
            mediaRecorder.ondataavailable = e => recordingChunks.push(e.data);
            
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordingChunks, { type: 'audio/webm' });
                ChatSystem.sendVoiceNote(blob);
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            
            // إظهار مؤشر التسجيل
            const inputWrapper = document.querySelector('.message-input-wrapper');
            const recordingIndicator = document.createElement('div');
            recordingIndicator.className = 'recording-indicator';
            recordingIndicator.innerHTML = `
                <i class="fas fa-microphone"></i>
                <span class="recording-timer">00:00</span>
                <div class="recording-controls">
                    <button class="recording-cancel" onclick="cancelRecording()">
                        <i class="fas fa-times"></i>
                    </button>
                    <button class="recording-send" onclick="stopRecording()">
                        <i class="fas fa-check"></i>
                    </button>
                </div>
            `;
            
            inputWrapper.style.display = 'none';
            inputWrapper.parentNode.insertBefore(recordingIndicator, inputWrapper.nextSibling);
            
            // تحديث التايمر
            let seconds = 0;
            const timer = setInterval(() => {
                seconds++;
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                recordingIndicator.querySelector('.recording-timer').textContent = 
                    `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }, 1000);
            
            // حفظ المراجع للإلغاء
            window.currentRecording = {
                mediaRecorder,
                timer,
                indicator: recordingIndicator,
                inputWrapper
            };
        });
    
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.cancelRecording = function() {
    if (window.currentRecording) {
        window.currentRecording.mediaRecorder.stop();
        clearInterval(window.currentRecording.timer);
        window.currentRecording.indicator.remove();
        window.currentRecording.inputWrapper.style.display = 'flex';
        window.currentRecording = null;
    }
};

window.stopRecording = function() {
    if (window.currentRecording) {
        window.currentRecording.mediaRecorder.stop();
        clearInterval(window.currentRecording.timer);
        window.currentRecording.indicator.remove();
        window.currentRecording.inputWrapper.style.display = 'flex';
        window.currentRecording = null;
    }
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

window.toggleVoiceCall = function() {
    if (ChatSystem.currentCall) ChatSystem.endCall();
    else ChatSystem.startVoiceCall();
};

window.toggleVideoCall = function() {
    if (ChatSystem.currentCall) ChatSystem.endCall();
    else ChatSystem.startVideoCall();
};

window.endCall = function() { ChatSystem.endCall(); };
window.toggleMute = function() { ChatSystem.toggleMute(); };
window.toggleCamera = function() { ChatSystem.toggleCamera(); };
window.closeConversation = function() { ChatSystem.closeChat(); };

window.viewContactInfo = function() {
    ChatSystem.showContactInfo();
};

window.showMoreOptions = function() {
    const menu = document.getElementById('moreOptionsMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
};

window.closeContactInfo = function() {
    document.getElementById('contactInfoPage').classList.remove('active');
};

window.blockUser = function(userId) {
    ChatSystem.blockUser(userId);
};

window.unblockUser = function(userId) {
    ChatSystem.unblockUser(userId).then(() => {
        loadBlockedUsers();
        loadChats();
    });
};

window.clearChat = function() {
    if (ChatSystem.currentChat) {
        ChatSystem.clearChat(ChatSystem.currentChat);
    }
};

// نافذة عرض الصور
window.openImageViewer = function(imageSrc) {
    const viewer = document.getElementById('imageViewer');
    const img = viewer.querySelector('img');
    img.src = imageSrc;
    viewer.classList.add('active');
};

window.closeImageViewer = function() {
    document.getElementById('imageViewer').classList.remove('active');
};

window.downloadImage = function() {
    const img = document.querySelector('#imageViewer img');
    const a = document.createElement('a');
    a.href = img.src;
    a.download = 'image.jpg';
    a.click();
};

// إيقاف البصمات المتعددة
window.pauseOtherAudio = function(currentAudio) {
    document.querySelectorAll('audio').forEach(audio => {
        if (audio !== currentAudio && !audio.paused) {
            audio.pause();
        }
    });
};

// ========== باقي الدوال (بدون تغيير) ==========

window.openEditProfileModal = function() {
    const currentName = document.getElementById('profileName').textContent;
    const currentNameInput = document.getElementById('editName');
    if (currentNameInput) currentNameInput.value = currentName;
    
    const currentEmoji = document.getElementById('profileAvatarEmoji').textContent;
    const currentAvatarEmoji = document.getElementById('currentAvatarEmoji');
    if (currentAvatarEmoji) currentAvatarEmoji.textContent = currentEmoji;
    
    document.getElementById('editProfileModal').classList.add('active');
};

window.saveProfile = function() {
    const newName = document.getElementById('editName').value.trim();
    if (!newName) { alert('الرجاء إدخال الاسم'); return; }
    if (newName.length > 25) { alert('الاسم يجب أن لا يتجاوز 25 حرف'); return; }
    
    if (auth && auth.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({
            name: newName
        }).then(() => {
            document.getElementById('profileName').textContent = newName;
            document.getElementById('menuName').textContent = newName;
            closeModal();
            alert('تم حفظ التغييرات');
        }).catch(error => {
            console.error('Error saving profile:', error);
            alert('حدث خطأ في الحفظ');
        });
    }
};

window.showUserTrips = function() {
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('tripsPage').style.display = 'block';
    loadUserTrips();
};

async function loadUserTrips() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const tripsGrid = document.getElementById('tripsGrid');
    if (!tripsGrid) return;
    
    try {
        const snapshot = await window.db.collection('trips')
            .where('userId', '==', window.auth.currentUser.uid)
            .orderBy('startTime', 'desc')
            .get();
        
        if (snapshot.empty) {
            tripsGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-map-marked-alt"></i>
                    <h3>${i18n ? i18n.t('no_trips') : 'لا توجد رحلات'}</h3>
                    <p>${i18n ? i18n.t('no_trips_desc') : 'لم تقم بأي رحلة بعد'}</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const trip = doc.data();
            const startTime = trip.startTime ? new Date(trip.startTime.seconds * 1000) : new Date();
            html += `
                <div class="trip-item" onclick="viewTripDetails('${doc.id}')">
                    <div class="trip-date">${startTime.toLocaleDateString('ar-EG')}</div>
                    <div class="trip-route">${trip.destination || 'رحلة'}</div>
                    <div class="trip-stats">
                        <span>⏱️ ${trip.duration || '--'}</span>
                    </div>
                </div>
            `;
        });
        tripsGrid.innerHTML = html;
        updateTripsCount();
        
    } catch (error) {
        console.error('Error loading trips:', error);
        tripsGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ في تحميل الرحلات</h3>
            </div>
        `;
    }
}

window.viewTripDetails = function(tripId) {
    alert('تفاصيل الرحلة - معرف: ' + tripId);
};

window.goBack = function() {
    document.querySelectorAll('.profile-subpage').forEach(page => page.style.display = 'none');
    document.querySelector('.profile-page').style.display = 'block';
    document.querySelector('.profile-page').classList.add('active');
    document.querySelectorAll('.page').forEach(page => {
        if (!page.classList.contains('profile-page')) {
            page.style.display = 'none';
            page.classList.remove('active');
        }
    });
};

window.selectAvatar = function(type) {
    const emojiMap = {
        'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧',
        'father': '👨‍🦳', 'mother': '👩‍🦳', 'grandfather': '👴', 'grandmother': '👵'
    };
    const selectedEmoji = emojiMap[type] || '👤';
    
    const profileAvatar = document.getElementById('profileAvatarEmoji');
    if (profileAvatar) profileAvatar.textContent = selectedEmoji;
    const currentAvatar = document.getElementById('currentAvatarEmoji');
    if (currentAvatar) currentAvatar.textContent = selectedEmoji;
    const menuAvatar = document.getElementById('menuAvatarEmoji');
    if (menuAvatar) menuAvatar.textContent = selectedEmoji;
    
    if (auth && auth.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({ avatarType: type })
            .catch(error => console.error('Error updating avatar:', error));
    }
    closeModal();
};

window.openAvatarModal = function() {
    const modal = document.getElementById('avatarModal');
    if (modal) modal.classList.add('active');
};

document.addEventListener('languageChanged', function() {
    console.log('Language changed');
    if (document.querySelector('.chat-page').style.display === 'block') loadChats();
});

window.getEmojiForUser = function(userData) {
    const emojiMap = {
        'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧',
        'father': '👨‍🦳', 'mother': '👩‍🦳', 'grandfather': '👴', 'grandmother': '👵'
    };
    return emojiMap[userData?.avatarType] || '👤';
};

window.clearMessages = function() {
    const container = document.getElementById('messagesContainer');
    if (container) container.innerHTML = '';
};

window.showNotification = function(title, message) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body: message });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') new Notification(title, { body: message });
        });
    }
};

if ('Notification' in window) Notification.requestPermission();

console.log('✅ app.js محدث - نظام متكامل مثل واتساب مع جميع الميزات');
