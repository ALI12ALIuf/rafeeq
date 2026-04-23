// ========== نظام التشفير E2EE + ضغط + حذف 24 ساعة ==========
const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    
    async init() {
        if (window.auth?.currentUser) {
            await this.setupKeys();
            this.startReceiving();
            console.log('✅ نظام التشفير E2EE جاهز');
        }
    },
    
    async setupKeys() {
        const existingKey = localStorage.getItem('enc_private_key');
        if (!existingKey) {
            const keyPair = await this.generateKeyPair();
            const publicKey = await this.exportPublicKey(keyPair.publicKey);
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({ publicKey });
            const privateExport = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
            localStorage.setItem('enc_private_key', btoa(String.fromCharCode(...new Uint8Array(privateExport))));
        }
    },
    
    async generateKeyPair() {
        return await window.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    },
    
    async exportPublicKey(key) {
        const raw = await window.crypto.subtle.exportKey('raw', key);
        return btoa(String.fromCharCode(...new Uint8Array(raw)));
    },
    
    async importPublicKey(base64Key) {
        const binary = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
        return await window.crypto.subtle.importKey('raw', binary, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    },
    
    async getMyPrivateKey() {
        const stored = localStorage.getItem('enc_private_key');
        if (!stored) return null;
        const binary = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
        return await window.crypto.subtle.importKey('pkcs8', binary, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
    },
    
    async getReceiverPublicKey(userId) {
        const doc = await window.db.collection('users').doc(userId).get();
        if (!doc.exists || !doc.data().publicKey) return null;
        return await this.importPublicKey(doc.data().publicKey);
    },
    
    async deriveSharedKey(privateKey, publicKey) {
        return await window.crypto.subtle.deriveKey({ name: 'ECDH', public: publicKey }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    },
    
    async encryptData(data, sharedKey) {
        const encoder = new TextEncoder();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('rafeeq-secure') }, sharedKey, typeof data === 'string' ? encoder.encode(data) : data);
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    },
    
    async decryptData(encryptedBase64, sharedKey) {
        const encoder = new TextEncoder();
        const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('rafeeq-secure') }, sharedKey, data);
        return new TextDecoder().decode(decrypted);
    },
    
    async compressImage(file) {
        return new Promise(resolve => {
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            img.onload = () => {
                let w = img.width, h = img.height;
                if (w > 1200 || h > 1200) {
                    if (w > h) { h *= 1200 / w; w = 1200; }
                    else { w *= 1200 / h; h = 1200; }
                }
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(resolve, 'image/jpeg', 0.8);
            };
            img.src = URL.createObjectURL(file);
        });
    },
    
    fileToBase64(blob) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    },
    
    async sendToServer(receiverId, encryptedPackage) {
        await window.db.collection('secure_messages').add({
            to: receiverId,
            from: window.auth.currentUser.uid,
            package: encryptedPackage,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + this.MESSAGE_EXPIRY_HOURS * 3600000))
        });
    },
    
    startReceiving() {
        if (!window.auth?.currentUser) return;
        window.db.collection('secure_messages').where('to', '==', window.auth.currentUser.uid).onSnapshot(async snapshot => {
            for (const change of snapshot.docChanges()) {
                if (change.type === 'added') {
                    const msg = { id: change.doc.id, ...change.doc.data() };
                    await this.processReceivedMessage(msg);
                    await change.doc.ref.delete();
                }
            }
        });
    },
    
    async processReceivedMessage(msg) {
        try {
            const myPrivateKey = await this.getMyPrivateKey();
            const senderPublicKey = await this.getReceiverPublicKey(msg.from);
            if (!myPrivateKey || !senderPublicKey) return;
            const sharedKey = await this.deriveSharedKey(myPrivateKey, senderPublicKey);
            
            if (msg.package.type === 'text') {
                const decrypted = await this.decryptData(msg.package.data, sharedKey);
                const messageObj = { id: msg.package.id, type: 'text', text: decrypted, sender: 'friend', time: new Date().toISOString() };
                ChatSystem.saveMessage(msg.from, messageObj);
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessage(messageObj);
                ChatSystem.updateLastMessage(msg.from, decrypted);
            } else if (msg.package.type === 'image') {
                const decrypted = await this.decryptData(msg.package.data, sharedKey);
                const messageObj = { id: msg.package.id, type: 'image', data: decrypted, sender: 'friend', time: new Date().toISOString() };
                ChatSystem.saveMessage(msg.from, messageObj);
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessage(messageObj);
                ChatSystem.updateLastMessage(msg.from, '📷 صورة');
            }
            loadChats();
        } catch (error) {
            console.error('فشل معالجة الرسالة:', error);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('App loaded, setting up navigation...');
    ensureSinglePage();
    setupNavigation();
    setupModals();
    loadChats();
    setupChatListeners();
    updateTripsCount();
    SecureChatSystem.init();
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
        
        const conversationPage = document.getElementById('conversationPage');
        if (conversationPage) {
            conversationPage.style.display = 'none';
            document.body.classList.remove('conversation-open');
        }
        
        navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageId));
    }
    
    navItems.forEach(item => item.addEventListener('click', () => switchPage(item.dataset.page)));
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

// ========== نظام الدردشة المتكامل (مثل واتساب) ==========

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
        
        setTimeout(() => {
            const input = document.getElementById('messageInput');
            if (input) input.focus();
        }, 300);
        
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            if (container) container.scrollTop = container.scrollHeight;
        }, 100);
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
            let statusIcon = '✓';
            let statusClass = 'sent';
            if (msg.status === 'sending') { statusIcon = '⏳'; statusClass = 'sending'; }
            else if (msg.status === 'delivered') { statusIcon = '✓✓'; statusClass = 'delivered'; }
            else if (msg.status === 'read') { statusIcon = '✓✓'; statusClass = 'read'; }
            statusHtml = `<span class="message-status ${statusClass}">${statusIcon}</span>`;
        }
        
        if (msg.type === 'text') {
            messageDiv.innerHTML = `
                <div class="message-content">${this.escapeHtml(msg.text)}</div>
                <div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>
            `;
        } else if (msg.type === 'image') {
            messageDiv.innerHTML = `
                <img src="${msg.data}" class="message-image" onclick="window.open('${msg.data}')">
                <div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>
            `;
        } else if (msg.type === 'voice') {
            messageDiv.innerHTML = `
                <audio controls src="${msg.data}" class="message-audio"></audio>
                <div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>
            `;
        }
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    },
    
    // ========== دالة الإرسال المشفر ==========
    async sendMessage(text) {
        if (!this.currentChat || !text.trim()) return false;
        
        const messageId = Date.now().toString();
        
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            
            if (!myPrivateKey || !receiverPublicKey) {
                console.error('المفاتيح غير متوفرة');
                return false;
            }
            
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(text, sharedKey);
            
            const encryptedPackage = { id: messageId, type: 'text', data: encrypted, timestamp: Date.now() };
            await SecureChatSystem.sendToServer(this.currentChat, encryptedPackage);
            
            const message = { id: messageId, type: 'text', text: text, sender: 'me', time: new Date().toISOString(), status: 'sent' };
            this.saveMessage(this.currentChat, message);
            this.displayMessage(message);
            
            return true;
        } catch (error) {
            console.error('فشل التشفير/الإرسال:', error);
            const message = { id: messageId, type: 'text', text: text, sender: 'me', time: new Date().toISOString(), status: 'error' };
            this.saveMessage(this.currentChat, message);
            this.displayMessage(message);
            return false;
        }
    },
    
    // ========== دالة إرسال الصورة المشفرة ==========
    async sendImage(file) {
        if (!this.currentChat) return;
        
        const messageId = Date.now().toString();
        
        try {
            const compressed = await SecureChatSystem.compressImage(file);
            const base64 = await SecureChatSystem.fileToBase64(compressed);
            
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            
            if (!myPrivateKey || !receiverPublicKey) return;
            
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(base64, sharedKey);
            
            const encryptedPackage = { id: messageId, type: 'image', data: encrypted, timestamp: Date.now() };
            await SecureChatSystem.sendToServer(this.currentChat, encryptedPackage);
            
            const message = { id: messageId, type: 'image', data: base64, sender: 'me', time: new Date().toISOString(), status: 'sent' };
            this.saveMessage(this.currentChat, message);
            this.displayMessage(message);
            
        } catch (error) {
            console.error('فشل إرسال الصورة:', error);
        }
    },
    
    async sendVoiceNote(audioBlob) {
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
    
    updateMessageStatus(messageId, status) {
        const messageElement = document.getElementById(`msg-${messageId}`);
        if (!messageElement) return;
        
        const statusElement = messageElement.querySelector('.message-status');
        if (!statusElement) return;
        
        statusElement.className = `message-status ${status}`;
        
        if (status === 'sending') statusElement.innerHTML = '⏳';
        else if (status === 'sent') statusElement.innerHTML = '✓';
        else if (status === 'delivered') statusElement.innerHTML = '✓✓';
        else if (status === 'read') { statusElement.innerHTML = '✓✓'; statusElement.style.color = '#4fc3f7'; }
        else if (status === 'error') { statusElement.innerHTML = '⚠️'; statusElement.style.color = '#f44336'; }
        
        this.updateMessageStatusInStorage(messageId, status);
    },
    
    updateMessageStatusInStorage(messageId, status) {
        const key = `chat_${this.currentChat}`;
        try {
            let history = JSON.parse(localStorage.getItem(key)) || [];
            history = history.map(msg => {
                if (msg.id === messageId) return { ...msg, status: status };
                return msg;
            });
            localStorage.setItem(key, JSON.stringify(history));
            this.messages[this.currentChat] = history;
        } catch (e) {
            console.error('خطأ في تحديث الحالة:', e);
        }
    },
    
    waitForDelivery(messageId, firebaseDocId) {
        const unsubscribe = window.db.collection('temp_messages').doc(firebaseDocId).onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (data.delivered) this.updateMessageStatus(messageId, 'delivered');
                if (data.read) { this.updateMessageStatus(messageId, 'read'); unsubscribe(); }
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
        // تم التعطيل - النظام الجديد يستخدم SecureChatSystem.startReceiving()
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
                        if (status === 'delivered') statusElement.innerHTML = '✓✓';
                        else if (status === 'read') { statusElement.innerHTML = '✓✓'; statusElement.style.color = '#4fc3f7'; }
                    }
                }
            }
        } catch (e) {
            console.error('خطأ في تحديث الحالة:', e);
        }
    },
    
    async markAsRead(messageId, firebaseDocId) {
        try {
            await window.db.collection('temp_messages').doc(firebaseDocId).update({ read: true, readAt: new Date() });
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
                            unreadCount = history.filter(msg => msg.sender === 'friend' && msg.status !== 'read').length;
                        }
                    } catch (e) {}
                    
                    const unreadBadge = unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : '';
                    
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
}

// ========== دوال عامة للواجهة ==========

window.openChat = function(friendId) {
    window.db.collection('users').doc(friendId).get().then((doc) => {
        if (doc.exists) {
            const friend = doc.data();
            const avatarEmoji = window.getEmojiForUser ? window.getEmojiForUser(friend) : '👤';
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
    if (picker.querySelector('.emoji-grid').children.length === 0) loadEmojis();
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
        db.collection('users').doc(auth.currentUser.uid).update({ name: newName }).then(() => {
            document.getElementById('profileName').textContent = newName;
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
        const snapshot = await window.db.collection('trips').where('userId', '==', window.auth.currentUser.uid).orderBy('startTime', 'desc').get();
        if (snapshot.empty) {
            tripsGrid.innerHTML = `<div class="empty-state"><i class="fas fa-map-marked-alt"></i><h3>${i18n ? i18n.t('no_trips') : 'لا توجد رحلات'}</h3><p>${i18n ? i18n.t('no_trips_desc') : 'لم تقم بأي رحلة بعد'}</p></div>`;
            return;
        }
        let html = '';
        snapshot.forEach(doc => {
            const trip = doc.data();
            const startTime = trip.startTime ? new Date(trip.startTime.seconds * 1000) : new Date();
            html += `<div class="trip-item" onclick="viewTripDetails('${doc.id}')"><div class="trip-date">${startTime.toLocaleDateString('ar-EG')}</div><div class="trip-route">${trip.destination || 'رحلة'}</div><div class="trip-stats"><span>⏱️ ${trip.duration || '--'}</span></div></div>`;
        });
        tripsGrid.innerHTML = html;
        updateTripsCount();
    } catch (error) {
        console.error('Error loading trips:', error);
        tripsGrid.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>خطأ في تحميل الرحلات</h3></div>`;
    }
}

window.viewTripDetails = function(tripId) { alert('تفاصيل الرحلة - معرف: ' + tripId); };

window.goBack = function() {
    document.querySelectorAll('.profile-subpage').forEach(page => page.style.display = 'none');
    document.querySelector('.profile-page').style.display = 'block';
    document.querySelector('.profile-page').classList.add('active');
    document.querySelectorAll('.page').forEach(page => {
        if (!page.classList.contains('profile-page')) { page.style.display = 'none'; page.classList.remove('active'); }
    });
};

window.selectAvatar = function(type) {
    const emojiMap = { 'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧', 'father': '👨‍🦳', 'mother': '👩‍🦳', 'grandfather': '👴', 'grandmother': '👵' };
    const selectedEmoji = emojiMap[type] || '👤';
    const profileAvatar = document.getElementById('profileAvatarEmoji');
    if (profileAvatar) profileAvatar.textContent = selectedEmoji;
    const currentAvatar = document.getElementById('currentAvatarEmoji');
    if (currentAvatar) currentAvatar.textContent = selectedEmoji;
    if (auth && auth.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({ avatarType: type }).catch(error => console.error('Error updating avatar:', error));
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
    const emojiMap = { 'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧', 'father': '👨‍🦳', 'mother': '👩‍🦳', 'grandfather': '👴', 'grandmother': '👵' };
    return emojiMap[userData?.avatarType] || '👤';
};

window.clearMessages = function() {
    const container = document.getElementById('messagesContainer');
    if (container) container.innerHTML = '';
};

window.showNotification = function(title, message) {
    if (Notification.permission === 'granted') new Notification(title, { body: message });
    else if (Notification.permission !== 'denied') Notification.requestPermission().then(permission => { if (permission === 'granted') new Notification(title, { body: message }); });
};

if ('Notification' in window) Notification.requestPermission();

console.log('✅ app.js محدث - E2EE + ضغط + حذف 24 ساعة');
