// ========== نظام التشفير E2EE + ضغط + حذف 24 ساعة ==========
const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    
    async init() {
        if (!window.auth?.currentUser) { console.warn('⚠️ لا يوجد مستخدم مسجل'); return false; }
        try { await this.setupKeys(); this.startReceiving(); console.log('✅ نظام التشفير E2EE جاهز'); return true; } catch (error) { console.error('❌ فشل تهيئة التشفير:', error); return false; }
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
            else if (msg.package.type === 'voice') { const d = await this.decryptData(msg.package.data, sharedKey); ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'voice', data: d, sender: 'friend', time: new Date().toISOString() }); if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from); ChatSystem.updateLastMessage(msg.from, '🎤 بصمة'); }
            else if (msg.package.type === 'image') { const d = await this.decryptData(msg.package.data, sharedKey); ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'image', data: d, sender: 'friend', time: new Date().toISOString() }); if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from); ChatSystem.updateLastMessage(msg.from, '📷 صورة'); }
            else if (msg.package.type === 'video') { const d = await this.decryptData(msg.package.data, sharedKey); ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'video', data: d, sender: 'friend', time: new Date().toISOString() }); if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from); ChatSystem.updateLastMessage(msg.from, '🎥 فيديو'); }
            else if (msg.package.type === 'file') { const d = await this.decryptData(msg.package.data, sharedKey); ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'file', data: d, fileName: msg.package.fileName, sender: 'friend', time: new Date().toISOString() }); if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from); ChatSystem.updateLastMessage(msg.from, '📎 ملف'); }
            loadChats();
        } catch (error) {}
    }
};

document.addEventListener('DOMContentLoaded', () => { ensureSinglePage(); setupNavigation(); setupModals(); loadChats(); setupChatListeners(); updateTripsCount(); if (window.auth?.currentUser) SecureChatSystem.init(); });

function formatNumber(num) { if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'; if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; return num.toString(); }
async function updateTripsCount() { if (!window.auth || !window.auth.currentUser) return; try { const s = await window.db.collection('trips').where('userId', '==', window.auth.currentUser.uid).where('status', '==', 'ended').get(); const c = document.getElementById('tripsCount'); if (c) c.textContent = formatNumber(s.size); } catch (error) {} }
function ensureSinglePage() { document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); document.querySelectorAll('.page').forEach(p => { p.style.display = p.classList.contains('active') ? 'block' : 'none'; }); }
function setupNavigation() { const nav = document.querySelectorAll('.nav-item'); const pages = document.querySelectorAll('.page'); if (!nav.length || !pages.length) return; function switchPage(id) { pages.forEach(p => p.classList.remove('active')); const t = document.querySelector(`.page.${id}-page`); if (t) { t.classList.add('active'); t.style.display = 'block'; } pages.forEach(p => { if (!p.classList.contains('active')) p.style.display = 'none'; }); document.querySelectorAll('.profile-subpage').forEach(s => s.style.display = 'none'); if (id === 'chat') loadChats(); document.body.classList.remove('conversation-open'); nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); } nav.forEach(n => n.addEventListener('click', () => switchPage(n.dataset.page))); }
function setupModals() { window.openLanguageModal = () => document.getElementById('languageModal')?.classList.add('active'); window.closeModal = () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); })); document.querySelectorAll('.settings-item').forEach(i => { if (i.querySelector('[data-i18n="language"]')) i.addEventListener('click', openLanguageModal); }); }

// ========== نظام الدردشة E2EE ==========
const ChatSystem = {
    currentChat: null, messages: {},
    init() { this.loadAllChats(); },
    loadAllChats() { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('chat_')) { const fid = k.replace('chat_', ''); try { this.messages[fid] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { this.messages[fid] = []; } } } },
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId; document.body.classList.add('conversation-open');
        document.getElementById('conversationName').textContent = friendName;
        document.getElementById('conversationAvatar').textContent = friendAvatar || '👤';
        document.getElementById('conversationStatus').textContent = '';
        document.querySelector('.chat-page').style.display = 'none'; document.getElementById('conversationPage').style.display = 'flex';
        this.displayMessages(friendId);
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
    },
    displayMessages(friendId) { const c = document.getElementById('messagesContainer'); if (!c) return; c.innerHTML = ''; (this.messages[friendId] || []).forEach(m => this.displayMessage(m)); },
    displayMessage(msg) {
        const c = document.getElementById('messagesContainer'); if (!c) return;
        const div = document.createElement('div'); div.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`; div.id = `msg-${msg.id}`;
        const time = new Date(msg.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        let statusHtml = ''; if (msg.sender === 'me') { let icon = '✓', cls = 'sent'; if (msg.status === 'delivered') { icon = '✓✓'; cls = 'delivered'; } else if (msg.status === 'read') { icon = '✓✓'; cls = 'read'; } statusHtml = `<span class="message-status ${cls}">${icon}</span>`; }
        
        if (msg.type === 'text') {
            div.innerHTML = `<div class="message-content">${this.escapeHtml(msg.text)}</div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        } else if (msg.type === 'image') {
            div.innerHTML = `<div class="msg-media-wrapper" onclick="viewMedia('${msg.data}', 'image')"><img src="${msg.data}" class="message-image" loading="lazy"><button class="msg-download-btn" onclick="event.stopPropagation(); downloadMedia('${msg.data}', 'rafeeq_image_${msg.id}.jpg')"><i class="fas fa-download"></i></button></div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        } else if (msg.type === 'video') {
            div.innerHTML = `<div class="msg-media-wrapper" onclick="viewMedia('${msg.data}', 'video')"><video src="${msg.data}" class="message-video" preload="metadata"></video><div class="msg-play-overlay"><i class="fas fa-play-circle"></i></div><button class="msg-download-btn" onclick="event.stopPropagation(); downloadMedia('${msg.data}', 'rafeeq_video_${msg.id}.webm')"><i class="fas fa-download"></i></button></div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        } else if (msg.type === 'voice') {
            div.innerHTML = `<audio controls src="${msg.data}" class="message-audio"></audio><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        } else if (msg.type === 'file') {
            div.innerHTML = `<div class="msg-file-wrapper" onclick="downloadMedia('${msg.data}', '${msg.fileName || 'rafeeq_file'}')"><div class="msg-file-icon"><i class="fas fa-file"></i></div><div class="msg-file-info"><span class="msg-file-name">${msg.fileName || 'ملف'}</span><span class="msg-file-size">اضغط للتنزيل</span></div><button class="msg-download-btn" onclick="event.stopPropagation(); downloadMedia('${msg.data}', '${msg.fileName || 'rafeeq_file'}')"><i class="fas fa-download"></i></button></div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        }
        c.appendChild(div); c.scrollTop = c.scrollHeight;
    },
    async sendMessage(text) { if (!this.currentChat || !text.trim()) return false; const mid = Date.now().toString(); try { const pr = await SecureChatSystem.getMyPrivateKey(); const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); if (!pr || !pu) return false; const sk = await SecureChatSystem.deriveSharedKey(pr, pu); const enc = await SecureChatSystem.encryptData(text, sk); await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'text', data: enc, timestamp: Date.now() }); this.saveMessage(this.currentChat, { id: mid, type: 'text', text, sender: 'me', time: new Date().toISOString(), status: 'sent' }); this.displayMessage({ id: mid, type: 'text', text, sender: 'me', time: new Date().toISOString(), status: 'sent' }); return true; } catch (e) { return false; } },
    async sendImage(file) { if (!this.currentChat) return; const mid = Date.now().toString(); try { const comp = await SecureChatSystem.compressImage(file); const b64 = await SecureChatSystem.fileToBase64(comp); const pr = await SecureChatSystem.getMyPrivateKey(); const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); if (!pr || !pu) return; const sk = await SecureChatSystem.deriveSharedKey(pr, pu); const enc = await SecureChatSystem.encryptData(b64, sk); await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'image', data: enc, timestamp: Date.now() }); this.saveMessage(this.currentChat, { id: mid, type: 'image', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' }); this.displayMessage({ id: mid, type: 'image', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' }); } catch (e) {} },
    async sendVoiceNote(audioBlob) { if (!this.currentChat) return; const mid = Date.now().toString(); try { const b64 = await SecureChatSystem.fileToBase64(audioBlob); const pr = await SecureChatSystem.getMyPrivateKey(); const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); if (!pr || !pu) return; const sk = await SecureChatSystem.deriveSharedKey(pr, pu); const enc = await SecureChatSystem.encryptData(b64, sk); await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'voice', data: enc, timestamp: Date.now() }); this.saveMessage(this.currentChat, { id: mid, type: 'voice', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' }); this.displayMessage({ id: mid, type: 'voice', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' }); } catch (e) {} },
    async sendVideo(file) { if (!this.currentChat) return; const mid = Date.now().toString(); try { const b64 = await SecureChatSystem.fileToBase64(file); const pr = await SecureChatSystem.getMyPrivateKey(); const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); if (!pr || !pu) return; const sk = await SecureChatSystem.deriveSharedKey(pr, pu); const enc = await SecureChatSystem.encryptData(b64, sk); await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'video', data: enc, timestamp: Date.now() }); this.saveMessage(this.currentChat, { id: mid, type: 'video', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' }); this.displayMessage({ id: mid, type: 'video', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' }); } catch (e) {} },
    async sendFile(file) { if (!this.currentChat) return; const mid = Date.now().toString(); try { const b64 = await SecureChatSystem.fileToBase64(file); const pr = await SecureChatSystem.getMyPrivateKey(); const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); if (!pr || !pu) return; const sk = await SecureChatSystem.deriveSharedKey(pr, pu); const enc = await SecureChatSystem.encryptData(b64, sk); await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'file', data: enc, fileName: file.name, timestamp: Date.now() }); this.saveMessage(this.currentChat, { id: mid, type: 'file', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' }); this.displayMessage({ id: mid, type: 'file', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' }); } catch (e) {} },
    saveMessage(friendId, message) { const key = `chat_${friendId}`; let h = []; try { h = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { h = []; } h.push(message); if (h.length > 100) h = h.slice(-100); localStorage.setItem(key, JSON.stringify(h)); this.messages[friendId] = h; },
    updateLastMessage(friendId, lastMessage) { document.querySelectorAll('.chat-item').forEach(item => { if (item.getAttribute('onclick')?.includes(friendId)) { const lm = item.querySelector('.last-message'); const tm = item.querySelector('.chat-time'); if (lm) lm.textContent = lastMessage; if (tm) tm.textContent = 'الآن'; } }); },
    closeChat() { document.body.classList.remove('conversation-open'); document.getElementById('conversationPage').style.display = 'none'; document.querySelector('.chat-page').style.display = 'block'; this.currentChat = null; },
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
};
ChatSystem.init();

async function loadChats() { if (!window.auth || !window.auth.currentUser) return; const list = document.getElementById('chatsList'); if (!list) return; try { const udoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); if (!udoc.exists) return; const friends = udoc.data().friends || []; if (!friends.length) { list.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3><p>أضف أصدقاء لبدء المحادثة</p></div>`; return; } let html = ''; for (const fid of friends) { try { const fdoc = await window.db.collection('users').doc(fid).get(); if (fdoc.exists) { const f = fdoc.data(); const key = `chat_${fid}`; let lm = 'اضغط لبدء المحادثة', lt = ''; try { const h = JSON.parse(localStorage.getItem(key)) || []; if (h.length > 0) { const l = h[h.length - 1]; if (l.type === 'text') lm = l.text; else if (l.type === 'image') lm = '📷 صورة'; else if (l.type === 'voice') lm = '🎤 بصمة'; else if (l.type === 'video') lm = '🎥 فيديو'; else if (l.type === 'file') lm = '📎 ملف'; lt = new Date(l.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); } } catch (e) {} html += `<div class="chat-item" onclick="openChat('${fid}')"><div class="chat-avatar-emoji">${window.getEmojiForUser(f)}</div><div class="chat-info"><h4>${f.name || 'مستخدم'}</h4><p class="last-message">${lm}</p></div><div class="chat-meta"><span class="chat-time">${lt || ''}</span></div></div>`; } } catch (e) {} } list.innerHTML = html; } catch (e) {} }

function setupChatListeners() { document.addEventListener('click', e => { const m = document.getElementById('attachmentMenu'); const ab = document.querySelector('.attach-btn'); if (m && ab && !m.contains(e.target) && !ab.contains(e.target)) m.style.display = 'none'; const ep = document.getElementById('emojiPicker'); const eb = document.querySelector('.emoji-btn'); if (ep && eb && !ep.contains(e.target) && !eb.contains(e.target)) ep.style.display = 'none'; }); }

// ========== دوال عامة ==========
window.openChat = friendId => { window.db.collection('users').doc(friendId).get().then(doc => { if (doc.exists) { const f = doc.data(); ChatSystem.openChat(friendId, f.name, window.getEmojiForUser ? window.getEmojiForUser(f) : '👤'); } }); };
window.sendMessage = () => { const inp = document.getElementById('messageInput'); if (inp.value.trim()) { ChatSystem.sendMessage(inp.value.trim()).then(s => { if (s) inp.value = ''; }); } };
window.handleMessageKeyPress = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMessage(); } };
window.showAttachmentMenu = () => { const m = document.getElementById('attachmentMenu'); m.style.display = m.style.display === 'none' ? 'flex' : 'none'; document.getElementById('emojiPicker').style.display = 'none'; };
window.showEmojiPicker = () => { const p = document.getElementById('emojiPicker'); p.style.display = p.style.display === 'none' ? 'block' : 'none'; document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendImage = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = e => { const f = e.target.files[0]; if (f && ChatSystem.currentChat) ChatSystem.sendImage(f); }; i.click(); document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendVideo = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*'; i.onchange = e => { const f = e.target.files[0]; if (f && ChatSystem.currentChat) ChatSystem.sendVideo(f); }; i.click(); document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendFile = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '*/*'; i.onchange = e => { const f = e.target.files[0]; if (f && ChatSystem.currentChat) ChatSystem.sendFile(f); }; i.click(); document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendVoiceNote = () => { navigator.mediaDevices.getUserMedia({ audio: true }).then(s => { const mr = new MediaRecorder(s); const ch = []; mr.ondataavailable = e => ch.push(e.data); mr.onstop = () => { ChatSystem.sendVoiceNote(new Blob(ch, { type: 'audio/webm' })); s.getTracks().forEach(t => t.stop()); }; mr.start(); const sb = document.querySelector('.send-btn'), vb = document.querySelector('.voice-btn'); if (sb) sb.style.display = 'none'; if (vb) { vb.style.display = 'flex'; vb.onclick = () => { if (mr.state === 'recording') { mr.stop(); sb.style.display = 'flex'; vb.style.display = 'none'; } }; } setTimeout(() => { if (mr.state === 'recording') { mr.stop(); if (sb) sb.style.display = 'flex'; if (vb) vb.style.display = 'none'; } }, 60000); }); document.getElementById('attachmentMenu').style.display = 'none'; };
window.shareLocation = () => { if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => ChatSystem.sendMessage(`📍 موقعي: https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`)); document.getElementById('attachmentMenu').style.display = 'none'; };
window.closeConversation = () => ChatSystem.closeChat();
window.viewContactInfo = () => { /* تم إزالة معلومات الاتصال */ };

// ========== عارض الوسائط والتنزيل ==========
window.viewMedia = function(src, type) {
    const modal = document.createElement('div');
    modal.className = 'media-viewer';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    if (type === 'image') {
        modal.innerHTML = `<img src="${src}" style="max-width:95%;max-height:95%;border-radius:12px;object-fit:contain;">`;
    } else {
        modal.innerHTML = `<video src="${src}" controls autoplay style="max-width:95%;max-height:95%;border-radius:12px;"></video>`;
    }
    const closeBtn = document.createElement('button');
    closeBtn.className = 'media-viewer-close';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.onclick = () => modal.remove();
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);
};

window.downloadMedia = function(base64, filename) {
    const link = document.createElement('a');
    link.href = base64;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.openEditProfileModal = () => { document.getElementById('editName').value = document.getElementById('profileName').textContent; document.getElementById('currentAvatarEmoji').textContent = document.getElementById('profileAvatarEmoji').textContent; document.getElementById('editProfileModal').classList.add('active'); };
window.saveProfile = () => { const n = document.getElementById('editName').value.trim(); if (!n || n.length > 25) return; if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ name: n }).then(() => { document.getElementById('profileName').textContent = n; closeModal(); }); };
window.showUserTrips = () => { document.querySelector('.profile-page').style.display = 'none'; document.getElementById('tripsPage').style.display = 'block'; };
window.goBack = () => { document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); const pp = document.querySelector('.profile-page'); if (pp) { pp.style.display = 'block'; pp.classList.add('active'); } };
window.selectAvatar = t => { const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; const e = m[t] || '👤'; document.getElementById('profileAvatarEmoji').textContent = e; document.getElementById('currentAvatarEmoji').textContent = e; if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ avatarType: t }); closeModal(); };
window.openAvatarModal = () => document.getElementById('avatarModal')?.classList.add('active');
window.getEmojiForUser = u => { const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; return m[u?.avatarType] || '👤'; };
window.clearMessages = () => { const c = document.getElementById('messagesContainer'); if (c) c.innerHTML = ''; };
if ('Notification' in window) Notification.requestPermission();
console.log('✅ جاهز - E2EE + عارض وسائط + تنزيل');
