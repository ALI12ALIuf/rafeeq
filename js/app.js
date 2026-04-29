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
    
    async encryptData(data, sharedKey) {
        const encoder = new TextEncoder(); const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('rafeeq-secure') }, sharedKey, typeof data === 'string' ? encoder.encode(data) : data);
        const combined = new Uint8Array(iv.length + encrypted.byteLength); combined.set(iv); combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    },
    
    async decryptData(encryptedBase64, sharedKey) {
        const encoder = new TextEncoder(); const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12); const data = combined.slice(12);
        const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('rafeeq-secure') }, sharedKey, data);
        return new TextDecoder().decode(decrypted);
    },
    
    async compressImage(file) {
        return new Promise(resolve => { const img = new Image(); const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); img.onload = () => { let w = img.width, h = img.height; if (w > 1200 || h > 1200) { if (w > h) { h *= 1200 / w; w = 1200; } else { w *= 1200 / h; h = 1200; } } canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h); canvas.toBlob(resolve, 'image/jpeg', 0.8); }; img.src = URL.createObjectURL(file); });
    },
    
    fileToBase64(blob) { return new Promise(resolve => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob); }); },
    
    async sendToServer(receiverId, encryptedPackage) {
        await window.db.collection('secure_messages').add({ to: receiverId, from: window.auth.currentUser.uid, package: encryptedPackage, timestamp: firebase.firestore.FieldValue.serverTimestamp(), expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + this.MESSAGE_EXPIRY_HOURS * 3600000)) });
    },
    
    startReceiving() {
        if (!window.auth?.currentUser) return;
        window.db.collection('secure_messages').where('to', '==', window.auth.currentUser.uid).onSnapshot(async snapshot => { for (const change of snapshot.docChanges()) { if (change.type === 'added') { const msg = { id: change.doc.id, ...change.doc.data() }; await this.processReceivedMessage(msg); await change.doc.ref.delete(); } } });
    },
    
    async processReceivedMessage(msg) {
        try {
            const myPrivateKey = await this.getMyPrivateKey(); const senderPublicKey = await this.getReceiverPublicKey(msg.from);
            if (!myPrivateKey || !senderPublicKey) return;
            const sharedKey = await this.deriveSharedKey(myPrivateKey, senderPublicKey);
            if (msg.package.type === 'text') { const d = await this.decryptData(msg.package.data, sharedKey); ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'text', text: d, sender: 'friend', time: new Date().toISOString() }); if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from); ChatSystem.updateLastMessage(msg.from, d); }
            else if (msg.package.type === 'webrtc') { const d = await this.decryptData(msg.package.data, sharedKey); CallSystem.handleSignaling(JSON.parse(d)); }
            loadChats();
        } catch (error) {}
    }
};

// ========== نظام الحضور Presence ==========
const PresenceSystem = {
    listeners: {},
    
    async setOnline() {
        if (!window.auth?.currentUser) return;
        try { await window.db.collection('users').doc(window.auth.currentUser.uid).update({ online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); } catch (e) {}
    },
    
    async setOffline() {
        if (!window.auth?.currentUser) return;
        try { await window.db.collection('users').doc(window.auth.currentUser.uid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); } catch (e) {}
    },
    
    watchFriend(friendId) {
        if (this.listeners[friendId]) this.listeners[friendId]();
        this.listeners[friendId] = window.db.collection('users').doc(friendId).onSnapshot(doc => {
            if (doc.exists) { ChatSystem.updateFriendStatus(friendId, doc.data().online === true); }
        });
    },
    
    stopAll() { Object.values(this.listeners).forEach(unsub => unsub()); this.listeners = {}; }
};

// ========== نظام اتصال WebRTC مباشر ==========
const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false,
    
    servers: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
    },
    
    async ensureDataChannel(calleeId) {
        if (this.dc && this.dc.readyState === 'open') return;
        this.pc = new RTCPeerConnection(this.servers);
        this.dc = this.pc.createDataChannel('chat');
        this.setupDataChannel(this.dc);
        this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }); };
        this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); };
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.sendSignal(calleeId, { sdp: this.pc.localDescription });
    },
    
    async startCall(calleeId, callType = 'video') {
        if (!window.auth?.currentUser || this.isInCall) return;
        this.isInCall = true;
        try {
            const constraints = { audio: true, video: callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.showCallUI(callType);
            this.pc = new RTCPeerConnection(this.servers);
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }); };
            this.pc.ontrack = e => { const rv = document.getElementById('remoteVideo'); if (rv) rv.srcObject = e.streams[0]; };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); };
            this.pc.onconnectionstatechange = () => { if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) this.endCall(); };
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            this.sendSignal(calleeId, { sdp: this.pc.localDescription });
        } catch (e) { this.endCall(); }
    },
    
    setupDataChannel(channel) {
        channel.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'image') { const dm = { id: msg.id || Date.now().toString(), type: 'image', data: msg.data, sender: 'friend', time: new Date().toISOString() }; ChatSystem.saveMessage(ChatSystem.currentChat, dm); if (ChatSystem.currentChat) ChatSystem.displayMessage(dm); }
                else if (msg.type === 'file') { const dm = { id: msg.id || Date.now().toString(), type: 'file', data: msg.data, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() }; ChatSystem.saveMessage(ChatSystem.currentChat, dm); if (ChatSystem.currentChat) ChatSystem.displayMessage(dm); }
                else if (msg.type === 'voice') { const dm = { id: msg.id || Date.now().toString(), type: 'voice', data: msg.data, sender: 'friend', time: new Date().toISOString() }; ChatSystem.saveMessage(ChatSystem.currentChat, dm); if (ChatSystem.currentChat) ChatSystem.displayMessage(dm); }
                else if (msg.type === 'video') { const dm = { id: msg.id || Date.now().toString(), type: 'video', data: msg.data, sender: 'friend', time: new Date().toISOString() }; ChatSystem.saveMessage(ChatSystem.currentChat, dm); if (ChatSystem.currentChat) ChatSystem.displayMessage(dm); }
                else if (msg.type === 'location') { const dm = { id: msg.id || Date.now().toString(), type: 'text', text: msg.data, sender: 'friend', time: new Date().toISOString() }; ChatSystem.saveMessage(ChatSystem.currentChat, dm); if (ChatSystem.currentChat) ChatSystem.displayMessage(dm); }
            } catch (er) {}
        };
        channel.onopen = () => console.log('📡 Data Channel مفتوح');
    },
    
    async sendFileDirect(file, type) {
        if (!this.dc || this.dc.readyState !== 'open') return false;
        try {
            let b64;
            if (type === 'image') { const comp = await SecureChatSystem.compressImage(file); b64 = await SecureChatSystem.fileToBase64(comp); }
            else { b64 = await SecureChatSystem.fileToBase64(file); }
            this.dc.send(JSON.stringify({ type, data: b64, id: Date.now().toString(), fileName: file.name }));
            return true;
        } catch (e) { return false; }
    },
    
    showIncomingCall(callerId, callData) {
        const callType = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const overlay = document.createElement('div');
        overlay.id = 'incomingCall';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;';
        overlay.innerHTML = `<div style="font-size:1.5rem;">📞 ${callType} يتصل بك...</div><div style="display:flex;gap:30px;"><button id="btnAccept" style="width:70px;height:70px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;">✅</button><button id="btnReject" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;">❌</button></div>`;
        document.body.appendChild(overlay);
        document.getElementById('btnAccept').onclick = () => { overlay.remove(); this.receiveCall(callerId, callData); };
        document.getElementById('btnReject').onclick = () => { overlay.remove(); };
    },
    
    async receiveCall(callerId, callData) {
        if (this.isInCall) return;
        this.isInCall = true;
        try {
            const hasVideo = callData.sdp?.sdp?.includes('video') !== false;
            const constraints = { audio: true, video: hasVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.showCallUI(hasVideo ? 'video' : 'audio');
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(callerId, { candidate: e.candidate }); };
            this.pc.ontrack = e => { const rv = document.getElementById('remoteVideo'); if (rv) rv.srcObject = e.streams[0]; };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); };
            this.pc.onconnectionstatechange = () => { if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) this.endCall(); };
            if (callData.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp));
                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                this.sendSignal(callerId, { sdp: this.pc.localDescription });
            }
        } catch (e) { this.endCall(); }
    },
    
    async handleSignaling(data) {
        try {
            if (!this.pc) { this.pc = new RTCPeerConnection(this.servers); this.pc.ondatachannel = e => { this.dc = e.channel; this.setupDataChannel(this.dc); }; this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(ChatSystem.currentChat || '', { candidate: e.candidate }); }; }
            if (data.sdp) { await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); if (data.sdp.type === 'offer') { const answer = await this.pc.createAnswer(); await this.pc.setLocalDescription(answer); this.sendSignal(ChatSystem.currentChat || '', { sdp: this.pc.localDescription }); } }
            else if (data.candidate) { await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); }
        } catch (e) {}
    },
    
    async sendSignal(calleeId, data) {
        const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
        const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
        if (!myPrivateKey || !receiverPublicKey) return;
        const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
        const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
        await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'webrtc', data: encrypted, timestamp: Date.now() });
    },
    
    showCallUI(callType) {
        document.body.classList.add('in-call');
        const ui = document.createElement('div');
        ui.id = 'callUI';
        ui.innerHTML = `<video id="remoteVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;position:fixed;top:0;left:0;z-index:9998;background:#000;"></video><video id="localVideo" autoplay playsinline muted style="width:100px;height:150px;object-fit:cover;position:fixed;bottom:100px;right:20px;z-index:9999;border-radius:12px;border:2px solid white;background:#333;"></video><div style="position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:30px;"><button onclick="CallSystem.toggleAudio()" style="width:50px;height:50px;border-radius:50%;background:#333;color:white;border:none;font-size:1.2rem;cursor:pointer;">🎤</button><button onclick="CallSystem.endCall()" style="width:60px;height:60px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.5rem;cursor:pointer;">📞</button><button onclick="CallSystem.toggleVideo()" style="width:50px;height:50px;border-radius:50%;background:#333;color:white;border:none;font-size:1.2rem;cursor:pointer;">📹</button></div>`;
        document.body.appendChild(ui);
        const lv = document.getElementById('localVideo');
        if (lv && this.localStream) lv.srcObject = this.localStream;
    },
    
    toggleAudio() { if (this.localStream) { const at = this.localStream.getAudioTracks()[0]; if (at) at.enabled = !at.enabled; } },
    toggleVideo() { if (this.localStream) { const vt = this.localStream.getVideoTracks()[0]; if (vt) vt.enabled = !vt.enabled; } },
    
    endCall() {
        this.isInCall = false;
        document.body.classList.remove('in-call');
        if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
        if (this.dc) { this.dc.close(); this.dc = null; }
        if (this.pc) { this.pc.close(); this.pc = null; }
        const ui = document.getElementById('callUI'); if (ui) ui.remove();
        const inc = document.getElementById('incomingCall'); if (inc) inc.remove();
    }
};

window.startVideoCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat, 'video'); };
window.startAudioCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat, 'audio'); };

// ========== نظام الدردشة E2EE ==========
const ChatSystem = {
    currentChat: null, messages: {}, friendOnline: false,
    
    init() { this.loadAllChats(); },
    loadAllChats() { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('chat_')) { const fid = k.replace('chat_', ''); try { this.messages[fid] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { this.messages[fid] = []; } } } },
    
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId; document.body.classList.add('conversation-open');
        document.getElementById('conversationName').textContent = friendName;
        document.getElementById('conversationAvatar').textContent = friendAvatar || '👤';
        document.querySelector('.chat-page').style.display = 'none'; document.getElementById('conversationPage').style.display = 'flex';
        this.displayMessages(friendId);
        PresenceSystem.watchFriend(friendId);
        setTimeout(() => {
            if (this.friendOnline) CallSystem.ensureDataChannel(friendId);
        }, 500);
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
    },
    
    updateFriendStatus(friendId, isOnline) {
        if (this.currentChat !== friendId) return;
        this.friendOnline = isOnline;
        if (isOnline) CallSystem.ensureDataChannel(friendId);
        const statusEl = document.getElementById('conversationStatus');
        if (statusEl) { statusEl.textContent = isOnline ? '🟢 متصل' : '🔴 غير متصل'; statusEl.className = `conversation-status ${isOnline ? 'online' : 'offline'}`; }
        this.updateAttachmentButtons(isOnline);
    },
    
    updateAttachmentButtons(isOnline) {
        const btns = document.querySelectorAll('#attachmentMenu button[data-dc]');
        btns.forEach(btn => { if (isOnline) { btn.classList.remove('locked'); btn.title = ''; } else { btn.classList.add('locked'); btn.title = 'غير متاح - المستخدم غير متصل'; } });
    },
    
    displayMessages(friendId) { const c = document.getElementById('messagesContainer'); if (!c) return; c.innerHTML = ''; (this.messages[friendId] || []).forEach(m => this.displayMessage(m)); },
    
    displayMessage(msg) {
        const c = document.getElementById('messagesContainer'); if (!c) return;
        const div = document.createElement('div'); div.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`; div.id = `msg-${msg.id}`;
        const time = new Date(msg.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        let statusHtml = ''; if (msg.sender === 'me') { let icon = '✓', cls = 'sent'; if (msg.status === 'delivered') { icon = '✓✓'; cls = 'delivered'; } else if (msg.status === 'read') { icon = '✓✓'; cls = 'read'; } statusHtml = `<span class="message-status ${cls}">${icon}</span>`; }
        if (msg.type === 'text') div.innerHTML = `<div class="message-content">${this.escapeHtml(msg.text)}</div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        else if (msg.type === 'image') div.innerHTML = `<img src="${msg.data}" class="message-image"><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        else if (msg.type === 'voice') div.innerHTML = `<audio controls src="${msg.data}" class="message-audio"></audio><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        else if (msg.type === 'video') div.innerHTML = `<video controls src="${msg.data}" style="max-width:250px;border-radius:12px;"></video><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        else if (msg.type === 'file') div.innerHTML = `<div class="message-content" onclick="window.open('${msg.data}')" style="cursor:pointer;">📎 ${msg.fileName || 'ملف'}</div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        c.appendChild(div); c.scrollTop = c.scrollHeight;
    },
    
    async sendMessage(text) { if (!this.currentChat || !text.trim()) return false; const mid = Date.now().toString(); try { const pr = await SecureChatSystem.getMyPrivateKey(); const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); if (!pr || !pu) return false; const sk = await SecureChatSystem.deriveSharedKey(pr, pu); const enc = await SecureChatSystem.encryptData(text, sk); await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'text', data: enc, timestamp: Date.now() }); this.saveMessage(this.currentChat, { id: mid, type: 'text', text, sender: 'me', time: new Date().toISOString(), status: 'sent' }); this.displayMessage({ id: mid, type: 'text', text, sender: 'me', time: new Date().toISOString(), status: 'sent' }); return true; } catch (e) { return false; } },
    
    async sendImage(file) {
        if (!this.currentChat) return;
        if (this.friendOnline && CallSystem.dc && CallSystem.dc.readyState === 'open') {
            await CallSystem.sendFileDirect(file, 'image');
            const comp = await SecureChatSystem.compressImage(file);
            const b64 = await SecureChatSystem.fileToBase64(comp);
            this.saveMessage(this.currentChat, { id: Date.now().toString(), type: 'image', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            this.displayMessage({ id: Date.now().toString(), type: 'image', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
        }
    },
    
    async sendVideoFile(file) {
        if (!this.currentChat) return;
        if (this.friendOnline && CallSystem.dc && CallSystem.dc.readyState === 'open') {
            await CallSystem.sendFileDirect(file, 'video');
            const b64 = await SecureChatSystem.fileToBase64(file);
            this.saveMessage(this.currentChat, { id: Date.now().toString(), type: 'video', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            this.displayMessage({ id: Date.now().toString(), type: 'video', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
        }
    },
    
    async sendFile(file) {
        if (!this.currentChat) return;
        if (this.friendOnline && CallSystem.dc && CallSystem.dc.readyState === 'open') {
            await CallSystem.sendFileDirect(file, 'file');
            const b64 = await SecureChatSystem.fileToBase64(file);
            this.saveMessage(this.currentChat, { id: Date.now().toString(), type: 'file', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            this.displayMessage({ id: Date.now().toString(), type: 'file', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
        }
    },
    
    async sendVoiceNote(audioBlob) {
        if (!this.currentChat) return;
        if (this.friendOnline && CallSystem.dc && CallSystem.dc.readyState === 'open') {
            await CallSystem.sendFileDirect(audioBlob, 'voice');
            const b64 = await SecureChatSystem.fileToBase64(audioBlob);
            this.saveMessage(this.currentChat, { id: Date.now().toString(), type: 'voice', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            this.displayMessage({ id: Date.now().toString(), type: 'voice', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
        }
    },
    
    async shareLocationDirect() {
        if (!this.currentChat) return;
        if (this.friendOnline && CallSystem.dc && CallSystem.dc.readyState === 'open') {
            navigator.geolocation.getCurrentPosition(p => {
                const locMsg = `📍 موقعي: https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`;
                CallSystem.dc.send(JSON.stringify({ type: 'location', data: locMsg, id: Date.now().toString() }));
                this.displayMessage({ id: Date.now().toString(), type: 'text', text: locMsg, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                this.saveMessage(this.currentChat, { id: Date.now().toString(), type: 'text', text: locMsg, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            });
        }
    },
    
    saveMessage(friendId, message) { const key = `chat_${friendId}`; let h = []; try { h = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { h = []; } h.push(message); if (h.length > 100) h = h.slice(-100); localStorage.setItem(key, JSON.stringify(h)); this.messages[friendId] = h; },
    updateLastMessage(friendId, lastMessage) { document.querySelectorAll('.chat-item').forEach(item => { if (item.getAttribute('onclick')?.includes(friendId)) { const lm = item.querySelector('.last-message'); const tm = item.querySelector('.chat-time'); if (lm) lm.textContent = lastMessage; if (tm) tm.textContent = 'الآن'; } }); },
    closeChat() { document.body.classList.remove('conversation-open'); document.getElementById('conversationPage').style.display = 'none'; document.querySelector('.chat-page').style.display = 'block'; PresenceSystem.stopAll(); this.currentChat = null; },
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
};
ChatSystem.init();

async function loadChats() { if (!window.auth || !window.auth.currentUser) return; const list = document.getElementById('chatsList'); if (!list) return; try { const udoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); if (!udoc.exists) return; const friends = udoc.data().friends || []; if (!friends.length) { list.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3><p>أضف أصدقاء لبدء المحادثة</p></div>`; return; } let html = ''; for (const fid of friends) { try { const fdoc = await window.db.collection('users').doc(fid).get(); if (fdoc.exists) { const f = fdoc.data(); const key = `chat_${fid}`; let lm = 'اضغط لبدء المحادثة', lt = ''; try { const h = JSON.parse(localStorage.getItem(key)) || []; if (h.length > 0) { const l = h[h.length - 1]; if (l.type === 'text') lm = l.text; else if (l.type === 'image') lm = '📷 صورة'; else if (l.type === 'voice') lm = '🎤 بصمة'; else if (l.type === 'video') lm = '🎥 فيديو'; else if (l.type === 'file') lm = '📎 ملف'; lt = new Date(l.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); } } catch (e) {} html += `<div class="chat-item" onclick="openChat('${fid}')"><div class="chat-avatar-emoji">${window.getEmojiForUser(f)}</div><div class="chat-info"><h4>${f.name || 'مستخدم'}</h4><p class="last-message">${lm}</p></div><div class="chat-meta"><span class="chat-time">${lt || ''}</span></div></div>`; } } catch (e) {} } list.innerHTML = html; } catch (e) {} }

function setupChatListeners() { document.addEventListener('click', e => { const m = document.getElementById('attachmentMenu'); const ab = document.querySelector('.attach-btn'); if (m && ab && !m.contains(e.target) && !ab.contains(e.target)) m.style.display = 'none'; const ep = document.getElementById('emojiPicker'); const eb = document.querySelector('.emoji-btn'); if (ep && eb && !ep.contains(e.target) && !eb.contains(e.target)) ep.style.display = 'none'; }); }

window.openChat = friendId => { window.db.collection('users').doc(friendId).get().then(doc => { if (doc.exists) { const f = doc.data(); ChatSystem.openChat(friendId, f.name, window.getEmojiForUser ? window.getEmojiForUser(f) : '👤'); } }); };
window.sendMessage = () => { const inp = document.getElementById('messageInput'); if (inp.value.trim()) { ChatSystem.sendMessage(inp.value.trim()).then(s => { if (s) inp.value = ''; }); } };
window.handleMessageKeyPress = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMessage(); } };
window.showAttachmentMenu = () => { const m = document.getElementById('attachmentMenu'); m.style.display = m.style.display === 'none' ? 'flex' : 'none'; document.getElementById('emojiPicker').style.display = 'none'; };
window.showEmojiPicker = () => { const p = document.getElementById('emojiPicker'); p.style.display = p.style.display === 'none' ? 'block' : 'none'; document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendImage = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = e => { const f = e.target.files[0]; if (f && ChatSystem.currentChat) ChatSystem.sendImage(f); }; i.click(); document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendVideo = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*'; i.onchange = e => { const f = e.target.files[0]; if (f && ChatSystem.currentChat) ChatSystem.sendVideoFile(f); }; i.click(); document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendFile = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '*/*'; i.onchange = e => { const f = e.target.files[0]; if (f && ChatSystem.currentChat) ChatSystem.sendFile(f); }; i.click(); document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendVoiceNote = () => { navigator.mediaDevices.getUserMedia({ audio: true }).then(s => { const mr = new MediaRecorder(s); const ch = []; mr.ondataavailable = e => ch.push(e.data); mr.onstop = () => { ChatSystem.sendVoiceNote(new Blob(ch, { type: 'audio/webm' })); s.getTracks().forEach(t => t.stop()); }; mr.start(); const sb = document.querySelector('.send-btn'), vb = document.querySelector('.voice-btn'); if (sb) sb.style.display = 'none'; if (vb) { vb.style.display = 'flex'; vb.onclick = () => { if (mr.state === 'recording') { mr.stop(); sb.style.display = 'flex'; vb.style.display = 'none'; } }; } setTimeout(() => { if (mr.state === 'recording') { mr.stop(); if (sb) sb.style.display = 'flex'; if (vb) vb.style.display = 'none'; } }, 60000); }); document.getElementById('attachmentMenu').style.display = 'none'; };
window.shareLocation = () => { if (ChatSystem.friendOnline && CallSystem.dc && CallSystem.dc.readyState === 'open') { ChatSystem.shareLocationDirect(); } else { if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => ChatSystem.sendMessage(`📍 موقعي: https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`)); } document.getElementById('attachmentMenu').style.display = 'none'; };
window.closeConversation = () => { CallSystem.endCall(); ChatSystem.closeChat(); };
window.openEditProfileModal = () => { document.getElementById('editName').value = document.getElementById('profileName').textContent; document.getElementById('currentAvatarEmoji').textContent = document.getElementById('profileAvatarEmoji').textContent; document.getElementById('editProfileModal').classList.add('active'); };
window.saveProfile = () => { const n = document.getElementById('editName').value.trim(); if (!n || n.length > 25) return; if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ name: n }).then(() => { document.getElementById('profileName').textContent = n; closeModal(); }); };
window.showUserTrips = () => { document.querySelector('.profile-page').style.display = 'none'; document.getElementById('tripsPage').style.display = 'block'; };
window.goBack = () => { document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); const pp = document.querySelector('.profile-page'); if (pp) { pp.style.display = 'block'; pp.classList.add('active'); } };
window.selectAvatar = t => { const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; const e = m[t] || '👤'; document.getElementById('profileAvatarEmoji').textContent = e; document.getElementById('currentAvatarEmoji').textContent = e; if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ avatarType: t }); closeModal(); };
window.openAvatarModal = () => document.getElementById('avatarModal')?.classList.add('active');
window.getEmojiForUser = u => { const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; return m[u?.avatarType] || '👤'; };
window.clearMessages = () => { const c = document.getElementById('messagesContainer'); if (c) c.innerHTML = ''; };

function formatNumber(num) { if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'; if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; return num.toString(); }
async function updateTripsCount() { if (!window.auth || !window.auth.currentUser) return; try { const s = await window.db.collection('trips').where('userId', '==', window.auth.currentUser.uid).where('status', '==', 'ended').get(); const c = document.getElementById('tripsCount'); if (c) c.textContent = formatNumber(s.size); } catch (error) {} }
function ensureSinglePage() { document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); document.querySelectorAll('.page').forEach(p => { p.style.display = p.classList.contains('active') ? 'block' : 'none'; }); }
function setupNavigation() { const nav = document.querySelectorAll('.nav-item'); const pages = document.querySelectorAll('.page'); if (!nav.length || !pages.length) return; function switchPage(id) { pages.forEach(p => p.classList.remove('active')); const t = document.querySelector(`.page.${id}-page`); if (t) { t.classList.add('active'); t.style.display = 'block'; } pages.forEach(p => { if (!p.classList.contains('active')) p.style.display = 'none'; }); document.querySelectorAll('.profile-subpage').forEach(s => s.style.display = 'none'); if (id === 'chat') loadChats(); document.body.classList.remove('conversation-open'); nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); } nav.forEach(n => n.addEventListener('click', () => switchPage(n.dataset.page))); }
function setupModals() { window.openLanguageModal = () => document.getElementById('languageModal')?.classList.add('active'); window.closeModal = () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); })); document.querySelectorAll('.settings-item').forEach(i => { if (i.querySelector('[data-i18n="language"]')) i.addEventListener('click', openLanguageModal); }); }

document.addEventListener('DOMContentLoaded', () => { ensureSinglePage(); setupNavigation(); setupModals(); loadChats(); setupChatListeners(); updateTripsCount(); });
window.addEventListener('authReady', async () => { if (window.auth?.currentUser) { await SecureChatSystem.init(); } });
window.addEventListener('beforeunload', () => { PresenceSystem.setOffline(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { PresenceSystem.setOffline(); } else { PresenceSystem.setOnline(); } });
if ('Notification' in window) Notification.requestPermission();
