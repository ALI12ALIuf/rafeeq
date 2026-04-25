// ========== نظام التشفير E2EE + ضغط + حذف 24 ساعة ==========
const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    
    async init() { if (!window.auth?.currentUser) return false; try { await this.setupKeys(); this.startReceiving(); return true; } catch (e) { return false; } },
    async setupKeys() { if (!localStorage.getItem('enc_private_key')) { const kp = await this.generateKeyPair(); const pk = await this.exportPublicKey(kp.publicKey); await window.db.collection('users').doc(window.auth.currentUser.uid).update({ publicKey: pk }); localStorage.setItem('enc_private_key', btoa(String.fromCharCode(...new Uint8Array(await window.crypto.subtle.exportKey('pkcs8', kp.privateKey))))); } },
    async generateKeyPair() { return await window.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']); },
    async exportPublicKey(k) { return btoa(String.fromCharCode(...new Uint8Array(await window.crypto.subtle.exportKey('raw', k)))); },
    async importPublicKey(b64) { return await window.crypto.subtle.importKey('raw', Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { name: 'ECDH', namedCurve: 'P-256' }, true, []); },
    async getMyPrivateKey() { const s = localStorage.getItem('enc_private_key'); if (!s) return null; return await window.crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(s), c => c.charCodeAt(0)), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']); },
    async getReceiverPublicKey(uid) { const d = await window.db.collection('users').doc(uid).get(); return (d.exists && d.data().publicKey) ? await this.importPublicKey(d.data().publicKey) : null; },
    async deriveSharedKey(pr, pu) { return await window.crypto.subtle.deriveKey({ name: 'ECDH', public: pu }, pr, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); },
    
    async encryptData(data, sharedKey) {
        const enc = new TextEncoder(); const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const e = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('rfq') }, sharedKey, typeof data === 'string' ? enc.encode(data) : data);
        const c = new Uint8Array(iv.length + e.byteLength); c.set(iv); c.set(new Uint8Array(e), iv.length);
        return btoa(String.fromCharCode(...c));
    },
    
    async decryptData(b64, sharedKey) {
        const enc = new TextEncoder(); const c = Uint8Array.from(atob(b64), x => x.charCodeAt(0));
        const d = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: c.slice(0, 12), additionalData: enc.encode('rfq') }, sharedKey, c.slice(12));
        return new TextDecoder().decode(d);
    },
    
    async compressImage(f) { return new Promise(r => { const i = new Image(), cv = document.createElement('canvas'), cx = cv.getContext('2d'); i.onload = () => { let w = i.width, h = i.height; if (w > 1200 || h > 1200) { if (w > h) { h *= 1200 / w; w = 1200; } else { w *= 1200 / h; h = 1200; } } cv.width = w; cv.height = h; cx.drawImage(i, 0, 0, w, h); cv.toBlob(r, 'image/jpeg', 0.8); }; i.src = URL.createObjectURL(f); }); },
    fileToBase64(b) { return new Promise(r => { const fr = new FileReader(); fr.onloadend = () => r(fr.result); fr.readAsDataURL(b); }); },
    
    async sendToServer(rid, pkg) { await window.db.collection('secure_messages').add({ to: rid, from: window.auth.currentUser.uid, package: pkg, timestamp: firebase.firestore.FieldValue.serverTimestamp(), expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + this.MESSAGE_EXPIRY_HOURS * 3600000)) }); },
    
    startReceiving() { if (!window.auth?.currentUser) return; window.db.collection('secure_messages').where('to', '==', window.auth.currentUser.uid).onSnapshot(async s => { for (const c of s.docChanges()) { if (c.type === 'added') { const m = { id: c.doc.id, ...c.doc.data() }; await this.processReceivedMessage(m); await c.doc.ref.delete(); } } }); },
    
    async processReceivedMessage(msg) {
        try {
            const pr = await this.getMyPrivateKey(), pu = await this.getReceiverPublicKey(msg.from);
            if (!pr || !pu) return;
            const sk = await this.deriveSharedKey(pr, pu);
            
            if (msg.package.type === 'text') { const d = await this.decryptData(msg.package.data, sk); ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'text', text: d, sender: 'friend', time: new Date().toISOString() }); if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from); ChatSystem.updateLastMessage(msg.from, d); }
            else if (msg.package.type === 'p2p') {
                const d = JSON.parse(await this.decryptData(msg.package.data, sk));
                if (d.type === 'call-offer') { P2PSystem.showIncomingCall(msg.from, d); }
                else if (d.type === 'call-accept') { P2PSystem.handleAnswer(d); }
                else if (d.type === 'call-reject') { P2PSystem.handleReject(); }
                else if (d.type === 'file-offer') {
                    const name = document.querySelector('#conversationName')?.textContent || 'صديق';
                    const typeMap = { image: '📷 صورة', voice: '🎤 بصمة', video: '🎥 فيديو', file: '📎 ملف' };
                    if (confirm(`${name} يرسل ${typeMap[d.fileType]||'📎 ملف'} (${(d.size/1024).toFixed(1)}KB) - استلام؟`)) {
                        P2PSystem.handleFileOffer(msg.from, d);
                    }
                }
                else if (d.type === 'file-accept') { P2PSystem.handleFileAccept(d); }
                else if (d.type === 'file-complete') { P2PSystem.receiveComplete(d); }
                else if (d.type === 'ice-candidate' || d.type === 'answer') { P2PSystem.handleSignaling(d); }
            }
            loadChats();
        } catch (e) { console.error(e); }
    }
};

// ========== نظام P2P متكامل ==========
const P2PSystem = {
    pc: null, dc: null, localStream: null, isInCall: false, pendingFile: null, pendingFileInfo: null, receiveBuffer: [], receiveInfo: null,
    
    iceServers: { iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
    ]},
    
    async ensureConnection(peerId) {
        if (this.pc && this.pc.connectionState === 'connected' && this.dc && this.dc.readyState === 'open') return true;
        await this.createConnection(peerId);
        return new Promise(resolve => {
            const check = setInterval(() => {
                if (this.pc && this.pc.connectionState === 'connected' && this.dc && this.dc.readyState === 'open') {
                    clearInterval(check); resolve(true);
                }
            }, 200);
            setTimeout(() => { clearInterval(check); resolve(false); }, 10000);
        });
    },
    
    async createConnection(peerId) {
        if (this.pc) { this.pc.close(); this.pc = null; }
        this.pc = new RTCPeerConnection(this.iceServers);
        this.pc.onicecandidate = e => { if (e.candidate) this.sendP2PMsg(peerId, { type: 'ice-candidate', candidate: e.candidate }); };
        this.pc.ondatachannel = e => { this.dc = e.channel; this.setupDataChannel(); };
        this.dc = this.pc.createDataChannel('fileTransfer');
        this.setupDataChannel();
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.sendP2PMsg(peerId, { type: 'answer', sdp: this.pc.localDescription });
    },
    
    setupDataChannel() {
        if (!this.dc) return;
        this.dc.onopen = () => console.log('✅ قناة بيانات مفتوحة');
        this.dc.onmessage = e => {
            try { const msg = JSON.parse(e.data); if (msg.type === 'file-complete') { this.receiveComplete(msg); } } catch (ex) {}
        };
    },
    
    async startCall(peerId) {
        if (this.isInCall) return; this.isInCall = true;
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.showCallUI();
            if (!this.pc || this.pc.connectionState !== 'connected') await this.createConnection(peerId);
            this.pc.ontrack = e => { const rv = document.getElementById('remoteAudio'); if (rv) rv.srcObject = e.streams[0]; };
            this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream));
            const offer = await this.pc.createOffer(); await this.pc.setLocalDescription(offer);
            this.sendP2PMsg(peerId, { type: 'call-offer', sdp: this.pc.localDescription });
        } catch (e) { this.endCall(); }
    },
    
    showIncomingCall(callerId, data) {
        const name = document.querySelector('#conversationName')?.textContent || 'صديق';
        const ov = document.createElement('div'); ov.id = 'incomingCall';
        ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;';
        ov.innerHTML = `<div style="font-size:1.5rem;">📞 ${name} يتصل بك...</div><div style="display:flex;gap:30px;"><button id="btnAccept" style="width:70px;height:70px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;">✅</button><button id="btnReject" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;">❌</button></div>`;
        document.body.appendChild(ov);
        document.getElementById('btnAccept').onclick = () => { ov.remove(); this.acceptCall(callerId, data); };
        document.getElementById('btnReject').onclick = () => { ov.remove(); this.sendP2PMsg(callerId, { type: 'call-reject' }); };
    },
    
    async acceptCall(peerId, data) {
        this.isInCall = true;
        try {
            if (!this.pc || this.pc.connectionState !== 'connected') await this.createConnection(peerId);
            this.pc.ontrack = e => { const rv = document.getElementById('remoteAudio'); if (rv) rv.srcObject = e.streams[0]; };
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream));
            this.showCallUI();
            if (data.sdp) { await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); const ans = await this.pc.createAnswer(); await this.pc.setLocalDescription(ans); this.sendP2PMsg(peerId, { type: 'call-accept', sdp: this.pc.localDescription }); }
        } catch (e) { this.endCall(); }
    },
    
    async handleAnswer(data) { try { if (this.pc && data.sdp) await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); } catch (e) {} },
    handleReject() { this.endCall(); alert('تم رفض المكالمة'); },
    async handleSignaling(data) { try { if (!this.pc) return; if (data.sdp) { await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); if (data.sdp.type === 'offer') { const ans = await this.pc.createAnswer(); await this.pc.setLocalDescription(ans); } } else if (data.candidate) { await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } } catch (e) {} },
    
    showCallUI() {
        document.body.classList.add('in-call');
        const ui = document.createElement('div'); ui.id = 'callUI';
        ui.innerHTML = `<audio id="remoteAudio" autoplay playsinline style="display:none;"></audio><div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;color:white;font-size:1.2rem;">🔊 مكالمة صوتية</div><div style="position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:30px;"><button onclick="P2PSystem.toggleAudio()" style="width:50px;height:50px;border-radius:50%;background:#333;color:white;border:none;font-size:1.2rem;cursor:pointer;">🎤</button><button onclick="P2PSystem.endCall()" style="width:60px;height:60px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.5rem;cursor:pointer;">📞</button></div>`;
        document.body.appendChild(ui);
    },
    
    toggleAudio() { if (this.localStream) { const t = this.localStream.getAudioTracks()[0]; if (t) t.enabled = !t.enabled; } },
    endCall() { this.isInCall = false; document.body.classList.remove('in-call'); if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; } ['callUI','incomingCall'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); }); },
    
    async sendFileP2P(peerId, file, fileType) { this.pendingFile = file; this.pendingFileInfo = { name: file.name, type: fileType, size: file.size }; this.sendP2PMsg(peerId, { type: 'file-offer', fileType, name: file.name, size: file.size }); },
    async handleFileOffer(senderId, info) { this.receiveBuffer = []; this.receiveInfo = info; this.sendP2PMsg(senderId, { type: 'file-accept' }); },
    async handleFileAccept(data) {
        if (!this.pendingFile || !this.dc || this.dc.readyState !== 'open') return;
        const chunkSize = 16384; let offset = 0;
        const sendChunk = () => {
            if (offset >= this.pendingFile.size) { this.dc.send(JSON.stringify({ type: 'file-complete', fileType: this.pendingFileInfo.type, fileName: this.pendingFileInfo.name })); this.showSentFile(this.pendingFileInfo); this.pendingFile = null; this.pendingFileInfo = null; return; }
            const end = Math.min(offset + chunkSize, this.pendingFile.size);
            const reader = new FileReader(); reader.onload = () => { this.dc.send(JSON.stringify({ type: 'file-chunk', data: reader.result })); offset = end; setTimeout(sendChunk, 10); };
            reader.readAsDataURL(this.pendingFile.slice(offset, end));
        };
        sendChunk();
    },
    
    receiveComplete(msg) {
        let fullData = (this.receiveBuffer && this.receiveBuffer.length > 0) ? this.receiveBuffer.join('') : (msg.data || '');
        this.receiveBuffer = [];
        const messageObj = { id: Date.now().toString(), type: msg.fileType || this.receiveInfo?.type || 'file', data: fullData, fileName: msg.fileName || this.receiveInfo?.name || 'ملف', sender: 'friend', time: new Date().toISOString() };
        const cc = ChatSystem.currentChat; ChatSystem.saveMessage(cc, messageObj); ChatSystem.displayMessages(cc);
        const tm = { image:'📷 صورة', voice:'🎤 بصمة', video:'🎥 فيديو', file:'📎 ملف' };
        ChatSystem.updateLastMessage(cc, tm[msg.fileType]||'📎 ملف'); loadChats();
    },
    
    showSentFile(info) {
        const reader = new FileReader(); reader.onload = () => {
            const msg = { id: Date.now().toString(), type: info.type, data: reader.result, fileName: info.name, sender: 'me', time: new Date().toISOString(), status: 'sent' };
            ChatSystem.saveMessage(ChatSystem.currentChat, msg); ChatSystem.displayMessages(ChatSystem.currentChat);
            const tm = { image:'📷 صورة', voice:'🎤 بصمة', video:'🎥 فيديو', file:'📎 ملف' };
            ChatSystem.updateLastMessage(ChatSystem.currentChat, tm[info.type]||'📎 ملف'); loadChats();
        };
        reader.readAsDataURL(this.pendingFile);
    },
    
    async sendP2PMsg(peerId, data) { const pr = await SecureChatSystem.getMyPrivateKey(), pu = await SecureChatSystem.getReceiverPublicKey(peerId); if (!pr || !pu) return; const sk = await SecureChatSystem.deriveSharedKey(pr, pu); const enc = await SecureChatSystem.encryptData(JSON.stringify(data), sk); await SecureChatSystem.sendToServer(peerId, { id: Date.now().toString(), type: 'p2p', data: enc, timestamp: Date.now() }); }
};

window.startAudioCall = async () => { if (ChatSystem.currentChat) await P2PSystem.startCall(ChatSystem.currentChat); };

document.addEventListener('DOMContentLoaded', () => { ensureSinglePage(); setupNavigation(); setupModals(); loadChats(); setupChatListeners(); updateTripsCount(); if (window.auth?.currentUser) SecureChatSystem.init(); });

function formatNumber(num) { if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'; if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; return num.toString(); }
async function updateTripsCount() { if (!window.auth?.currentUser) return; try { const s = await window.db.collection('trips').where('userId', '==', window.auth.currentUser.uid).where('status', '==', 'ended').get(); const c = document.getElementById('tripsCount'); if (c) c.textContent = formatNumber(s.size); } catch (e) {} }
function ensureSinglePage() { document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); document.querySelectorAll('.page').forEach(p => { p.style.display = p.classList.contains('active') ? 'block' : 'none'; }); }
function setupNavigation() { const n = document.querySelectorAll('.nav-item'), p = document.querySelectorAll('.page'); if (!n.length || !p.length) return; function s(id) { p.forEach(x => x.classList.remove('active')); const t = document.querySelector(`.page.${id}-page`); if (t) { t.classList.add('active'); t.style.display = 'block'; } p.forEach(x => { if (!x.classList.contains('active')) x.style.display = 'none'; }); document.querySelectorAll('.profile-subpage').forEach(x => x.style.display = 'none'); if (id === 'chat') loadChats(); document.body.classList.remove('conversation-open'); n.forEach(x => x.classList.toggle('active', x.dataset.page === id)); } n.forEach(x => x.addEventListener('click', () => s(x.dataset.page))); }
function setupModals() { window.openLanguageModal = () => document.getElementById('languageModal')?.classList.add('active'); window.closeModal = () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); })); }

const ChatSystem = {
    currentChat: null, messages: {},
    init() { this.loadAllChats(); },
    loadAllChats() { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('chat_')) { const f = k.replace('chat_', ''); try { this.messages[f] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { this.messages[f] = []; } } } },
    openChat(fid, name, av) { 
        this.currentChat = fid; document.body.classList.add('conversation-open');
        document.getElementById('conversationName').textContent = name;
        document.getElementById('conversationAvatar').textContent = av || '👤';
        document.querySelector('.chat-page').style.display = 'none'; document.getElementById('conversationPage').style.display = 'flex';
        this.displayMessages(fid);
        // فتح اتصال P2P تلقائياً
        P2PSystem.ensureConnection(fid).then(c => { if (c) console.log('✅ P2P جاهز'); });
        setTimeout(() => { const i = document.getElementById('messageInput'); if (i) i.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
    },
    displayMessages(fid) { const c = document.getElementById('messagesContainer'); if (!c) return; c.innerHTML = ''; (this.messages[fid] || []).forEach(m => this.displayMessage(m)); },
    displayMessage(msg) {
        const c = document.getElementById('messagesContainer'); if (!c) return;
        const d = document.createElement('div'); d.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`; d.id = `msg-${msg.id}`;
        const t = new Date(msg.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        let sh = ''; if (msg.sender === 'me') { let ic = '✓', cl = 'sent'; if (msg.status === 'delivered') { ic = '✓✓'; cl = 'delivered'; } else if (msg.status === 'read') { ic = '✓✓'; cl = 'read'; } sh = `<span class="message-status ${cl}">${ic}</span>`; }
        if (msg.type === 'text') d.innerHTML = `<div class="message-content">${this.escapeHtml(msg.text)}</div><div class="message-info"><span class="message-time">${t}</span>${sh}</div>`;
        else if (msg.type === 'image') d.innerHTML = `<img src="${msg.data}" class="message-image"><div class="message-info"><span class="message-time">${t}</span>${sh}</div>`;
        else if (msg.type === 'voice') d.innerHTML = `<audio controls src="${msg.data}" class="message-audio"></audio><div class="message-info"><span class="message-time">${t}</span>${sh}</div>`;
        else if (msg.type === 'video') d.innerHTML = `<video controls src="${msg.data}" style="max-width:250px;border-radius:12px;"></video><div class="message-info"><span class="message-time">${t}</span>${sh}</div>`;
        else if (msg.type === 'file') d.innerHTML = `<div class="message-content" onclick="window.open('${msg.data}')" style="cursor:pointer;">📎 ${msg.fileName||'ملف'}</div><div class="message-info"><span class="message-time">${t}</span>${sh}</div>`;
        c.appendChild(d); c.scrollTop = c.scrollHeight;
    },
    async sendMessage(text) { if (!this.currentChat || !text.trim()) return false; const mid = Date.now().toString(); try { const pr = await SecureChatSystem.getMyPrivateKey(), pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); if (!pr || !pu) return false; const sk = await SecureChatSystem.deriveSharedKey(pr, pu); const enc = await SecureChatSystem.encryptData(text, sk); await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'text', data: enc, timestamp: Date.now() }); this.saveMessage(this.currentChat, { id: mid, type: 'text', text, sender: 'me', time: new Date().toISOString(), status: 'sent' }); this.displayMessage({ id: mid, type: 'text', text, sender: 'me', time: new Date().toISOString(), status: 'sent' }); return true; } catch (e) { return false; } },
    
    async sendFileP2POnly(file, fileType) {
        if (!this.currentChat) return;
        if (P2PSystem.dc && P2PSystem.dc.readyState === 'open') {
            console.log('🚀 إرسال P2P مباشر');
            await P2PSystem.sendFileP2P(this.currentChat, file, fileType);
        } else {
            alert('⚠️ انتظر قليلاً... جاري الاتصال. حاول مرة أخرى.');
        }
    },
    
    async sendImage(file) { if (!this.currentChat) return; const comp = await SecureChatSystem.compressImage(file); await this.sendFileP2POnly(comp, 'image'); },
    async sendVoiceNote(blob) { await this.sendFileP2POnly(blob, 'voice'); },
    async sendVideo(file) { await this.sendFileP2POnly(file, 'video'); },
    async sendFile(file) { await this.sendFileP2POnly(file, 'file'); },
    
    saveMessage(fid, msg) { const k = `chat_${fid}`; let h = []; try { h = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { h = []; } h.push(msg); if (h.length > 100) h = h.slice(-100); localStorage.setItem(k, JSON.stringify(h)); this.messages[fid] = h; },
    updateLastMessage(fid, lm) { document.querySelectorAll('.chat-item').forEach(i => { if (i.getAttribute('onclick')?.includes(fid)) { const l = i.querySelector('.last-message'), t = i.querySelector('.chat-time'); if (l) l.textContent = lm; if (t) t.textContent = 'الآن'; } }); },
    closeChat() { document.body.classList.remove('conversation-open'); document.getElementById('conversationPage').style.display = 'none'; document.querySelector('.chat-page').style.display = 'block'; this.currentChat = null; },
    escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
};
ChatSystem.init();

async function loadChats() { if (!window.auth?.currentUser) return; const l = document.getElementById('chatsList'); if (!l) return; try { const u = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); if (!u.exists) return; const fr = u.data().friends || []; if (!fr.length) { l.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3></div>`; return; } let h = ''; for (const f of fr) { try { const fd = await window.db.collection('users').doc(f).get(); if (fd.exists) { const d = fd.data(), k = `chat_${f}`; let lm = 'اضغط لبدء المحادثة', lt = ''; try { const hs = JSON.parse(localStorage.getItem(k)) || []; if (hs.length > 0) { const ls = hs[hs.length - 1]; lm = ls.type === 'text' ? ls.text : ls.type === 'image' ? '📷 صورة' : ls.type === 'voice' ? '🎤 بصمة' : ls.type === 'video' ? '🎥 فيديو' : ls.type === 'file' ? '📎 ملف' : lm; lt = new Date(ls.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); } } catch (e) {} h += `<div class="chat-item" onclick="openChat('${f}')"><div class="chat-avatar-emoji">${window.getEmojiForUser(d)}</div><div class="chat-info"><h4>${d.name||'مستخدم'}</h4><p class="last-message">${lm}</p></div><div class="chat-meta"><span class="chat-time">${lt||''}</span></div></div>`; } } catch (e) {} } l.innerHTML = h; } catch (e) {} }

function setupChatListeners() { document.addEventListener('click', e => { const m = document.getElementById('attachmentMenu'); if (m && !m.contains(e.target) && !e.target.closest('.attach-btn')) m.style.display = 'none'; const ep = document.getElementById('emojiPicker'); if (ep && !ep.contains(e.target) && !e.target.closest('.emoji-btn')) ep.style.display = 'none'; }); }

window.openChat = fid => { window.db.collection('users').doc(fid).get().then(d => { if (d.exists) { const f = d.data(); ChatSystem.openChat(fid, f.name, window.getEmojiForUser?.(f) || '👤'); } }); };
window.sendMessage = () => { const i = document.getElementById('messageInput'); if (i.value.trim()) { ChatSystem.sendMessage(i.value.trim()).then(s => { if (s) i.value = ''; }); } };
window.handleMessageKeyPress = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMessage(); } };
window.showAttachmentMenu = () => { const m = document.getElementById('attachmentMenu'); m.style.display = m.style.display === 'none' ? 'flex' : 'none'; document.getElementById('emojiPicker').style.display = 'none'; };
window.showEmojiPicker = () => { const p = document.getElementById('emojiPicker'); p.style.display = p.style.display === 'none' ? 'block' : 'none'; document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendImage = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = e => { if (e.target.files[0] && ChatSystem.currentChat) ChatSystem.sendImage(e.target.files[0]); }; i.click(); document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendVideo = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*'; i.onchange = e => { if (e.target.files[0] && ChatSystem.currentChat) ChatSystem.sendVideo(e.target.files[0]); }; i.click(); document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendFile = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '*/*'; i.onchange = e => { if (e.target.files[0] && ChatSystem.currentChat) ChatSystem.sendFile(e.target.files[0]); }; i.click(); document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendVoiceNote = () => { navigator.mediaDevices.getUserMedia({ audio: true }).then(s => { const mr = new MediaRecorder(s), ch = []; mr.ondataavailable = e => ch.push(e.data); mr.onstop = () => { ChatSystem.sendVoiceNote(new Blob(ch, { type: 'audio/webm' })); s.getTracks().forEach(t => t.stop()); }; mr.start(); const sb = document.querySelector('.send-btn'), vb = document.querySelector('.voice-btn'); if (sb) sb.style.display = 'none'; if (vb) { vb.style.display = 'flex'; vb.onclick = () => { if (mr.state === 'recording') { mr.stop(); sb.style.display = 'flex'; vb.style.display = 'none'; } }; } setTimeout(() => { if (mr.state === 'recording') { mr.stop(); if (sb) sb.style.display = 'flex'; if (vb) vb.style.display = 'none'; } }, 60000); }); document.getElementById('attachmentMenu').style.display = 'none'; };
window.shareLocation = () => { if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => ChatSystem.sendMessage(`📍 https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`)); document.getElementById('attachmentMenu').style.display = 'none'; };
window.closeConversation = () => { P2PSystem.endCall(); ChatSystem.closeChat(); };
window.openEditProfileModal = () => { document.getElementById('editName').value = document.getElementById('profileName').textContent; document.getElementById('currentAvatarEmoji').textContent = document.getElementById('profileAvatarEmoji').textContent; document.getElementById('editProfileModal').classList.add('active'); };
window.saveProfile = () => { const n = document.getElementById('editName').value.trim(); if (!n || n.length > 25) return; if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ name: n }).then(() => { document.getElementById('profileName').textContent = n; closeModal(); }); };
window.showUserTrips = () => { document.querySelector('.profile-page').style.display = 'none'; document.getElementById('tripsPage').style.display = 'block'; };
window.goBack = () => { document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); const pp = document.querySelector('.profile-page'); if (pp) { pp.style.display = 'block'; pp.classList.add('active'); } };
window.selectAvatar = t => { const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; const e = m[t] || '👤'; document.getElementById('profileAvatarEmoji').textContent = e; document.getElementById('currentAvatarEmoji').textContent = e; if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ avatarType: t }); closeModal(); };
window.openAvatarModal = () => document.getElementById('avatarModal')?.classList.add('active');
window.getEmojiForUser = u => { const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; return m[u?.avatarType] || '👤'; };
window.clearMessages = () => { const c = document.getElementById('messagesContainer'); if (c) c.innerHTML = ''; };
if ('Notification' in window) Notification.requestPermission();
