// ========== webrtc-call.js ==========
// نظام اتصال WebRTC - مكالمات صوتية فقط + نظام تشخيص مرئي

// نظام التشخيص المرئي (يظهر على الشاشة)
const CallDiagnostics = {
    addLog(message, type = 'info') {
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] ${message}`);
        
        let panel = document.getElementById('callDiagnosticPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'callDiagnosticPanel';
            panel.style.cssText = `
                position: fixed;
                top: 10px;
                left: 10px;
                right: 10px;
                background: rgba(0,0,0,0.9);
                color: #0f0;
                font-size: 12px;
                padding: 10px;
                border-radius: 8px;
                z-index: 10002;
                font-family: monospace;
                max-height: 150px;
                overflow-y: auto;
                direction: ltr;
                text-align: left;
                pointer-events: none;
                border: 1px solid #00ff00;
            `;
            document.body.appendChild(panel);
        }
        
        const color = type === 'error' ? '#ff6666' : (type === 'success' ? '#66ff66' : '#ffaa66');
        panel.innerHTML += `<div style="color:${color};border-bottom:1px solid #333;padding:3px 0;">[${time}] ${message}</div>`;
        panel.scrollTop = panel.scrollHeight;
        
        while (panel.children.length > 20) {
            panel.removeChild(panel.children[0]);
        }
    },
    clear() {
        const panel = document.getElementById('callDiagnosticPanel');
        if (panel) panel.innerHTML = '';
    }
};

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false,
    incomingChunks: {}, incomingFileInfo: {},
    reconnectTimer: null, maxReconnectAttempts: 3, reconnectAttempts: 0,
    callTimerInterval: null, keepAliveInterval: null,
    isMuted: false, isSpeakerEnabled: false,
    remoteAudioElement: null,
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
            this.pc.oniceconnectionstatechange = () => { if (this.pc?.iceConnectionState === 'failed') this.pc.restartIce(); };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            this.pc.onconnectionstatechange = () => { 
                switch(this.pc?.connectionState) { 
                    case 'connected': 
                        this.reconnectAttempts = 0; 
                        break; 
                    case 'failed': 
                    case 'disconnected': 
                        this.scheduleReconnect(); 
                        break; 
                } 
            };
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription });
        } catch (error) { throw error; }
    },
    
    setupDataChannel(channel) {
        if (!channel) return;
        channel.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'ping') return;
                if (msg.type === 'call_status') {
                    this.handleCallStatus(msg);
                    return;
                }
                if (msg.type === 'call_rejected') {
                    this.handleCallRejected(msg);
                    return;
                }
                if (msg.chunk !== undefined) { this.handleChunkMessage(msg); return; }
                const displayMsg = { id: msg.id || Date.now().toString(), type: msg.type, data: msg.data, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
                if (ChatSystem.currentChat) { ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg); ChatSystem.displayMessage(displayMsg); }
            } catch (error) {}
        };
        channel.onopen = () => { 
            CallDiagnostics.addLog('✅ DataChannel مفتوح', 'success');
            if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } 
            this.reconnectAttempts = 0;
            this.sendCallStatus('connected');
            if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = setInterval(() => {
                if (this.dc && this.dc.readyState === 'open') {
                    this.dc.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
                }
            }, 2000);
        };
        channel.onclose = () => { 
            CallDiagnostics.addLog('❌ DataChannel مغلق', 'error');
            this.sendCallStatus('disconnected');
            if (this.keepAliveInterval) {
                clearInterval(this.keepAliveInterval);
                this.keepAliveInterval = null;
            }
            this.scheduleReconnect(); 
        };
        channel.onerror = () => { CallDiagnostics.addLog('❌ خطأ في DataChannel', 'error'); this.scheduleReconnect(); };
    },
    
    handleCallStatus(msg) {
        if (msg.status === 'connected') {
            CallDiagnostics.addLog('📞 الطرف الآخر متصل', 'success');
        } else if (msg.status === 'disconnected') {
            CallDiagnostics.addLog('📞 الطرف الآخر قطع الاتصال', 'error');
            if (this.isInCall) {
                alert('الطرف الآخر أنهى المكالمة');
                this.endCall();
            }
        }
    },
    
    handleCallRejected(msg) {
        CallDiagnostics.addLog('📞 الطرف الآخر رفض المكالمة', 'error');
        if (this.isInCall || this.isRinging) {
            alert('الطرف الآخر رفض المكالمة');
            this.endCall();
        }
    },
    
    sendCallStatus(status) {
        if (this.dc && this.dc.readyState === 'open') {
            this.dc.send(JSON.stringify({ type: 'call_status', status: status, timestamp: Date.now() }));
        }
    },
    
    sendCallRejected() {
        if (this.dc && this.dc.readyState === 'open') {
            this.dc.send(JSON.stringify({ type: 'call_rejected', timestamp: Date.now() }));
        }
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
    
    async startCall(calleeId) {
        CallDiagnostics.addLog(`🚀 بدء مكالمة صوتية إلى ${calleeId.substring(0, 8)}...`, 'info');
        
        if (!window.auth?.currentUser) {
            CallDiagnostics.addLog('❌ لا يوجد مستخدم مسجل', 'error');
            return;
        }
        
        if (!ChatSystem.friendOnline) {
            CallDiagnostics.addLog('❌ الطرف الآخر غير متصل بالإنترنت', 'error');
            alert('الطرف الآخر غير متصل حالياً');
            return;
        }
        CallDiagnostics.addLog('✅ الطرف الآخر متصل', 'success');
        
        if (this.isInCall) {
            CallDiagnostics.addLog('❌ مكالمة قيد التشغيل بالفعل', 'error');
            return;
        }
        
        this.isInCall = true;
        this.isRinging = true;
        
        try {
            const silentAudio = new Audio();
            silentAudio.volume = 0;
            silentAudio.play().catch(() => {});
            
            const constraints = { audio: true, video: false };
            CallDiagnostics.addLog('🎤 طلب الوصول إلى الميكروفون...', 'info');
            
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
            
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
                CallDiagnostics.addLog(`➕ إضافة ${track.kind} track`, 'info');
            });
            this.dc = this.pc.createDataChannel('chat'); 
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { 
                if (e.candidate) {
                    this.sendSignal(calleeId, { candidate: e.candidate });
                }
            };
            
            this.pc.ontrack = e => {
                CallDiagnostics.addLog(`📡 استقبال مسار ${e.track.kind}`, 'success');
                if (e.track.kind === 'audio') {
                    e.track.enabled = true;
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pc.onconnectionstatechange = () => {
                CallDiagnostics.addLog(`🔌 حالة الاتصال: ${this.pc?.connectionState}`, 'info');
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) 
                    this.endCall();
            };
            
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false }); 
            CallDiagnostics.addLog('📝 تم إنشاء العرض (Offer)', 'success');
            
            await this.pc.setLocalDescription(offer);
            CallDiagnostics.addLog('✅ تم تعيين LocalDescription', 'success');
            
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription });
            CallDiagnostics.addLog(`📤 تم إرسال الإشارة`, 'success');
            
            this.callTimeout = setTimeout(() => {
                if (this.isRinging) {
                    CallDiagnostics.addLog('⏰ لم يتم الرد خلال 30 ثانية', 'error');
                    alert('لم يتم الرد على المكالمة');
                    this.endCall();
                }
            }, 30000);
            
        } catch (e) { 
            CallDiagnostics.addLog(`❌ خطأ: ${e.name} - ${e.message}`, 'error');
            this.endCall(); 
            if (e.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الميكروفون');
            }
        }
    },
    
    setupRemoteAudio(stream) {
        if (this.remoteAudioElement) {
            this.remoteAudioElement.pause();
            this.remoteAudioElement.srcObject = null;
        }
        
        this.remoteAudioElement = new Audio();
        this.remoteAudioElement.srcObject = stream;
        this.remoteAudioElement.autoplay = true;
        
        this.applySpeakerSettings();
        
        this.remoteAudioElement.play().then(() => {
            CallDiagnostics.addLog('🎵 تم تشغيل الصوت بنجاح', 'success');
        }).catch(e => {
            CallDiagnostics.addLog(`❌ فشل تشغيل الصوت: ${e.message}`, 'error');
        });
    },
    
    applySpeakerSettings() {
        if (!this.remoteAudioElement) return;
        
        if (this.remoteAudioElement.setSinkId) {
            if (this.isSpeakerEnabled) {
                this.remoteAudioElement.setSinkId('speaker').then(() => {
                    CallDiagnostics.addLog('✅ تم التبديل إلى السماعة الخارجية', 'success');
                }).catch(e => {
                    CallDiagnostics.addLog(`❌ فشل التبديل إلى السماعة الخارجية`, 'error');
                });
            } else {
                this.remoteAudioElement.setSinkId('default').then(() => {
                    CallDiagnostics.addLog('✅ تم التبديل إلى السماعة الداخلية', 'success');
                }).catch(e => {
                    CallDiagnostics.addLog(`❌ فشل التبديل إلى السماعة الداخلية`, 'error');
                });
            }
        } else {
            CallDiagnostics.addLog('⚠️ المتصفح لا يدعم تغيير مخرج الصوت', 'error');
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
    
    showIncomingCall(callerId, callData) {
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const contactAvatar = document.querySelector('#conversationAvatar')?.textContent || '👤';
        
        CallDiagnostics.addLog(`📞 مكالمة واردة من ${callerId.substring(0, 8)}... - عرض شاشة القبول`, 'info');
        
        // إزالة أي شاشة قبول سابقة
        const existingOverlay = document.getElementById('incomingCall');
        if (existingOverlay) existingOverlay.remove();
        
        const overlay = document.createElement('div'); overlay.id = 'incomingCall';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;';
        overlay.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:5rem;margin-bottom:10px;">${contactAvatar}</div>
                <div style="font-size:1.8rem;font-weight:bold;">${contactName}</div>
                <div style="font-size:1rem;margin-top:8px;color:#ccc;">يتصل بك...</div>
            </div>
            <div style="display:flex;gap:40px;">
                <button id="btnAccept" style="width:80px;height:80px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.3);">
                    <i class="fas fa-phone"></i>
                </button>
                <button id="btnReject" style="width:80px;height:80px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.3);">
                    <i class="fas fa-phone-slash"></i>
                </button>
            </div>`;
        document.body.appendChild(overlay);
        
        document.getElementById('btnAccept').onclick = () => { 
            CallDiagnostics.addLog('✅ تم قبول المكالمة', 'success');
            overlay.remove(); 
            this.receiveCall(callerId, callData); 
        };
        document.getElementById('btnReject').onclick = () => { 
            CallDiagnostics.addLog('❌ تم رفض المكالمة', 'error');
            overlay.remove(); 
            this.sendCallRejected();
            this.endCall();
        };
    },
    
    async receiveCall(callerId, callData) {
        CallDiagnostics.addLog(`📞 استقبال مكالمة من ${callerId.substring(0, 8)}...`, 'info');
        
        if (this.isInCall) {
            CallDiagnostics.addLog('❌ مكالمة قيد التشغيل بالفعل', 'error');
            return;
        }
        this.isInCall = true;
        this.isRinging = false;
        
        if (this.callTimeout) {
            clearTimeout(this.callTimeout);
            this.callTimeout = null;
        }
        
        try {
            const silentAudio = new Audio();
            silentAudio.volume = 0;
            silentAudio.play().catch(() => {});
            
            const constraints = { audio: true, video: false };
            CallDiagnostics.addLog('🎤 طلب الميكروفون...', 'info');
            
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
            this.pc.ontrack = e => {
                CallDiagnostics.addLog(`📡 استقبال مسار ${e.track.kind}`, 'success');
                if (e.track.kind === 'audio') {
                    e.track.enabled = true;
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            this.pc.onconnectionstatechange = () => {
                CallDiagnostics.addLog(`🔌 حالة الاتصال: ${this.pc?.connectionState}`, 'info');
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) 
                    this.endCall();
            };
            
            if (callData.sdp) { 
                CallDiagnostics.addLog('📝 تعيين RemoteDescription', 'info');
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp)); 
                const answer = await this.pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: false }); 
                CallDiagnostics.addLog('📝 تم إنشاء الإجابة (Answer)', 'success');
                await this.pc.setLocalDescription(answer); 
                await this.sendSignal(callerId, { sdp: this.pc.localDescription }); 
                CallDiagnostics.addLog('✅ تم إرسال الإجابة', 'success');
            }
        } catch (e) { 
            CallDiagnostics.addLog(`❌ خطأ: ${e.name} - ${e.message}`, 'error');
            this.endCall(); 
            if (e.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الميكروفون');
            }
        }
    },
    
    async handleSignaling(data) {
        try {
            CallDiagnostics.addLog(`📡 معالجة إشارة واردة: ${data.sdp ? 'SDP ' + data.sdp.type : (data.candidate ? 'ICE candidate' : 'unknown')}`, 'info');
            if (!this.pc) { 
                CallDiagnostics.addLog('📞 إنشاء اتصال جديد للمعالجة', 'info');
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
                    CallDiagnostics.addLog('✅ تم إرسال الرد على العرض', 'success');
                } 
            }
            else if (data.candidate) {
                if (this.pc && data.candidate) {
                    await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            }
        } catch (e) { CallDiagnostics.addLog(`❌ خطأ في معالجة الإشارة: ${e.message}`, 'error'); }
    },
    
    async sendSignal(calleeId, data) {
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) {
                CallDiagnostics.addLog('❌ فشل الحصول على المفاتيح للتشفير', 'error');
                return;
            }
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'webrtc', data: encrypted, timestamp: Date.now() });
            CallDiagnostics.addLog('✅ تم إرسال الإشارة', 'success');
        } catch (error) {
            CallDiagnostics.addLog(`❌ فشل إرسال الإشارة: ${error.message}`, 'error');
        }
    },
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !this.isMuted;
            }
        }
        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) {
            if (this.isMuted) {
                muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                muteBtn.style.background = '#f44336';
                muteBtn.style.color = 'white';
            } else {
                muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                muteBtn.style.background = 'rgba(0,0,0,0.6)';
                muteBtn.style.color = 'white';
            }
        }
    },
    
    toggleSpeaker() {
        this.isSpeakerEnabled = !this.isSpeakerEnabled;
        this.applySpeakerSettings();
        
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            if (this.isSpeakerEnabled) {
                speakerBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                speakerBtn.style.background = '#2196F3';
                speakerBtn.style.color = 'white';
            } else {
                speakerBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
                speakerBtn.style.background = 'rgba(0,0,0,0.6)';
                speakerBtn.style.color = 'white';
            }
        }
    },
    
    showCallUI() { 
        document.body.classList.add('in-call'); 
        const existingUi = document.getElementById('callUI');
        if (existingUi) existingUi.remove();
        
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const contactAvatar = document.querySelector('#conversationAvatar')?.textContent || '👤';
        
        const ui = document.createElement('div'); ui.id = 'callUI'; 
        ui.innerHTML = `
            <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg, #1a1a2e, #16213e);z-index:9997;"></div>
            <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;text-align:center;">
                <div style="font-size:5rem;margin-bottom:10px;">${contactAvatar}</div>
                <div style="font-size:1.5rem;color:white;font-weight:bold;">${contactName}</div>
                <div style="margin-top:5px;color:#aaa;font-size:0.8rem;" id="callTimer">00:00</div>
            </div>
            <div style="position:fixed;bottom:40px;left:0;right:0;z-index:9999;display:flex;justify-content:center;gap:30px;">
                <button id="speakerBtn" onclick="CallSystem.toggleSpeaker()" style="width:55px;height:55px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.3rem;cursor:pointer;transition:0.2s;">
                    <i class="fas fa-volume-up"></i>
                </button>
                <button id="endCallBtn" onclick="CallSystem.endCall()" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.8rem;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.3);transition:0.2s;">
                    <i class="fas fa-phone-slash"></i>
                </button>
                <button id="muteBtn" onclick="CallSystem.toggleMute()" style="width:55px;height:55px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.3rem;cursor:pointer;transition:0.2s;">
                    <i class="fas fa-microphone"></i>
                </button>
            </div>
        `;
        document.body.appendChild(ui);
        this.startCallTimer();
        
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            speakerBtn.style.background = 'rgba(0,0,0,0.6)';
        }
        CallDiagnostics.addLog('📱 واجهة المكالمة ظهرت', 'success');
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
    
    endCall() { 
        CallDiagnostics.addLog('📞 إنهاء المكالمة', 'info');
        this.isInCall = false; 
        this.isRinging = false;
        
        if (this.callTimeout) {
            clearTimeout(this.callTimeout);
            this.callTimeout = null;
        }
        
        this.sendCallStatus('disconnected');
        
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        if (this.remoteAudioElement) {
            this.remoteAudioElement.pause();
            this.remoteAudioElement.srcObject = null;
            this.remoteAudioElement = null;
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
        CallDiagnostics.addLog('✅ تم إنهاء المكالمة', 'success');
        setTimeout(() => CallDiagnostics.clear(), 3000);
    },
    
    cleanupConnections() { 
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } 
        if (this.keepAliveInterval) { clearInterval(this.keepAliveInterval); this.keepAliveInterval = null; }
        if (this.dc) { this.dc.close(); this.dc = null; } 
        if (this.pc) { this.pc.close(); this.pc = null; } 
        this.incomingChunks = {}; 
        this.incomingFileInfo = {}; 
    }
};

window.startAudioCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat); };
