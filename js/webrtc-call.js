// ========== webrtc-call.js ==========
// نظام اتصال WebRTC مباشر + المكالمات + إرسال الملفات

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false,
    incomingChunks: {}, incomingFileInfo: {},
    reconnectTimer: null, maxReconnectAttempts: 3, reconnectAttempts: 0,
    currentCallType: 'video',
    servers: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' },{ urls: 'stun:stun1.l.google.com:19302' },{ urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },{ urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }] },
    
    async ensureDataChannel(calleeId) {
        if (!calleeId) return;
        if (this.dc && this.dc.readyState === 'open') return;
        if (this.dc && this.dc.readyState === 'connecting') {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => { clearInterval(checkInterval); reject(new Error('انتهت مهلة انتظار القناة')); }, 10000);
                const checkInterval = setInterval(() => {
                    if (!this.dc) { clearInterval(checkInterval); clearTimeout(timeout); this.createNewDataChannel(calleeId).then(resolve).catch(reject); }
                    else if (this.dc.readyState === 'open') { clearInterval(checkInterval); clearTimeout(timeout); resolve(); }
                    else if (this.dc.readyState === 'failed' || this.dc.readyState === 'closed') { clearInterval(checkInterval); clearTimeout(timeout); this.createNewDataChannel(calleeId).then(resolve).catch(reject); }
                }, 500);
            });
        }
        return this.createNewDataChannel(calleeId);
    },
    
    async createNewDataChannel(calleeId) {
        this.reconnectAttempts = 0; this.cleanupConnections();
        try {
            this.pc = new RTCPeerConnection(this.servers);
            this.dc = this.pc.createDataChannel('chat', { ordered: true, maxRetransmits: 3 });
            this.setupDataChannel(this.dc);
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }).catch(() => {}); };
            this.pc.oniceconnectionstatechange = () => { if (this.pc?.iceConnectionState === 'failed') this.pc.restartIce(); };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            this.pc.onconnectionstatechange = () => { switch(this.pc?.connectionState) { case 'connected': this.reconnectAttempts = 0; break; case 'failed': case 'disconnected': this.scheduleReconnect(); break; } };
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription });
        } catch (error) { throw error; }
    },
    
    setupDataChannel(channel) {
        if (!channel) return;
        channel.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.chunk !== undefined) { this.handleChunkMessage(msg); return; }
                const displayMsg = { id: msg.id || Date.now().toString(), type: msg.type, data: msg.data, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
                if (ChatSystem.currentChat) { ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg); ChatSystem.displayMessage(displayMsg); }
            } catch (error) {}
        };
        channel.onopen = () => { if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } this.reconnectAttempts = 0; };
        channel.onclose = () => this.scheduleReconnect();
        channel.onerror = () => this.scheduleReconnect();
    },
    
    handleChunkMessage(msg) {
        if (!this.incomingChunks[msg.id]) { 
            this.incomingChunks[msg.id] = []; 
            this.incomingFileInfo[msg.id] = { type: msg.type, fileName: msg.fileName, total: msg.total, received: 0 };
            ChatSystem.showProgressBar('جاري استلام الملف...', 0);
        }
        this.incomingChunks[msg.id][msg.chunk] = msg.data;
        this.incomingFileInfo[msg.id].received++;
        const progress = (this.incomingFileInfo[msg.id].received / msg.total) * 100;
        const fileType = msg.type === 'video' ? 'الفيديو' : msg.type === 'image' ? 'الصورة' : 'الملف';
        ChatSystem.updateProgressBar(progress, `جاري استلام ${fileType}...`);
        if (this.incomingFileInfo[msg.id].received === msg.total) {
            const fullData = this.incomingChunks[msg.id].join('');
            const displayMsg = { id: msg.id, type: msg.type === 'location' ? 'text' : msg.type, data: fullData, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
            if (ChatSystem.currentChat) { ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg); ChatSystem.displayMessage(displayMsg); }
            ChatSystem.hideProgressBar();
            delete this.incomingChunks[msg.id]; delete this.incomingFileInfo[msg.id];
        }
    },
    
    scheduleReconnect() {
        if (!ChatSystem.currentChat || !ChatSystem.friendOnline) return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
        this.reconnectTimer = setTimeout(async () => { try { if (ChatSystem.currentChat && ChatSystem.friendOnline) await this.ensureDataChannel(ChatSystem.currentChat); } catch (error) {} this.reconnectTimer = null; }, delay);
    },
    
    // ========== بدء المكالمة مع إرسال إشارة "اتصال وارد" ==========
    async startCall(calleeId, callType = 'video') {
        if (!window.auth?.currentUser || this.isInCall) {
            if (this.isInCall) alert('لديك مكالمة جارية بالفعل');
            return;
        }
        this.isInCall = true;
        this.currentCallType = callType;
        
        try {
            // إرسال إشارة "اتصال وارد" للطرف الآخر
            await this.sendSignal(calleeId, { 
                type: 'incoming-call',
                callType: callType,
                callerName: document.getElementById('profileName')?.textContent || 'مستخدم'
            });
            
            const constraints = { 
                audio: true, 
                video: callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false 
            };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.showCallUI(callType);
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            this.dc = this.pc.createDataChannel('chat'); this.setupDataChannel(this.dc);
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }); };
            this.pc.ontrack = e => { const rv = document.getElementById('remoteVideo'); if (rv && e.streams[0]) rv.srcObject = e.streams[0]; };
            this.pc.onconnectionstatechange = () => { 
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
                if (this.pc && this.pc.connectionState === 'connected') {
                    // إلغاء إشارة الاتصال الوارد بعد الاتصال
                    this.sendSignal(calleeId, { type: 'call-connected' }).catch(() => {});
                }
            };
            const offer = await this.pc.createOffer(); await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, callType: callType });
        } catch (e) { 
            this.endCall(); 
            if (e.name === 'NotAllowedError') alert('يرجى السماح بالوصول إلى الكاميرا والميكروفون');
        }
    },
    
    async sendFileDirect(file, type) {
        if (!this.dc || this.dc.readyState !== 'open') return false;
        try {
            let blobToSend = file;
            if (type === 'image') blobToSend = await SecureChatSystem.compressImage(file);
            
            const b64 = await SecureChatSystem.fileToBase64(blobToSend);
            const chunkSize = 16000;
            const totalChunks = Math.ceil(b64.length / chunkSize);
            const fileId = Date.now().toString();
            
            console.log(`📤 إرسال ${type}: ${file.name || 'ملف'} (${totalChunks} جزء)`);
            
            for (let i = 0; i < totalChunks; i++) {
                if (this.dc.readyState !== 'open') { ChatSystem.hideProgressBar(); return false; }
                const chunk = { type, data: b64.substring(i * chunkSize, (i + 1) * chunkSize), chunk: i, total: totalChunks, id: fileId, fileName: file.name || 'ملف' };
                this.dc.send(JSON.stringify(chunk));
                const progress = ((i + 1) / totalChunks) * 100;
                const typeLabel = type === 'video' ? 'الفيديو' : type === 'image' ? 'الصورة' : 'الملف';
                ChatSystem.updateProgressBar(progress, `جاري إرسال ${typeLabel}...`);
                await new Promise(r => setTimeout(r, 50));
            }
            ChatSystem.hideProgressBar();
            return true;
        } catch (e) { ChatSystem.hideProgressBar(); return false; }
    },
    
    // ========== إظهار نافذة اتصال وارد ==========
    showIncomingCall(callerId, callData) {
        // إزالة أي نافذة قديمة
        const oldInc = document.getElementById('incomingCall');
        if (oldInc) oldInc.remove();
        
        const callerName = callData.callerName || 'مستخدم';
        const callType = callData.callType || 'video';
        const callLabel = callType === 'video' ? '📹 فيديو' : '📞 صوت';
        
        const overlay = document.createElement('div'); 
        overlay.id = 'incomingCall';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:20px;';
        overlay.innerHTML = `
            <div style="font-size:4rem;">${callType === 'video' ? '📹' : '📞'}</div>
            <div style="font-size:1.5rem;font-weight:bold;">${callerName}</div>
            <div style="font-size:1rem;color:#ccc;">${callLabel} - اتصال وارد...</div>
            <div style="display:flex;gap:30px;margin-top:10px;">
                <button id="btnAccept" style="width:70px;height:70px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;">✅</button>
                <button id="btnReject" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;">❌</button>
            </div>`;
        document.body.appendChild(overlay);
        
        // إصدار صوت رنين (اختياري)
        this._playRingtone();
        
        document.getElementById('btnAccept').onclick = () => { 
            this._stopRingtone();
            overlay.remove(); 
            this.receiveCall(callerId, callData); 
        };
        
        document.getElementById('btnReject').onclick = () => { 
            this._stopRingtone();
            overlay.remove();
            this.sendSignal(callerId, { type: 'call-rejected' });
        };
        
        // المهلة: 30 ثانية وإذا ما رد، ينتهي
        this._ringTimeout = setTimeout(() => {
            this._stopRingtone();
            overlay.remove();
            this.sendSignal(callerId, { type: 'call-timeout' });
        }, 30000);
    },
    
    _playRingtone() {
        try {
            this._ringAudio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACAf39/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/fHb29vbw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8PDw8');
            this._ringAudio.loop = true;
            this._ringAudio.play().catch(() => {});
        } catch(e) {}
    },
    
    _stopRingtone() {
        if (this._ringTimeout) { clearTimeout(this._ringTimeout); this._ringTimeout = null; }
        if (this._ringAudio) { this._ringAudio.pause(); this._ringAudio = null; }
    },
    
    // ========== استقبال المكالمة ==========
    async receiveCall(callerId, callData) {
        if (this.isInCall) {
            this.sendSignal(callerId, { type: 'call-busy' });
            return;
        }
        this.isInCall = true;
        this.currentCallType = callData.callType || 'audio';
        
        try {
            const hasVideo = callData.sdp?.sdp?.includes('video') !== false || callData.callType === 'video';
            const constraints = { audio: true, video: hasVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.showCallUI(hasVideo ? 'video' : 'audio');
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(callerId, { candidate: e.candidate }); };
            this.pc.ontrack = e => { const rv = document.getElementById('remoteVideo'); if (rv && e.streams[0]) rv.srcObject = e.streams[0]; };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            this.pc.onconnectionstatechange = () => { 
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            if (callData.sdp) { 
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp)); 
                const answer = await this.pc.createAnswer(); 
                await this.pc.setLocalDescription(answer); 
                await this.sendSignal(callerId, { sdp: this.pc.localDescription }); 
            }
        } catch (e) { 
            this.endCall(); 
            if (e.name === 'NotAllowedError') alert('يرجى السماح بالوصول إلى الكاميرا والميكروفون');
        }
    },
    
    // ========== معالجة الإشارات (معدلة لدعم المكالمات الواردة) ==========
    async handleSignaling(data) {
        try {
            // إشارة اتصال وارد
            if (data.type === 'incoming-call') {
                const callerId = ChatSystem.currentChat;
                if (callerId) {
                    this.showIncomingCall(callerId, data);
                }
                return;
            }
            
            // إشارة رفض المكالمة
            if (data.type === 'call-rejected') {
                this._stopRingtone();
                alert('تم رفض المكالمة');
                this.endCall();
                return;
            }
            
            // إشارة انتهاء المهلة
            if (data.type === 'call-timeout') {
                this._stopRingtone();
                alert('لم يتم الرد على المكالمة');
                this.endCall();
                return;
            }
            
            // إشارة مشغول
            if (data.type === 'call-busy') {
                alert('المستخدم مشغول بمكالمة أخرى');
                this.endCall();
                return;
            }
            
            if (!this.pc) { 
                this.pc = new RTCPeerConnection(this.servers); 
                this.pc.ondatachannel = e => { this.dc = e.channel; this.setupDataChannel(this.dc); }; 
                this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(ChatSystem.currentChat, { candidate: e.candidate }).catch(() => {}); }; 
            }
            if (data.sdp) { 
                await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); 
                if (data.sdp.type === 'offer') { 
                    const answer = await this.pc.createAnswer(); 
                    await this.pc.setLocalDescription(answer); 
                    await this.sendSignal(ChatSystem.currentChat, { sdp: this.pc.localDescription }); 
                } 
            } else if (data.candidate) {
                await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (e) {}
    },
    
    async sendSignal(calleeId, data) {
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'webrtc', data: encrypted, timestamp: Date.now() });
        } catch (error) {}
    },
    
    showCallUI(callType) { 
        document.body.classList.add('in-call'); 
        const ui = document.createElement('div'); ui.id = 'callUI'; 
        ui.innerHTML = `<video id="remoteVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;position:fixed;top:0;left:0;z-index:9998;background:#000;"></video><video id="localVideo" autoplay playsinline muted style="width:100px;height:150px;object-fit:cover;position:fixed;bottom:100px;right:20px;z-index:9999;border-radius:12px;border:2px solid white;background:#333;"></video><div style="position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:30px;"><button onclick="CallSystem.toggleAudio()" style="width:50px;height:50px;border-radius:50%;background:#333;color:white;border:none;font-size:1.2rem;cursor:pointer;">🎤</button><button onclick="CallSystem.endCall()" style="width:60px;height:60px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.5rem;cursor:pointer;">📞</button><button onclick="CallSystem.toggleVideo()" style="width:50px;height:50px;border-radius:50%;background:#333;color:white;border:none;font-size:1.2rem;cursor:pointer;">📹</button></div>`; 
        document.body.appendChild(ui); 
        const lv = document.getElementById('localVideo'); if (lv && this.localStream) lv.srcObject = this.localStream; 
    },
    
    toggleAudio() { if (this.localStream) { const at = this.localStream.getAudioTracks()[0]; if (at) at.enabled = !at.enabled; } },
    toggleVideo() { if (this.localStream) { const vt = this.localStream.getVideoTracks()[0]; if (vt) vt.enabled = !vt.enabled; } },
    
    endCall() { 
        this.isInCall = false; 
        this._stopRingtone();
        document.body.classList.remove('in-call'); 
        if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; } 
        // إرسال إشارة إنهاء المكالمة للطرف الآخر
        if (ChatSystem.currentChat) {
            this.sendSignal(ChatSystem.currentChat, { type: 'call-ended' }).catch(() => {});
        }
        this.cleanupConnections(); 
        const ui = document.getElementById('callUI'); if (ui) ui.remove(); 
        const inc = document.getElementById('incomingCall'); if (inc) inc.remove(); 
    },
    
    cleanupConnections() { 
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } 
        if (this.dc) { this.dc.close(); this.dc = null; } 
        if (this.pc) { this.pc.close(); this.pc = null; } 
        this.incomingChunks = {}; this.incomingFileInfo = {}; 
    }
};

window.startVideoCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat, 'video'); };
window.startAudioCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat, 'audio'); };
