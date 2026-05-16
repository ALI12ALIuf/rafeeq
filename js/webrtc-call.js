// ========== webrtc-call.js ==========
// نظام اتصال WebRTC - مكالمات صوتية فقط + إرسال الملفات والصور والبصمات + نظام تشخيص

// ========== نظام التشخيص ==========
const CallDiagnostics = {
    logs: [],
    addLog(message, type = 'info') {
        const time = new Date().toLocaleTimeString();
        const log = { time, message, type };
        this.logs.push(log);
        console.log(`[${time}] ${message}`);
        
        // عرض على الشاشة
        let panel = document.getElementById('callDiagnosticsPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'callDiagnosticsPanel';
            panel.style.cssText = `
                position: fixed;
                bottom: 10px;
                left: 10px;
                right: 10px;
                background: rgba(0,0,0,0.95);
                color: #0f0;
                font-size: 11px;
                padding: 8px;
                border-radius: 8px;
                z-index: 10001;
                font-family: monospace;
                max-height: 200px;
                overflow-y: auto;
                direction: ltr;
                text-align: left;
                pointer-events: none;
            `;
            document.body.appendChild(panel);
        }
        
        const color = type === 'error' ? '#ff4444' : (type === 'success' ? '#44ff44' : '#ffaa44');
        panel.innerHTML += `<div style="color:${color};border-bottom:1px solid #333;padding:2px 0;">[${time}] ${message}</div>`;
        panel.scrollTop = panel.scrollHeight;
        
        while (panel.children.length > 50) {
            panel.removeChild(panel.children[0]);
        }
    },
    clear() {
        const panel = document.getElementById('callDiagnosticsPanel');
        if (panel) panel.innerHTML = '';
        this.logs = [];
    }
};

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false,
    incomingChunks: {}, incomingFileInfo: {},
    reconnectTimer: null, maxReconnectAttempts: 3, reconnectAttempts: 0,
    callTimerInterval: null,
    servers: { 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ] 
    },
    
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
            CallDiagnostics.addLog('📞 إنشاء قناة بيانات جديدة', 'info');
            this.pc = new RTCPeerConnection({
                iceServers: this.servers.iceServers,
                iceTransportPolicy: 'all'
            });
            this.dc = this.pc.createDataChannel('chat', { ordered: true, maxRetransmits: 3 });
            this.setupDataChannel(this.dc);
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }).catch(() => {}); };
            this.pc.oniceconnectionstatechange = () => { 
                CallDiagnostics.addLog(`❄️ ICE state: ${this.pc?.iceConnectionState}`, this.pc?.iceConnectionState === 'failed' ? 'error' : 'info');
                if (this.pc?.iceConnectionState === 'failed') this.pc.restartIce(); 
            };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            this.pc.onconnectionstatechange = () => { 
                CallDiagnostics.addLog(`🔗 Connection state: ${this.pc?.connectionState}`, 'info');
                switch(this.pc?.connectionState) { 
                    case 'connected': this.reconnectAttempts = 0; break; 
                    case 'failed': case 'disconnected': this.scheduleReconnect(); break; 
                } 
            };
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            CallDiagnostics.addLog(`📝 تم إنشاء عرض (صوت فقط)`, 'success');
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription });
        } catch (error) { CallDiagnostics.addLog(`❌ خطأ: ${error.message}`, 'error'); throw error; }
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
        channel.onopen = () => { 
            CallDiagnostics.addLog('✅ DataChannel مفتوح', 'success');
            if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } 
            this.reconnectAttempts = 0; 
        };
        channel.onclose = () => { CallDiagnostics.addLog('❌ DataChannel مغلق', 'error'); this.scheduleReconnect(); };
        channel.onerror = () => { CallDiagnostics.addLog('❌ خطأ في DataChannel', 'error'); this.scheduleReconnect(); };
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
        CallDiagnostics.addLog(`🔄 إعادة محاولة الاتصال بعد ${delay}ms`, 'info');
        this.reconnectTimer = setTimeout(async () => { try { if (ChatSystem.currentChat && ChatSystem.friendOnline) await this.ensureDataChannel(ChatSystem.currentChat); } catch (error) {} this.reconnectTimer = null; }, delay);
    },
    
    // ========== مكالمة صوتية فقط ==========
    async startCall(calleeId) {
        CallDiagnostics.addLog(`🚀 بدء مكالمة صوتية إلى ${calleeId}`, 'info');
        
        if (!window.auth?.currentUser) {
            CallDiagnostics.addLog('❌ لا يوجد مستخدم مسجل', 'error');
            return;
        }
        if (this.isInCall) {
            CallDiagnostics.addLog('❌ مكالمة قيد التشغيل بالفعل', 'error');
            return;
        }
        this.isInCall = true;
        
        try {
            // فحص إذن الميكروفون
            if (navigator.permissions) {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                CallDiagnostics.addLog(`🎤 حالة إذن الميكروفون: ${permissionStatus.state}`, permissionStatus.state === 'denied' ? 'error' : 'info');
                if (permissionStatus.state === 'denied') {
                    CallDiagnostics.addLog('❌ إذن الميكروفون مرفوض!', 'error');
                    alert('⚠️ لا يمكن الوصول إلى الميكروفون. الرجاء السماح يدوياً من إعدادات المتصفح.');
                    this.endCall();
                    return;
                }
            }
            
            // طلب الصوت فقط (بدون كاميرا)
            const constraints = { audio: true, video: false };
            CallDiagnostics.addLog(`🎤 طلب الميكروفون...`, 'info');
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            const audioTracks = this.localStream.getAudioTracks();
            CallDiagnostics.addLog(`✅ تم الحصول على ${audioTracks.length} مسار صوتي`, audioTracks.length > 0 ? 'success' : 'error');
            
            if (audioTracks.length === 0) {
                CallDiagnostics.addLog('❌ لا يوجد مسار صوتي!', 'error');
                this.endCall();
                alert('لا يمكن الوصول إلى الميكروفون');
                return;
            }
            
            // تفعيل المسار الصوتي
            audioTracks[0].enabled = true;
            
            this.showCallUI();
            this.pc = new RTCPeerConnection({
                iceServers: this.servers.iceServers,
                iceTransportPolicy: 'all'
            });
            
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
                CallDiagnostics.addLog(`➕ إضافة ${track.kind} track إلى الاتصال`, 'info');
            });
            this.dc = this.pc.createDataChannel('chat'); 
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { 
                if (e.candidate) {
                    CallDiagnostics.addLog(`🧊 ICE candidate: ${e.candidate.candidate.substring(0, 50)}...`, 'info');
                    this.sendSignal(calleeId, { candidate: e.candidate });
                }
            };
            
            this.pc.oniceconnectionstatechange = () => {
                const state = this.pc?.iceConnectionState;
                CallDiagnostics.addLog(`❄️ ICE state: ${state}`, state === 'failed' ? 'error' : 'info');
                if (state === 'failed') {
                    CallDiagnostics.addLog('🔄 ICE فشل، إعادة المحاولة...', 'info');
                    this.pc.restartIce();
                }
            };
            
            this.pc.ontrack = e => {
                CallDiagnostics.addLog(`📡 استقبال مسار ${e.track.kind} من الطرف البعيد`, 'success');
            };
            
            this.pc.onconnectionstatechange = () => {
                CallDiagnostics.addLog(`🔌 حالة الاتصال: ${this.pc?.connectionState}`, 'info');
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) 
                    this.endCall();
            };
            
            // طلب صوت فقط (بدون فيديو) - يقلل استهلاك TURN بشكل كبير
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false }); 
            CallDiagnostics.addLog(`📝 تم إنشاء العرض (صوت فقط)`, 'success');
            
            await this.pc.setLocalDescription(offer);
            CallDiagnostics.addLog(`✅ تم تعيين LocalDescription`, 'success');
            
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription });
            CallDiagnostics.addLog(`📤 تم إرسال الإشارة إلى ${calleeId}`, 'success');
            
        } catch (e) { 
            CallDiagnostics.addLog(`❌ خطأ في startCall: ${e.name} - ${e.message}`, 'error');
            this.endCall(); 
            if (e.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الميكروفون');
            } else {
                alert('حدث خطأ في بدء المكالمة: ' + e.message);
            }
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
            console.log('✅ تم الإرسال بنجاح');
            return true;
        } catch (e) { ChatSystem.hideProgressBar(); return false; }
    },
    
    showIncomingCall(callerId, callData) {
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        CallDiagnostics.addLog(`📞 مكالمة واردة من ${callerId}`, 'info');
        
        const overlay = document.createElement('div'); overlay.id = 'incomingCall';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;';
        overlay.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:3rem;margin-bottom:10px;">🎧</div>
                <div style="font-size:1.5rem;">📞 ${contactName}</div>
                <div style="font-size:1rem;margin-top:8px;color:#ccc;">مكالمة صوتية</div>
            </div>
            <div style="display:flex;gap:30px;">
                <button id="btnAccept" style="width:70px;height:70px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;">
                    <i class="fas fa-check"></i>
                </button>
                <button id="btnReject" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>`;
        document.body.appendChild(overlay);
        
        document.getElementById('btnAccept').onclick = () => { overlay.remove(); this.receiveCall(callerId, callData); };
        document.getElementById('btnReject').onclick = () => { overlay.remove(); };
    },
    
    async receiveCall(callerId, callData) {
        CallDiagnostics.addLog(`📞 استقبال مكالمة من ${callerId}`, 'info');
        
        if (this.isInCall) {
            CallDiagnostics.addLog('❌ مكالمة قيد التشغيل بالفعل', 'error');
            return;
        }
        this.isInCall = true;
        
        try {
            // مكالمة صوتية فقط (بدون كاميرا)
            const constraints = { audio: true, video: false };
            CallDiagnostics.addLog(`🎤 طلب الميكروفون...`, 'info');
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            const audioTracks = this.localStream.getAudioTracks();
            CallDiagnostics.addLog(`✅ تم الحصول على ${audioTracks.length} مسار صوتي`, audioTracks.length > 0 ? 'success' : 'error');
            
            if (audioTracks.length === 0) {
                CallDiagnostics.addLog('❌ لا يوجد مسار صوتي!', 'error');
                this.endCall();
                alert('لا يمكن الوصول إلى الميكروفون');
                return;
            }
            
            this.showCallUI();
            this.pc = new RTCPeerConnection({
                iceServers: this.servers.iceServers,
                iceTransportPolicy: 'all'
            });
            
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(callerId, { candidate: e.candidate }); };
            this.pc.oniceconnectionstatechange = () => {
                const state = this.pc?.iceConnectionState;
                CallDiagnostics.addLog(`❄️ ICE state: ${state}`, state === 'failed' ? 'error' : 'info');
                if (state === 'failed') this.pc.restartIce();
            };
            this.pc.ontrack = e => {
                CallDiagnostics.addLog(`📡 استقبال مسار ${e.track.kind} من الطرف البعيد`, 'success');
            };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            this.pc.onconnectionstatechange = () => {
                CallDiagnostics.addLog(`🔌 حالة الاتصال: ${this.pc?.connectionState}`, 'info');
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) 
                    this.endCall();
            };
            
            if (callData.sdp) { 
                CallDiagnostics.addLog(`📝 تعيين RemoteDescription`, 'info');
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp)); 
                const answer = await this.pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: false }); 
                CallDiagnostics.addLog(`📝 تم إنشاء الإجابة (صوت فقط)`, 'success');
                await this.pc.setLocalDescription(answer); 
                await this.sendSignal(callerId, { sdp: this.pc.localDescription }); 
                CallDiagnostics.addLog(`✅ تم إرسال الإجابة`, 'success');
            }
        } catch (e) { 
            CallDiagnostics.addLog(`❌ خطأ في receiveCall: ${e.name} - ${e.message}`, 'error');
            this.endCall(); 
            if (e.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الميكروفون');
            }
        }
    },
    
    async handleSignaling(data) {
        try {
            if (!this.pc) { 
                this.pc = new RTCPeerConnection({
                    iceServers: this.servers.iceServers,
                    iceTransportPolicy: 'all'
                }); 
                this.pc.ondatachannel = e => { this.dc = e.channel; this.setupDataChannel(this.dc); }; 
                this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(ChatSystem.currentChat, { candidate: e.candidate }).catch(() => {}); };
                this.pc.oniceconnectionstatechange = () => { if (this.pc?.iceConnectionState === 'failed') this.pc.restartIce(); };
            }
            if (data.sdp) { 
                await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); 
                if (data.sdp.type === 'offer') { 
                    const answer = await this.pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: false }); 
                    await this.pc.setLocalDescription(answer); 
                    await this.sendSignal(ChatSystem.currentChat, { sdp: this.pc.localDescription }); 
                } 
            }
            else if (data.candidate) {
                if (this.pc && data.candidate) {
                    await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            }
        } catch (e) { console.warn('Signaling error:', e); }
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
    
    // ========== واجهة المستخدم ==========
    showCallUI() { 
        document.body.classList.add('in-call'); 
        const existingUi = document.getElementById('callUI');
        if (existingUi) existingUi.remove();
        
        const ui = document.createElement('div'); ui.id = 'callUI'; 
        ui.innerHTML = `
            <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg, #1a1a2e, #16213e);z-index:9997;"></div>
            <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;text-align:center;">
                <div style="background:var(--primary);border-radius:50%;width:120px;height:120px;display:flex;align-items:center;justify-content:center;margin:0 auto;box-shadow:0 4px 15px rgba(0,0,0,0.3);">
                    <i class="fas fa-phone" style="font-size:3rem;color:white;"></i>
                </div>
                <div style="margin-top:20px;color:white;font-size:1.2rem;">مكالمة صوتية</div>
                <div style="margin-top:5px;color:#aaa;font-size:0.8rem;" id="callTimer">00:00</div>
            </div>
            <div style="position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:30px;">
                <button onclick="CallSystem.toggleAudio()" style="width:60px;height:60px;border-radius:50%;background:#333;color:white;border:none;font-size:1.5rem;cursor:pointer;" title="كتم الصوت">
                    <i class="fas fa-microphone"></i>
                </button>
                <button onclick="CallSystem.endCall()" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.8rem;cursor:pointer;" title="إنهاء المكالمة">
                    <i class="fas fa-phone-slash"></i>
                </button>
            </div>
        `;
        document.body.appendChild(ui);
        this.startCallTimer();
        CallDiagnostics.addLog('📱 واجهة المكالمة الصوتية ظهرت', 'success');
    },
    
    startCallTimer() {
        if (this.callTimerInterval) clearInterval(this.callTimerInterval);
        let seconds = 0;
        this.callTimerInterval = setInterval(() => {
            if (!this.isInCall) {
                clearInterval(this.callTimerInterval);
                return;
            }
            seconds++;
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            const timerEl = document.getElementById('callTimer');
            if (timerEl) timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
    },
    
    toggleAudio() { 
        if (this.localStream) { 
            const at = this.localStream.getAudioTracks()[0]; 
            if (at) {
                at.enabled = !at.enabled;
                const btn = document.querySelector('#callUI button[onclick*="toggleAudio"] i');
                if (btn) {
                    if (at.enabled) {
                        btn.className = 'fas fa-microphone';
                        CallDiagnostics.addLog(`🎤 الصوت مفعل`, 'info');
                    } else {
                        btn.className = 'fas fa-microphone-slash';
                        CallDiagnostics.addLog(`🔇 الصوت مكتوم`, 'info');
                    }
                }
            }
        } 
    },
    
    endCall() { 
        CallDiagnostics.addLog(`📞 إنهاء المكالمة`, 'info');
        this.isInCall = false; 
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        document.body.classList.remove('in-call'); 
        if (this.localStream) { 
            this.localStream.getTracks().forEach(t => t.stop()); 
            this.localStream = null; 
        } 
        this.cleanupConnections(); 
        const ui = document.getElementById('callUI'); 
        if (ui) ui.remove(); 
        const inc = document.getElementById('incomingCall'); 
        if (inc) inc.remove(); 
        CallDiagnostics.addLog(`✅ تم إنهاء المكالمة`, 'success');
    },
    
    cleanupConnections() { 
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } 
        if (this.dc) { this.dc.close(); this.dc = null; } 
        if (this.pc) { this.pc.close(); this.pc = null; } 
        this.incomingChunks = {}; 
        this.incomingFileInfo = {}; 
    }
};

// دالة المكالمات الصوتية فقط (تم إزالة مكالمات الفيديو نهائياً)
window.startAudioCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat); };
