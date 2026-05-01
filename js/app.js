// ========== نظام التشفير E2EE + ضغط + حذف 24 ساعة ==========
const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    
    async init() {
        if (!window.auth?.currentUser) { return false; }
        try { await this.setupKeys(); this.startReceiving(); PresenceSystem.setOnline(); return true; } catch (error) { return false; }
    },
    
    async setupKeys() {
        const existingKey = localStorage.getItem('enc_private_key');
        if (!existingKey) {
            const keyPair = await this.generateKeyPair();
            const publicKey = await this.exportPublicKey(keyPair.publicKey);
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({ publicKey });
            const privateExport = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
            localStorage.setItem('enc_private_key', btoa(String.fromCharCode(...new Uint8Array(privateExport))));
        } else {
            const doc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
            if (doc.exists && !doc.data().publicKey) {
                const keyPair = await this.generateKeyPair();
                const publicKey = await this.exportPublicKey(keyPair.publicKey);
                await window.db.collection('users').doc(window.auth.currentUser.uid).update({ publicKey });
                const privateExport = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
                localStorage.setItem('enc_private_key', btoa(String.fromCharCode(...new Uint8Array(privateExport))));
            }
        }
    },
    
    async generateKeyPair() { return await window.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']); },
    async exportPublicKey(key) { const raw = await window.crypto.subtle.exportKey('raw', key); return btoa(String.fromCharCode(...new Uint8Array(raw))); },
    async importPublicKey(base64Key) { const binary = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0)); return await window.crypto.subtle.importKey('raw', binary, { name: 'ECDH', namedCurve: 'P-256' }, true, []); },
    
    async getMyPrivateKey() {
        const stored = localStorage.getItem('enc_private_key'); if (!stored) return null;
        const binary = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
        return await window.crypto.subtle.importKey('pkcs8', binary, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
    },
    
    async getReceiverPublicKey(userId) { const doc = await window.db.collection('users').doc(userId).get(); if (!doc.exists || !doc.data().publicKey) return null; return await this.importPublicKey(doc.data().publicKey); },
    async deriveSharedKey(privateKey, publicKey) { return await window.crypto.subtle.deriveKey({ name: 'ECDH', public: publicKey }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); },
    
    async encryptData(data, sharedKey) { const encoder = new TextEncoder(); const iv = window.crypto.getRandomValues(new Uint8Array(12)); const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('rafeeq-secure') }, sharedKey, typeof data === 'string' ? encoder.encode(data) : data); const combined = new Uint8Array(iv.length + encrypted.byteLength); combined.set(iv); combined.set(new Uint8Array(encrypted), iv.length); return btoa(String.fromCharCode(...combined)); },
    async decryptData(encryptedBase64, sharedKey) { const encoder = new TextEncoder(); const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0)); const iv = combined.slice(0, 12); const data = combined.slice(12); const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('rafeeq-secure') }, sharedKey, data); return new TextDecoder().decode(decrypted); },
    
    async compressImage(file) { return new Promise(resolve => { const img = new Image(); const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); img.onload = () => { let w = img.width, h = img.height; if (w > 1200 || h > 1200) { if (w > h) { h *= 1200 / w; w = 1200; } else { w *= 1200 / h; h = 1200; } } canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h); canvas.toBlob(resolve, 'image/jpeg', 0.8); }; img.src = URL.createObjectURL(file); }); },
    
    async compressVideo(file) {
        return new Promise((resolve) => {
            const video = document.createElement('video'); const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
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
                mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
                video.currentTime = 0; video.play(); mediaRecorder.start();
                setTimeout(() => { mediaRecorder.stop(); video.pause(); }, Math.min(video.duration * 1000, 1800000)); // 30 دقيقة
            };
            video.src = URL.createObjectURL(file);
        });
    },
    
    fileToBase64(blob) { return new Promise(resolve => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob); }); },
    
    async sendToServer(receiverId, encryptedPackage) { await window.db.collection('secure_messages').add({ to: receiverId, from: window.auth.currentUser.uid, package: encryptedPackage, timestamp: firebase.firestore.FieldValue.serverTimestamp(), expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + this.MESSAGE_EXPIRY_HOURS * 3600000)) }); },
    
    startReceiving() { if (!window.auth?.currentUser) return; window.db.collection('secure_messages').where('to', '==', window.auth.currentUser.uid).onSnapshot(async snapshot => { for (const change of snapshot.docChanges()) { if (change.type === 'added') { const msg = { id: change.doc.id, ...change.doc.data() }; await this.processReceivedMessage(msg); await change.doc.ref.delete(); } } }); },
    
    async processReceivedMessage(msg) {
        try {
            const myPrivateKey = await this.getMyPrivateKey(); const senderPublicKey = await this.getReceiverPublicKey(msg.from);
            if (!myPrivateKey || !senderPublicKey) return;
            const sharedKey = await this.deriveSharedKey(myPrivateKey, senderPublicKey);
            if (msg.package.type === 'text') { const d = await this.decryptData(msg.package.data, sharedKey); ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'text', text: d, sender: 'friend', time: new Date().toISOString() }); if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from); ChatSystem.updateLastMessage(msg.from, d); }
            else if (msg.package.type === 'webrtc') { const d = await this.decryptData(msg.package.data, sharedKey); CallSystem.handleSignaling(JSON.parse(d)); }
            else if (msg.package.type === 'connect_request') { const d = await this.decryptData(msg.package.data, sharedKey); CallSystem.showConnectionRequest(msg.from, JSON.parse(d)); }
            else if (msg.package.type === 'connect_accept') { const d = await this.decryptData(msg.package.data, sharedKey); CallSystem.confirmConnection(msg.from, JSON.parse(d)); }
            loadChats();
        } catch (error) {}
    }
};

// ========== نظام الحضور Presence ==========
const PresenceSystem = {
    listeners: {},
    async setOnline() { if (!window.auth?.currentUser) return; try { await window.db.collection('users').doc(window.auth.currentUser.uid).update({ online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); } catch (e) {} },
    async setOffline() { if (!window.auth?.currentUser) return; try { await window.db.collection('users').doc(window.auth.currentUser.uid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); } catch (e) {} },
    watchFriend(friendId) { if (this.listeners[friendId]) this.listeners[friendId](); this.listeners[friendId] = window.db.collection('users').doc(friendId).onSnapshot(doc => { if (doc.exists) { ChatSystem.updateFriendStatus(friendId, doc.data().online === true); } }); },
    stopAll() { Object.values(this.listeners).forEach(unsub => unsub()); this.listeners = {}; }
};

// ========== نظام اتصال WebRTC مباشر ==========
const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false, isConnected: false,
    incomingChunks: {}, incomingFileInfo: {},
    
    servers: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
    },

    // ✅ طلب الاتصال اليدوي
    async requestConnection(calleeId) {
        if (this.dc && this.dc.readyState === 'open') {
            console.log('✅ القناة مفتوحة مسبقاً');
            return;
        }
        
        // إرسال طلب اتصال للطرف الآخر
        const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
        const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
        if (!myPrivateKey || !receiverPublicKey) return;
        const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
        const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ type: 'connect_request' }), sharedKey);
        await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'connect_request', data: encrypted, timestamp: Date.now() });
        
        console.log('📡 طلب اتصال أُرسل');
    },

    // ✅ عرض طلب الاتصال للطرف الثاني
    async showConnectionRequest(callerId, data) {
        const cName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        if (confirm(`📡 ${cName} يريد الاتصال بك. هل تقبل؟`)) {
            // إرسال قبول
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(callerId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ type: 'connect_accept' }), sharedKey);
            await SecureChatSystem.sendToServer(callerId, { id: Date.now().toString(), type: 'connect_accept', data: encrypted, timestamp: Date.now() });
            
            // بناء القناة
            await this.ensureDataChannel(callerId);
        }
    },

    // ✅ تأكيد الاتصال وبناء القناة
    async confirmConnection(calleeId, data) {
        console.log('✅ الطرف الآخر وافق على الاتصال');
        await this.ensureDataChannel(calleeId);
    },
    
    async ensureDataChannel(calleeId) {
        if (this.dc && this.dc.readyState === 'open') {
            this.isConnected = true;
            ChatSystem.updateChannelStatus(true);
            return;
        }
        if (this.dc) { this.dc.close(); this.dc = null; }
        if (this.pc) { this.pc.close(); this.pc = null; }
        
        console.log('📡 إنشاء قناة بيانات جديدة...');
        this.pc = new RTCPeerConnection(this.servers);
        this.dc = this.pc.createDataChannel('chat');
        this.setupDataChannel(this.dc);
        this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }); };
        this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); };
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.sendSignal(calleeId, { sdp: this.pc.localDescription });
    },
    
    async startCall(calleeId, callType = 'video') { /* بدون تغيير */ },
    
    setupDataChannel(channel) {
        channel.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'ping') { channel.send(JSON.stringify({ type: 'pong' })); return; }
                if (msg.type === 'pong') { return; }
                if (msg.chunk !== undefined) {
                    if (!this.incomingChunks[msg.id]) { this.incomingChunks[msg.id] = []; this.incomingFileInfo[msg.id] = { type: msg.type, fileName: msg.fileName, total: msg.total, received: 0 }; }
                    this.incomingChunks[msg.id][msg.chunk] = msg.data;
                    this.incomingFileInfo[msg.id].received++;
                    if (this.incomingFileInfo[msg.id].received === msg.total) {
                        const fullData = this.incomingChunks[msg.id].join('');
                        const dm = { id: msg.id, type: msg.type === 'location' ? 'text' : msg.type, data: fullData, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
                        if (ChatSystem.currentChat) { ChatSystem.saveMessage(ChatSystem.currentChat, dm); ChatSystem.displayMessage(dm); }
                        delete this.incomingChunks[msg.id]; delete this.incomingFileInfo[msg.id];
                    }
                    return;
                }
                const dm = { id: msg.id || Date.now().toString(), type: msg.type, data: msg.data, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
                if (ChatSystem.currentChat) { ChatSystem.saveMessage(ChatSystem.currentChat, dm); ChatSystem.displayMessage(dm); }
            } catch (er) {}
        };
        channel.onopen = () => {
            console.log('📡 Data Channel مفتوح');
            this.isConnected = true;
            ChatSystem.updateChannelStatus(true);
            channel.heartbeat = setInterval(() => { if (channel.readyState === 'open') channel.send(JSON.stringify({ type: 'ping' })); else clearInterval(channel.heartbeat); }, 10000);
        };
        channel.onclose = () => {
            console.log('⚠️ Data Channel انغلق');
            this.isConnected = false;
            ChatSystem.updateChannelStatus(false);
            if (channel.heartbeat) clearInterval(channel.heartbeat);
        };
    },
    
    async sendFileDirect(file, type) { /* بدون تغيير */ },
    showIncomingCall(callerId, callData) { /* بدون تغيير */ },
    async receiveCall(callerId, callData) { /* بدون تغيير */ },
    async handleSignaling(data) { /* بدون تغيير */ },
    async sendSignal(calleeId, data) {
        const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
        const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
        if (!myPrivateKey || !receiverPublicKey) return;
        const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
        const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
        await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'webrtc', data: encrypted, timestamp: Date.now() });
    },
    showCallUI(callType) { /* بدون تغيير */ },
    toggleAudio() { if (this.localStream) { const at = this.localStream.getAudioTracks()[0]; if (at) at.enabled = !at.enabled; } },
    toggleVideo() { if (this.localStream) { const vt = this.localStream.getVideoTracks()[0]; if (vt) vt.enabled = !vt.enabled; } },
    endCall() { /* بدون تغيير */ }
};

window.startVideoCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat, 'video'); };
window.startAudioCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat, 'audio'); };
// ✅ زر الاتصال اليدوي الجديد
window.requestConnection = () => { if (ChatSystem.currentChat) CallSystem.requestConnection(ChatSystem.currentChat); };

// ========== نظام الدردشة E2EE ==========
const ChatSystem = {
    currentChat: null, messages: {}, friendOnline: false,
    
    init() { this.loadAllChats(); },
    loadAllChats() { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('chat_')) { const fid = k.replace('chat_', ''); try { this.messages[fid] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { this.messages[fid] = []; } } } },
    
    // ✅ دالة openChat مبسطة بدون محاولات تلقائية
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId; document.body.classList.add('conversation-open');
        document.getElementById('conversationName').textContent = friendName;
        document.getElementById('conversationAvatar').textContent = friendAvatar || '👤';
        document.querySelector('.chat-page').style.display = 'none'; document.getElementById('conversationPage').style.display = 'flex';
        this.displayMessages(friendId);
        PresenceSystem.watchFriend(friendId);
        this.updateChannelStatus(CallSystem.isConnected);
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
    },
    
    // ✅ تحديث حالة القناة (تظهر في الواجهة)
    updateChannelStatus(isConnected) {
        CallSystem.isConnected = isConnected;
        const statusEl = document.getElementById('conversationStatus');
        if (statusEl) { statusEl.textContent = isConnected ? '🟢 متصل' : (this.friendOnline ? '🔴 اضغط للاتصال' : '⚫ غير متصل'); statusEl.className = `conversation-status ${isConnected ? 'online' : 'offline'}`; }
        this.updateAttachmentButtons(isConnected);
    },
    
    updateFriendStatus(friendId, isOnline) {
        if (this.currentChat !== friendId) return;
        this.friendOnline = isOnline;
        if (!isOnline) this.updateChannelStatus(false);
        const statusEl = document.getElementById('conversationStatus');
        if (statusEl && !CallSystem.isConnected) { statusEl.textContent = isOnline ? '🔴 اضغط للاتصال' : '⚫ غير متصل'; statusEl.className = `conversation-status ${isOnline ? 'online' : 'offline'}`; }
        this.updateAttachmentButtons(CallSystem.isConnected);
    },
    
    updateAttachmentButtons(isConnected) {
        const btns = document.querySelectorAll('#attachmentMenu button[data-dc]');
        btns.forEach(btn => { if (isConnected) { btn.classList.remove('locked'); btn.title = ''; } else { btn.classList.add('locked'); btn.title = 'غير متاح - اضغط اتصال أولاً'; } });
    },
    
    displayMessages(friendId) { const c = document.getElementById('messagesContainer'); if (!c) return; c.innerHTML = ''; (this.messages[friendId] || []).forEach(m => this.displayMessage(m)); },
    displayMessage(msg) { /* بدون تغيير */ },
    async sendMessage(text) { /* بدون تغيير */ },
    async sendImage(file) { if (!this.currentChat) return; if (CallSystem.isConnected && CallSystem.dc && CallSystem.dc.readyState === 'open') { /* ... */ } },
    async sendVideoFile(file) { if (!this.currentChat) return; if (CallSystem.isConnected && CallSystem.dc && CallSystem.dc.readyState === 'open') { /* ... */ } },
    async sendFile(file) { if (!this.currentChat) return; if (CallSystem.isConnected && CallSystem.dc && CallSystem.dc.readyState === 'open') { /* ... */ } },
    async sendVoiceNote(audioBlob) { if (!this.currentChat) return; if (CallSystem.isConnected && CallSystem.dc && CallSystem.dc.readyState === 'open') { /* ... */ } },
    async shareLocationDirect() { if (!this.currentChat) return; if (CallSystem.isConnected && CallSystem.dc && CallSystem.dc.readyState === 'open') { /* ... */ } },
    saveMessage(friendId, message) { /* بدون تغيير */ },
    updateLastMessage(friendId, lastMessage) { /* بدون تغيير */ },
    closeChat() { /* بدون تغيير */ },
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
};
ChatSystem.init();

// ... (باقي الدوال العامة بدون تغيير)
