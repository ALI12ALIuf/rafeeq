// ========== chat-system.js ==========
// نظام الدردشة E2EE + نظام الحضور Presence

const PresenceSystem = {
    listeners: {}, heartbeatInterval: null,
    async setOnline() { if (!window.auth?.currentUser) return; try { await window.db.collection('users').doc(window.auth.currentUser.uid).update({ online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); this.startHeartbeat(); } catch (e) {} },
    async setOffline() { if (!window.auth?.currentUser) return; try { await window.db.collection('users').doc(window.auth.currentUser.uid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); this.stopHeartbeat(); } catch (e) {} },
    startHeartbeat() { this.stopHeartbeat(); this.heartbeatInterval = setInterval(() => { if (window.auth?.currentUser) window.db.collection('users').doc(window.auth.currentUser.uid).update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {}); }, 30000); },
    stopHeartbeat() { if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; } },
    watchFriend(friendId) { if (!friendId) return; if (this.listeners[friendId]) this.listeners[friendId](); this.listeners[friendId] = window.db.collection('users').doc(friendId).onSnapshot(doc => { if (doc.exists) ChatSystem.updateFriendStatus(friendId, doc.data().online === true); else ChatSystem.updateFriendStatus(friendId, false); }, () => {}); },
    stopAll() { Object.values(this.listeners).forEach(unsub => { if (typeof unsub === 'function') unsub(); }); this.listeners = {}; this.stopHeartbeat(); }
};

const ChatSystem = {
    currentChat: null, messages: {}, friendOnline: false,
    _unreadChats: {}, // متعقب الدردشات غير المقروءة
    
    init() { this.loadAllChats(); },
    
    loadAllChats() { 
        for (let i = 0; i < localStorage.length; i++) { 
            const k = localStorage.key(i); 
            if (k && k.startsWith('chat_')) { 
                const fid = k.replace('chat_', ''); 
                try { this.messages[fid] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { this.messages[fid] = []; } 
            } 
        } 
    },
    
    // ========== تحديث شارة الإشعارات ==========
    updateChatBadge() {
        let totalUnread = 0;
        for (const fid in this._unreadChats) {
            totalUnread += this._unreadChats[fid] || 0;
        }
        
        const badge = document.getElementById('chatBadge');
        if (badge) {
            if (totalUnread > 0) {
                badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
                badge.style.display = 'flex';
            } else {
                badge.textContent = '';
                badge.style.display = 'none';
            }
        }
    },
    
    // ========== إضافة رسالة غير مقروءة ==========
    addUnreadMessage(friendId) {
        if (this.currentChat === friendId) return; // إذا الدردشة مفتوحة، لا نحسبها
        this._unreadChats[friendId] = (this._unreadChats[friendId] || 0) + 1;
        this.updateChatBadge();
        this.updateChatItemUnread(friendId);
    },
    
    // ========== تحديث عنصر الدردشة ==========
    updateChatItemUnread(friendId) {
        const count = this._unreadChats[friendId] || 0;
        const chatItem = document.querySelector(`.chat-item[data-fid="${friendId}"]`);
        if (chatItem) {
            let badge = chatItem.querySelector('.chat-unread-badge');
            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'chat-unread-badge';
                    chatItem.appendChild(badge);
                }
                badge.textContent = count > 99 ? '99+' : count;
            } else {
                if (badge) badge.remove();
            }
        }
    },
    
    // ========== مسح غير المقروء عند فتح الدردشة ==========
    clearUnread(friendId) {
        this._unreadChats[friendId] = 0;
        this.updateChatBadge();
        this.updateChatItemUnread(friendId);
    },
    
    showProgressBar(message, percent) {
        let bar = document.getElementById('progressBar');
        if (!bar) {
            bar = document.createElement('div'); bar.id = 'progressBar';
            bar.style.cssText = `
                position: fixed;
                top: 70px;
                left: 0;
                right: 0;
                height: 22px;
                background: rgba(0,0,0,0.3);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            bar.innerHTML = `
                <div id="progressFill" style="
                    background: linear-gradient(90deg, #4CAF50, #8BC34A);
                    height: 100%;
                    width: 0%;
                    position: absolute;
                    left: 0;
                    top: 0;
                    transition: width 0.3s;
                    border-radius: 0 2px 2px 0;
                "></div>
                <span id="progressPercent" style="
                    position: relative;
                    z-index: 2;
                    font-size: 12px;
                    font-weight: bold;
                    color: white;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                ">0%</span>
            `;
            document.body.appendChild(bar);
        }
    },
    
    updateProgressBar(percent, message) {
        const fill = document.getElementById('progressFill');
        const perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = Math.min(percent, 100) + '%';
        if (perc) perc.textContent = Math.round(percent) + '%';
    },
    
    hideProgressBar() { const bar = document.getElementById('progressBar'); if (bar) bar.remove(); },
    
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId;
        this.clearUnread(friendId); // مسح العداد عند الفتح
        document.body.classList.add('conversation-open');
        const nameEl = document.getElementById('conversationName'), avatarEl = document.getElementById('conversationAvatar');
        if (nameEl) nameEl.textContent = friendName;
        if (avatarEl) avatarEl.textContent = friendAvatar || '👤';
        document.querySelector('.chat-page').style.display = 'none'; 
        document.getElementById('conversationPage').style.display = 'flex';
        this.displayMessages(friendId);
        PresenceSystem.watchFriend(friendId);
        setTimeout(() => { if (this.friendOnline) CallSystem.ensureDataChannel(friendId).catch(() => {}); }, 500);
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
    },
    
    updateFriendStatus(friendId, isOnline) {
        if (this.currentChat !== friendId) return;
        this.friendOnline = isOnline;
        if (isOnline) {
            CallSystem.ensureDataChannel(friendId).catch(() => {});
            this.updateAttachmentButtons(true);
        } else {
            this.updateAttachmentButtons(false);
        }
        const statusEl = document.getElementById('conversationStatus');
        if (statusEl) { statusEl.textContent = isOnline ? '🟢 متصل' : '🔴 غير متصل'; statusEl.className = `conversation-status ${isOnline ? 'online' : 'offline'}`; }
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
        let statusHtml = ''; 
        if (msg.sender === 'me') { let icon = '✓', cls = 'sent'; if (msg.status === 'delivered') { icon = '✓✓'; cls = 'delivered'; } else if (msg.status === 'read') { icon = '✓✓'; cls = 'read'; } statusHtml = `<span class="message-status ${cls}">${icon}</span>`; }
        
        if (msg.type === 'text') div.innerHTML = `<div class="message-content">${this.escapeHtml(msg.text)}</div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        else if (msg.type === 'image') div.innerHTML = `<img src="${msg.data}" class="message-image" onclick="window.openImage('${msg.data}')" loading="lazy"><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        else if (msg.type === 'voice') div.innerHTML = `<audio controls src="${msg.data}" class="message-audio" preload="metadata"></audio><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        else if (msg.type === 'video') div.innerHTML = `<div style="position:relative;max-width:280px;border-radius:12px;overflow:hidden;background:#000;"><video controls preload="metadata" playsinline style="width:100%;max-height:250px;display:block;"><source src="${msg.data}" type="video/webm"><source src="${msg.data}" type="video/mp4"><source src="${msg.data}" type="video/ogg"></video></div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        else if (msg.type === 'file') div.innerHTML = `<div class="message-content" onclick="window.openFile('${msg.data}', '${msg.fileName || 'ملف'}')" style="cursor:pointer;">📎 ${msg.fileName || 'ملف'}</div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        
        c.appendChild(div); c.scrollTop = c.scrollHeight;
    },
    
    async sendMessage(text) { 
        if (!this.currentChat || !text.trim()) return false; 
        const mid = Date.now().toString(); 
        try { 
            const pr = await SecureChatSystem.getMyPrivateKey(), pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); 
            if (!pr || !pu) return false;
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu), enc = await SecureChatSystem.encryptData(text.trim(), sk); 
            await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'text', data: enc, timestamp: Date.now() }); 
            this.saveMessage(this.currentChat, { id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            this.displayMessage({ id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            return true; 
        } catch (e) { return false; } 
    },
    
    async sendFileWithRetry(file, type, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.showProgressBar(`جاري إرسال ${type === 'video' ? 'الفيديو' : type === 'image' ? 'الصورة' : 'الملف'}...`, 0);
                const success = await CallSystem.sendFileDirect(file, type);
                if (success) { this.hideProgressBar(); return true; }
                if (attempt < maxRetries) { this.updateProgressBar(0, `إعادة المحاولة ${attempt + 1}...`); await new Promise(r => setTimeout(r, 2000 * attempt)); }
            } catch (error) {}
        }
        this.hideProgressBar(); return false;
    },
    
    async _ensureChannelReady() {
        if (!this.friendOnline) {
            alert('المستخدم غير متصل حالياً');
            return false;
        }
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
            return true;
        }
        
        try {
            await CallSystem.ensureDataChannel(this.currentChat);
            
            const result = await new Promise((resolve) => {
                let attempts = 0;
                const check = setInterval(() => {
                    attempts++;
                    if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
                        clearInterval(check);
                        resolve(true);
                    }
                    if (attempts > 10) {
                        clearInterval(check);
                        resolve(false);
                    }
                }, 500);
            });
            
            if (result) return true;
            
            alert('تعذر الاتصال. اطلب من المستخدم الآخر إعادة فتح المحادثة.');
            return false;
        } catch (e) {
            alert('فشل الاتصال. حاول مرة أخرى.');
            return false;
        }
    },
    
    async sendImage(file) { 
        if (!this.currentChat) return;
        if (!(await this._ensureChannelReady())) return;
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            const success = await this.sendFileWithRetry(file, 'image');
            if (success) {
                const comp = await SecureChatSystem.compressImage(file); 
                const b64 = await SecureChatSystem.fileToBase64(comp); 
                const msgId = Date.now().toString();
                this.saveMessage(this.currentChat, { id: msgId, type: 'image', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                this.displayMessage({ id: msgId, type: 'image', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            } else alert('فشل إرسال الصورة');
        }
    },
    
    async sendVideoFile(file) { 
        if (!this.currentChat) return;
        
        try {
            await SecureChatSystem.validateVideo(file);
        } catch (error) {
            alert(error.message);
            return;
        }
        
        if (!(await this._ensureChannelReady())) return;
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            console.log(`🎬 إرسال فيديو مباشر: ${file.name} | ${(file.size/1024/1024).toFixed(1)}MB`);
            const success = await this.sendFileWithRetry(file, 'video');
            if (success) {
                try {
                    const b64 = await SecureChatSystem.fileToBase64(file); 
                    const msgId = Date.now().toString();
                    
                    this.displayMessage({ id: msgId, type: 'video', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                    
                    this.saveMessage(this.currentChat, { id: msgId, type: 'video', data: b64.substring(0, 100) + '...', _videoPlaceholder: true, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                    
                } catch (error) { alert('فشل معالجة الفيديو'); }
            } else alert('فشل إرسال الفيديو');
        }
    },
    
    async sendFile(file) { 
        if (!this.currentChat) return;
        if (!(await this._ensureChannelReady())) return;
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            const success = await this.sendFileWithRetry(file, 'file');
            if (success) {
                const b64 = await SecureChatSystem.fileToBase64(file); 
                const msgId = Date.now().toString();
                if (b64.length < 500000) {
                    this.saveMessage(this.currentChat, { id: msgId, type: 'file', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                } else {
                    this.saveMessage(this.currentChat, { id: msgId, type: 'file', data: b64.substring(0, 100) + '...', _filePlaceholder: true, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                }
                this.displayMessage({ id: msgId, type: 'file', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            } else alert('فشل إرسال الملف');
        }
    },
    
    async sendVoiceNote(audioBlob) { 
        if (!this.currentChat) return;
        if (!(await this._ensureChannelReady())) return;
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            const success = await this.sendFileWithRetry(audioBlob, 'voice');
            if (success) {
                const b64 = await SecureChatSystem.fileToBase64(audioBlob); 
                const msgId = Date.now().toString();
                this.saveMessage(this.currentChat, { id: msgId, type: 'voice', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                this.displayMessage({ id: msgId, type: 'voice', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            } else alert('فشل إرسال البصمة الصوتية');
        }
    },
    
    async shareLocationDirect() { 
        if (!this.currentChat) return; 
        if (!(await this._ensureChannelReady())) return;
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            if (!navigator.geolocation) { alert('المتصفح لا يدعم تحديد الموقع'); return; }
            navigator.geolocation.getCurrentPosition(p => { 
                const locMsg = `📍 موقعي: https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`; 
                CallSystem.dc.send(JSON.stringify({ type: 'location', data: locMsg, id: Date.now().toString() })); 
                const msgId = Date.now().toString();
                this.saveMessage(this.currentChat, { id: msgId, type: 'text', text: locMsg, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                this.displayMessage({ id: msgId, type: 'text', text: locMsg, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            }, () => alert('فشل تحديد الموقع'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        }
    },
    
    saveMessage(friendId, message) { 
        const key = `chat_${friendId}`; 
        let h = []; 
        try { h = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { h = []; }
        h.push(message); 
        let serialized = JSON.stringify(h);
        while (serialized.length > 4000000) {
            let removed = false;
            for (let i = 0; i < h.length; i++) {
                if (h[i].type === 'video' || h[i].type === 'image' || h[i].type === 'file') { h.splice(i, 1); removed = true; break; }
            }
            if (!removed) h.splice(0, 1);
            serialized = JSON.stringify(h);
        }
        try { localStorage.setItem(key, JSON.stringify(h)); } catch (e) {
            h = h.slice(Math.floor(h.length * 0.2));
            try { localStorage.setItem(key, JSON.stringify(h)); } catch (e2) { h = h.slice(-10); try { localStorage.setItem(key, JSON.stringify(h)); } catch (e3) {} }
        }
        this.messages[friendId] = h;
        
        // إذا الرسالة من الصديق (مو مني)، أضفها كغير مقروءة
        if (message.sender === 'friend') {
            this.addUnreadMessage(friendId);
        }
    },
    
    updateLastMessage(friendId, lastMessage) { 
        document.querySelectorAll('.chat-item').forEach(item => { 
            if (item.getAttribute('onclick')?.includes(friendId)) { 
                const lm = item.querySelector('.last-message'), tm = item.querySelector('.chat-time'); 
                if (lm) lm.textContent = lastMessage; 
                if (tm) tm.textContent = 'الآن'; 
            } 
        }); 
    },
    
    closeChat() {
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        PresenceSystem.stopAll();
        if (!CallSystem.isInCall) CallSystem.cleanupConnections();
        this.currentChat = null; this.friendOnline = false;
    },
    
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
};

ChatSystem.init();
