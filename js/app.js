// ========== نظام التشفير E2EE + ضغط + حذف 24 ساعة ==========
const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    
    async init() {
        if (!window.auth?.currentUser) {
            console.warn('⚠️ لا يوجد مستخدم مسجل، تأجيل تهيئة التشفير');
            return false;
        }
        try {
            await this.setupKeys();
            this.startReceiving();
            console.log('✅ نظام التشفير E2EE جاهز');
            return true;
        } catch (error) { console.error('❌ فشل تهيئة التشفير:', error); return false; }
    },
    
    async setupKeys() {
        const existingKey = localStorage.getItem('enc_private_key');
        if (!existingKey) {
            console.log('🔨 توليد مفاتيح تشفير جديدة...');
            const keyPair = await this.generateKeyPair();
            const publicKey = await this.exportPublicKey(keyPair.publicKey);
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({ publicKey });
            const privateExport = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
            localStorage.setItem('enc_private_key', btoa(String.fromCharCode(...new Uint8Array(privateExport))));
            console.log('✅ المفاتيح جاهزة');
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
        combined.set(iv); combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    },
    
    async decryptData(encryptedBase64, sharedKey) {
        const encoder = new TextEncoder();
        const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12); const data = combined.slice(12);
        const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('rafeeq-secure') }, sharedKey, data);
        return new TextDecoder().decode(decrypted);
    },
    
    // ضغط الصور
    async compressImage(file) {
        return new Promise(resolve => {
            const img = new Image(); const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            img.onload = () => {
                let w = img.width, h = img.height;
                if (w > 1200 || h > 1200) { if (w > h) { h *= 1200 / w; w = 1200; } else { w *= 1200 / h; h = 1200; } }
                canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(resolve, 'image/jpeg', 0.8);
            };
            img.src = URL.createObjectURL(file);
        });
    },
    
    // ضغط الفيديو
    async compressVideo(file) {
        console.log(`🎥 ضغط الفيديو: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
        return new Promise((resolve) => {
            const video = document.createElement('video');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                URL.revokeObjectURL(video.src);
                let width = video.videoWidth, height = video.videoHeight;
                if (height > 480) { width *= 480 / height; height = 480; }
                canvas.width = Math.round(width); canvas.height = Math.round(height);
                const stream = canvas.captureStream(30);
                const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 300000 });
                const chunks = [];
                mediaRecorder.ondataavailable = e => chunks.push(e.data);
                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    console.log(`✅ بعد الضغط: ${(blob.size / 1024 / 1024).toFixed(1)}MB`);
                    resolve(blob);
                };
                video.currentTime = 0; video.play(); mediaRecorder.start();
                setTimeout(() => { mediaRecorder.stop(); video.pause(); }, Math.min(video.duration * 1000, 60000));
            };
            video.src = URL.createObjectURL(file);
        });
    },
    
    fileToBase64(blob) {
        return new Promise(resolve => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob); });
    },
    
    async sendToServer(receiverId, encryptedPackage) {
        await window.db.collection('secure_messages').add({
            to: receiverId, from: window.auth.currentUser.uid, package: encryptedPackage,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + this.MESSAGE_EXPIRY_HOURS * 3600000))
        });
    },
    
    startReceiving() {
        if (!window.auth?.currentUser) return;
        window.db.collection('secure_messages').where('to', '==', window.auth.currentUser.uid).onSnapshot(async snapshot => {
            for (const change of snapshot.docChanges()) {
                if (change.type === 'added') { const msg = { id: change.doc.id, ...change.doc.data() }; await this.processReceivedMessage(msg); await change.doc.ref.delete(); }
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
                ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'text', text: decrypted, sender: 'friend', time: new Date().toISOString() });
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                ChatSystem.updateLastMessage(msg.from, decrypted);
            } else if (msg.package.type === 'voice') {
                const decrypted = await this.decryptData(msg.package.data, sharedKey);
                ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'voice', data: decrypted, sender: 'friend', time: new Date().toISOString() });
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                ChatSystem.updateLastMessage(msg.from, '🎤 بصمة');
            } else if (msg.package.type === 'image') {
                const decrypted = await this.decryptData(msg.package.data, sharedKey);
                ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'image', data: decrypted, sender: 'friend', time: new Date().toISOString() });
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                ChatSystem.updateLastMessage(msg.from, '📷 صورة');
            } else if (msg.package.type === 'video') {
                const decrypted = await this.decryptData(msg.package.data, sharedKey);
                ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'video', data: decrypted, sender: 'friend', time: new Date().toISOString() });
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                ChatSystem.updateLastMessage(msg.from, '🎥 فيديو');
            } else if (msg.package.type === 'file') {
                const decrypted = await this.decryptData(msg.package.data, sharedKey);
                ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'file', data: decrypted, fileName: msg.package.fileName, sender: 'friend', time: new Date().toISOString() });
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                ChatSystem.updateLastMessage(msg.from, '📎 ملف');
            }
            loadChats();
        } catch (error) { console.error('❌ فشل معالجة الرسالة:', error); }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('App loaded');
    ensureSinglePage(); setupNavigation(); setupModals(); loadChats(); setupChatListeners(); updateTripsCount();
    if (window.auth?.currentUser) SecureChatSystem.init();
});

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}

async function updateTripsCount() {
    if (!window.auth || !window.auth.currentUser) return;
    try {
        const snapshot = await window.db.collection('trips').where('userId', '==', window.auth.currentUser.uid).where('status', '==', 'ended').get();
        const tripsCount = document.getElementById('tripsCount');
        if (tripsCount) tripsCount.textContent = formatNumber(snapshot.size);
    } catch (error) {}
}

function ensureSinglePage() {
    document.querySelectorAll('.profile-subpage').forEach(page => page.style.display = 'none');
    document.querySelectorAll('.page').forEach(page => { page.style.display = page.classList.contains('active') ? 'block' : 'none'; });
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');
    if (!navItems.length || !pages.length) return;
    function switchPage(pageId) {
        pages.forEach(page => page.classList.remove('active'));
        const targetPage = document.querySelector(`.page.${pageId}-page`);
        if (targetPage) { targetPage.classList.add('active'); targetPage.style.display = 'block'; }
        pages.forEach(page => { if (!page.classList.contains('active')) page.style.display = 'none'; });
        document.querySelectorAll('.profile-subpage').forEach(sp => sp.style.display = 'none');
        if (pageId === 'chat') loadChats();
        document.body.classList.remove('conversation-open');
        navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageId));
    }
    navItems.forEach(item => item.addEventListener('click', () => switchPage(item.dataset.page)));
}

function setupModals() {
    window.openLanguageModal = () => { document.getElementById('languageModal')?.classList.add('active'); };
    window.closeModal = () => { document.querySelectorAll('.modal').forEach(modal => modal.classList.remove('active')); };
    document.querySelectorAll('.modal').forEach(modal => { modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); }); });
    document.querySelectorAll('.settings-item').forEach(item => { if (item.querySelector('[data-i18n="language"]')) item.addEventListener('click', openLanguageModal); });
}

// ========== نظام الدردشة E2EE كامل ==========
const ChatSystem = {
    currentChat: null, messages: {},
    
    init() { this.loadAllChats(); },
    
    loadAllChats() {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('chat_')) {
                const friendId = key.replace('chat_', '');
                try { this.messages[friendId] = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { this.messages[friendId] = []; }
            }
        }
    },
    
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId;
        document.body.classList.add('conversation-open');
        document.getElementById('conversationName').textContent = friendName;
        document.getElementById('conversationAvatar').textContent = friendAvatar || '👤';
        document.getElementById('conversationStatus').textContent = 'آخر زيارة اليوم';
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'flex';
        this.displayMessages(friendId);
        setTimeout(() => { const input = document.getElementById('messageInput'); if (input) input.focus(); }, 300);
        setTimeout(() => { const container = document.getElementById('messagesContainer'); if (container) container.scrollTop = container.scrollHeight; }, 100);
    },
    
    displayMessages(friendId) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        container.innerHTML = '';
        (this.messages[friendId] || []).forEach(msg => this.displayMessage(msg));
    },
    
    displayMessage(msg) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`;
        messageDiv.id = `msg-${msg.id}`;
        const time = new Date(msg.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        let statusHtml = '';
        if (msg.sender === 'me') {
            let icon = '✓', cls = 'sent';
            if (msg.status === 'sending') { icon = '⏳'; cls = 'sending'; }
            else if (msg.status === 'delivered') { icon = '✓✓'; cls = 'delivered'; }
            else if (msg.status === 'read') { icon = '✓✓'; cls = 'read'; }
            statusHtml = `<span class="message-status ${cls}">${icon}</span>`;
        }
        
        if (msg.type === 'text') {
            messageDiv.innerHTML = `<div class="message-content">${this.escapeHtml(msg.text)}</div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        } else if (msg.type === 'image') {
            messageDiv.innerHTML = `<img src="${msg.data}" class="message-image" onclick="window.open('${msg.data}')"><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        } else if (msg.type === 'voice') {
            messageDiv.innerHTML = `<audio controls src="${msg.data}" class="message-audio"></audio><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        } else if (msg.type === 'video') {
            messageDiv.innerHTML = `<video controls src="${msg.data}" class="message-video" style="max-width:250px;border-radius:12px;"></video><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        } else if (msg.type === 'file') {
            messageDiv.innerHTML = `<div class="message-content" onclick="window.open('${msg.data}')" style="cursor:pointer;">📎 ${msg.fileName || 'ملف'}</div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        }
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    },
    
    async sendMessage(text) {
        if (!this.currentChat || !text.trim()) return false;
        const messageId = Date.now().toString();
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!myPrivateKey || !receiverPublicKey) return false;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(text, sharedKey);
            await SecureChatSystem.sendToServer(this.currentChat, { id: messageId, type: 'text', data: encrypted, timestamp: Date.now() });
            const message = { id: messageId, type: 'text', text, sender: 'me', time: new Date().toISOString(), status: 'sent' };
            this.saveMessage(this.currentChat, message); this.displayMessage(message);
            return true;
        } catch (error) { return false; }
    },
    
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
            await SecureChatSystem.sendToServer(this.currentChat, { id: messageId, type: 'image', data: encrypted, timestamp: Date.now() });
            this.saveMessage(this.currentChat, { id: messageId, type: 'image', data: base64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            this.displayMessage({ id: messageId, type: 'image', data: base64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
        } catch (error) {}
    },
    
    async sendVoiceNote(audioBlob) {
        if (!this.currentChat) return;
        const messageId = Date.now().toString();
        try {
            const base64 = await SecureChatSystem.fileToBase64(audioBlob);
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(base64, sharedKey);
            await SecureChatSystem.sendToServer(this.currentChat, { id: messageId, type: 'voice', data: encrypted, timestamp: Date.now() });
            this.saveMessage(this.currentChat, { id: messageId, type: 'voice', data: base64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            this.displayMessage({ id: messageId, type: 'voice', data: base64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
        } catch (error) {}
    },
    
    async sendVideo(file) {
        if (!this.currentChat) return;
        const messageId = Date.now().toString();
        try {
            // ضغط الفيديو إذا حجمه أكبر من 10MB
            let videoFile = file;
            if (file.size > 10 * 1024 * 1024) {
                videoFile = await SecureChatSystem.compressVideo(file);
            }
            const base64 = await SecureChatSystem.fileToBase64(videoFile);
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(base64, sharedKey);
            await SecureChatSystem.sendToServer(this.currentChat, { id: messageId, type: 'video', data: encrypted, timestamp: Date.now() });
            this.saveMessage(this.currentChat, { id: messageId, type: 'video', data: base64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            this.displayMessage({ id: messageId, type: 'video', data: base64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
        } catch (error) {}
    },
    
    async sendFile(file) {
        if (!this.currentChat) return;
        const messageId = Date.now().toString();
        try {
            const base64 = await SecureChatSystem.fileToBase64(file);
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(base64, sharedKey);
            await SecureChatSystem.sendToServer(this.currentChat, { id: messageId, type: 'file', data: encrypted, fileName: file.name, timestamp: Date.now() });
            this.saveMessage(this.currentChat, { id: messageId, type: 'file', data: base64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            this.displayMessage({ id: messageId, type: 'file', data: base64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
        } catch (error) {}
    },
    
    saveMessage(friendId, message) {
        const key = `chat_${friendId}`;
        let history = [];
        try { history = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { history = []; }
        history.push(message);
        if (history.length > 100) history = history.slice(-100);
        localStorage.setItem(key, JSON.stringify(history));
        this.messages[friendId] = history;
    },
    
    updateLastMessage(friendId, lastMessage) {
        document.querySelectorAll('.chat-item').forEach(item => {
            if (item.getAttribute('onclick')?.includes(friendId)) {
                const lm = item.querySelector('.last-message');
                const tm = item.querySelector('.chat-time');
                if (lm) lm.textContent = lastMessage;
                if (tm) tm.textContent = 'الآن';
            }
        });
    },
    
    closeChat() {
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        this.currentChat = null;
    },
    
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
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
            chatsList.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3><p>أضف أصدقاء لبدء المحادثة</p></div>`;
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
                    let lastMessage = 'اضغط لبدء المحادثة', lastTime = '', unreadCount = 0;
                    try {
                        const history = JSON.parse(localStorage.getItem(key)) || [];
                        if (history.length > 0) {
                            const last = history[history.length - 1];
                            if (last.type === 'text') lastMessage = last.text;
                            else if (last.type === 'image') lastMessage = '📷 صورة';
                            else if (last.type === 'voice') lastMessage = '🎤 بصمة';
                            else if (last.type === 'video') lastMessage = '🎥 فيديو';
                            else if (last.type === 'file') lastMessage = '📎 ملف';
                            lastTime = new Date(last.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                        }
                    } catch (e) {}
                    html += `<div class="chat-item" onclick="openChat('${friendId}')"><div class="chat-avatar-emoji">${avatarEmoji}</div><div class="chat-info"><h4>${friend.name || 'مستخدم'}</h4><p class="last-message">${lastMessage}</p></div><div class="chat-meta"><span class="chat-time">${lastTime || ''}</span></div></div>`;
                }
            } catch (e) {}
        }
        chatsList.innerHTML = html;
    } catch (error) {}
}

function setupChatListeners() {
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('attachmentMenu');
        const attachBtn = document.querySelector('.attach-btn');
        if (menu && attachBtn && !menu.contains(e.target) && !attachBtn.contains(e.target)) menu.style.display = 'none';
        const emojiPicker = document.getElementById('emojiPicker');
        const emojiBtn = document.querySelector('.emoji-btn');
        if (emojiPicker && emojiBtn && !emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) emojiPicker.style.display = 'none';
    });
}

// ========== دوال عامة ==========
window.openChat = function(friendId) {
    window.db.collection('users').doc(friendId).get().then(doc => {
        if (doc.exists) { const f = doc.data(); ChatSystem.openChat(friendId, f.name, window.getEmojiForUser ? window.getEmojiForUser(f) : '👤'); }
    });
};

window.sendMessage = function() {
    const input = document.getElementById('messageInput');
    if (input.value.trim()) { ChatSystem.sendMessage(input.value.trim()).then(s => { if (s) input.value = ''; }); }
};

window.handleMessageKeyPress = function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMessage(); } };

window.showAttachmentMenu = function() {
    const menu = document.getElementById('attachmentMenu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    document.getElementById('emojiPicker').style.display = 'none';
};

window.showEmojiPicker = function() {
    const p = document.getElementById('emojiPicker');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
    document.getElementById('attachmentMenu').style.display = 'none';
    if (!p.querySelector('.emoji-grid').children.length) {
        ['😊','😂','❤️','👍','🎉','😢','😡','😍','🤔','👌','🙏','🔥','✨','⭐','🌙','☀️'].forEach(emoji => {
            const btn = document.createElement('button');
            btn.textContent = emoji;
            btn.onclick = () => { const inp = document.getElementById('messageInput'); inp.value += emoji; inp.focus(); p.style.display = 'none'; };
            p.querySelector('.emoji-grid').appendChild(btn);
        });
    }
};

window.sendImage = function() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = e => { const f = e.target.files[0]; if (f && ChatSystem.currentChat) ChatSystem.sendImage(f); };
    i.click(); document.getElementById('attachmentMenu').style.display = 'none';
};

window.sendVideo = function() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*';
    i.onchange = e => { const f = e.target.files[0]; if (f && ChatSystem.currentChat) ChatSystem.sendVideo(f); };
    i.click(); document.getElementById('attachmentMenu').style.display = 'none';
};

window.sendFile = function() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '*/*';
    i.onchange = e => { const f = e.target.files[0]; if (f && ChatSystem.currentChat) ChatSystem.sendFile(f); };
    i.click(); document.getElementById('attachmentMenu').style.display = 'none';
};

window.sendVoiceNote = function() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        const mr = new MediaRecorder(stream); const chunks = [];
        mr.ondataavailable = e => chunks.push(e.data);
        mr.onstop = () => { ChatSystem.sendVoiceNote(new Blob(chunks, { type: 'audio/webm' })); stream.getTracks().forEach(t => t.stop()); };
        mr.start();
        const sb = document.querySelector('.send-btn'); const vb = document.querySelector('.voice-btn');
        if (sb) sb.style.display = 'none';
        if (vb) { vb.style.display = 'flex'; vb.onclick = () => { if (mr.state === 'recording') { mr.stop(); sb.style.display = 'flex'; vb.style.display = 'none'; } }; }
        setTimeout(() => { if (mr.state === 'recording') { mr.stop(); if (sb) sb.style.display = 'flex'; if (vb) vb.style.display = 'none'; } }, 60000);
    });
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.shareLocation = function() {
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => ChatSystem.sendMessage(`📍 موقعي: https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`));
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.closeConversation = () => ChatSystem.closeChat();
window.viewContactInfo = () => alert('معلومات الاتصال - قيد التطوير');
window.openEditProfileModal = () => { document.getElementById('editName').value = document.getElementById('profileName').textContent; document.getElementById('currentAvatarEmoji').textContent = document.getElementById('profileAvatarEmoji').textContent; document.getElementById('editProfileModal').classList.add('active'); };
window.saveProfile = () => { const n = document.getElementById('editName').value.trim(); if (!n || n.length > 25) return; if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ name: n }).then(() => { document.getElementById('profileName').textContent = n; closeModal(); }); };
window.showUserTrips = () => { document.querySelector('.profile-page').style.display = 'none'; document.getElementById('tripsPage').style.display = 'block'; };
window.goBack = () => { document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); const pp = document.querySelector('.profile-page'); if (pp) { pp.style.display = 'block'; pp.classList.add('active'); } };
window.selectAvatar = (type) => { const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; const e = m[type] || '👤'; document.getElementById('profileAvatarEmoji').textContent = e; document.getElementById('currentAvatarEmoji').textContent = e; if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ avatarType: type }); closeModal(); };
window.openAvatarModal = () => document.getElementById('avatarModal')?.classList.add('active');
window.getEmojiForUser = (u) => { const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; return m[u?.avatarType] || '👤'; };
window.clearMessages = () => { const c = document.getElementById('messagesContainer'); if (c) c.innerHTML = ''; };

if ('Notification' in window) Notification.requestPermission();

console.log('✅ نهائي - E2EE كامل - صور/فيديو/بصمات/ملفات/موقع - مع ضغط');
