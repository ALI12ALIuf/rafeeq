// ========== webrtc-call.js ==========
// نظام اتصال WebRTC - مكالمات صوتية فقط + إرسال الملفات والصور والبصمات

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false,
    incomingChunks: {}, incomingFileInfo: {},
    reconnectTimer: null, maxReconnectAttempts: 3, reconnectAttempts: 0,
    callTimerInterval: null, keepAliveInterval: null,
    isMuted: false, isSpeakerEnabled: false,
    remoteAudioElement: null,
    pendingCallData: null, // تخزين بيانات المكالمة الواردة
    isCalling: false, // لمنع المكالمات المتكررة
    servers: { 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ] 
    },
    
    // ✅ إرسال إشارة رفض المكالمة
    async sendReject(calleeId) {
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ type: 'call_reject' }), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'webrtc_reject', data: encrypted, timestamp: Date.now() });
        } catch (error) {
            console.error('فشل إرسال الرفض:', error);
        }
    },

    // ✅ معالجة إشارة الرفض
    async handleReject() {
        if (!this.isCalling) return;
        this.isCalling = false;
        if (this.isInCall) {
            this.endCall();
        } else {
            // إلغاء المكالمة الصادرة
            alert('❌ الطرف الآخر رفض المكالمة');
            this.cleanupConnections();
            const ui = document.getElementById('callUI');
            if (ui) ui.remove();
        }
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
                if (msg.chunk !== undefined) { this.handleChunkMessage(msg); return; }
                const displayMsg = { id: msg.id || Date.now().toString(), type: msg.type, data: msg.data, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
                if (ChatSystem.currentChat) { ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg); ChatSystem.displayMessage(displayMsg); }
            } catch (error) {}
        };
        channel.onopen = () => { 
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
            this.sendCallStatus('disconnected');
            if (this.keepAliveInterval) {
                clearInterval(this.keepAliveInterval);
                this.keepAliveInterval = null;
            }
            this.scheduleReconnect(); 
        };
        channel.onerror = () => { this.scheduleReconnect(); };
    },
    
    handleCallStatus(msg) {
        if (msg.status === 'connected') {
            console.log('📞 الطرف الآخر متصل');
        } else if (msg.status === 'disconnected') {
            console.log('📞 الطرف الآخر قطع الاتصال');
            if (this.isInCall) {
                alert('الطرف الآخر أنهى المكالمة');
                this.endCall();
            }
        }
    },
    
    sendCallStatus(status) {
        if (this.dc && this.dc.readyState === 'open') {
            this.dc.send(JSON.stringify({ type: 'call_status', status: status, timestamp: Date.now() }));
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
        this.reconnectTimer = setTimeout(async () => { try { if (ChatSystem.currentChat && ChatSystem.friendOnline) await this.ensureDataChannel(ChatSystem.currentChat); } catch (error) {} this.reconnectTimer = null; }, delay);
    },

    // ✅ بدء المكالمة (المستخدم يضغط على زر الاتصال)
    async startCall(calleeId) {
        // منع بدء مكالمة جديدة إذا كان هناك مكالمة نشطة أو جارية
        if (!window.auth?.currentUser || this.isInCall || this.isCalling) {
            console.warn('لا يمكن بدء مكالمة: مكالمة نشطة أو جارية بالفعل');
            return;
        }
        
        this.isCalling = true;
        
        try {
            // طلب إذن الميكروفون أولاً (بدون إنشاء PeerConnection)
            const constraints = { audio: true, video: false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // التحقق من وجود مسارات صوتية
            const audioTracks = this.localStream.getAudioTracks();
            if (audioTracks.length === 0) {
                throw new Error('لا يمكن الوصول إلى الميكروفون');
            }
            
            // إنشاء PeerConnection الجديد
            this.pc = new RTCPeerConnection({
                iceServers: this.servers.iceServers,
                iceTransportPolicy: 'all'
            });
            
            // إضافة المسارات الصوتية
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
            });
            
            // إنشاء Data Channel
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            
            // إعداد معالجات الأحداث
            this.pc.onicecandidate = e => { 
                if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }); 
            };
            
            this.pc.ontrack = e => {
                if (e.track.kind === 'audio') {
                    e.track.enabled = true;
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            // إنشاء العرض وإرساله
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription });
            
            // عرض واجهة المستخدم للمكالمة الصادرة
            this.showCallUI();
            this.isInCall = true;
            
        } catch (e) { 
            this.isCalling = false;
            this.endCall(); 
            if (e.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الميكروفون');
            } else {
                alert('فشل بدء المكالمة: ' + e.message);
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
        
        // تطبيق إعداد السماعة فوراً
        this.applySpeakerSettings();
        
        this.remoteAudioElement.play().catch(e => console.log('تشغيل الصوت فشل:', e));
    },
    
    applySpeakerSettings() {
        if (!this.remoteAudioElement) return;
        
        // استخدام setSinkId للتحكم في مخرج الصوت
        if (this.remoteAudioElement.setSinkId) {
            if (this.isSpeakerEnabled) {
                // استخدام السماعة الخارجية (السفلية)
                this.remoteAudioElement.setSinkId('speaker').then(() => {
                    console.log('✅ تم التبديل إلى السماعة الخارجية');
                }).catch(e => {
                    console.log('❌ فشل التبديل إلى السماعة الخارجية:', e);
                    this.fallbackSpeakerMode();
                });
            } else {
                // استخدام السماعة الداخلية (العلوية - وضع المكالمة العادي)
                this.remoteAudioElement.setSinkId('default').then(() => {
                    console.log('✅ تم التبديل إلى السماعة الداخلية');
                }).catch(e => {
                    console.log('❌ فشل التبديل إلى السماعة الداخلية:', e);
                });
            }
        } else {
            // المتصفح لا يدعم setSinkId
            console.log('⚠️ المتصفح لا يدعم تغيير مخرج الصوت');
            this.fallbackSpeakerMode();
        }
    },
    
    fallbackSpeakerMode() {
        // حل بديل: تغيير المسار عبر إنشاء عنصر Audio جديد
        if (this.isSpeakerEnabled && this.remoteAudioElement) {
            // محاولة إجبار الصوت على السماعة الخارجية عبر إنشاء عنصر جديد بدون قيود
            const stream = this.remoteAudioElement.srcObject;
            if (stream) {
                const newAudio = new Audio();
                newAudio.srcObject = stream;
                newAudio.autoplay = true;
                newAudio.volume = 1;
                // إيقاف القديم وتشغيل الجديد
                this.remoteAudioElement.pause();
                this.remoteAudioElement = newAudio;
                newAudio.play().catch(e => console.log('فشل التشغيل البديل:', e));
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
    
    // ✅ عرض شاشة المكالمة الواردة مع خيار القبول أو الرفض
    showIncomingCall(callerId, callData) {
        // إذا كان المستخدم في مكالمة بالفعل، نرفض المكالمة الجديدة تلقائياً
        if (this.isInCall || this.isCalling) {
            this.sendReject(callerId);
            return;
        }
        
        // تخزين بيانات المكالمة لاستخدامها عند القبول
        this.pendingCallData = { callerId, callData };
        
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const contactAvatar = document.querySelector('#conversationAvatar')?.textContent || '👤';
        
        // إزالة أي شاشة دخول قديمة
        const existingOverlay = document.getElementById('incomingCall');
        if (existingOverlay) existingOverlay.remove();
        
        const overlay = document.createElement('div'); 
        overlay.id = 'incomingCall';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;backdrop-filter:blur(10px);';
        overlay.innerHTML = `
            <div style="text-align:center; animation: pulse 1.5s infinite;">
                <div style="font-size:5rem;margin-bottom:10px;">${contactAvatar}</div>
                <div style="font-size:1.8rem;font-weight:bold;">${contactName}</div>
                <div style="font-size:1rem;margin-top:8px;color:#4CAF50;">🔔 يتصل بك...</div>
            </div>
            <div style="display:flex;gap:40px;">
                <button id="btnAccept" style="width:80px;height:80px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;box-shadow:0 4px 15px rgba(76,175,80,0.4);transition:transform 0.2s;">
                    <i class="fas fa-phone"></i>
                </button>
                <button id="btnReject" style="width:80px;height:80px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;box-shadow:0 4px 15px rgba(244,67,54,0.4);transition:transform 0.2s;">
                    <i class="fas fa-phone-slash"></i>
                </button>
            </div>
        `;
        
        // إضافة تأثير hover للأزرار
        const style = document.createElement('style');
        style.textContent = `
            #btnAccept:hover, #btnReject:hover { transform: scale(1.05); }
            @keyframes pulse {
                0% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.02); opacity: 0.9; }
                100% { transform: scale(1); opacity: 1; }
            }
        `;
        overlay.appendChild(style);
        document.body.appendChild(overlay);
        
        // معالج قبول المكالمة
        document.getElementById('btnAccept').onclick = async () => {
            overlay.remove();
            if (this.pendingCallData) {
                await this.receiveCall(this.pendingCallData.callerId, this.pendingCallData.callData);
                this.pendingCallData = null;
            }
        };
        
        // معالج رفض المكالمة
        document.getElementById('btnReject').onclick = async () => {
            overlay.remove();
            if (this.pendingCallData) {
                await this.sendReject(this.pendingCallData.callerId);
                this.pendingCallData = null;
            }
        };
    },
    
    // ✅ قبول المكالمة
    async receiveCall(callerId, callData) {
        // منع قبول مكالمة إذا كان هناك مكالمة نشطة
        if (this.isInCall || this.isCalling) {
            await this.sendReject(callerId);
            return;
        }
        
        this.isInCall = true;
        
        try {
            // طلب إذن الميكروفون
            const constraints = { audio: true, video: false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // التحقق من وجود مسارات صوتية
            const audioTracks = this.localStream.getAudioTracks();
            if (audioTracks.length === 0) {
                throw new Error('لا يمكن الوصول إلى الميكروفون');
            }
            
            // إنشاء PeerConnection الجديد
            this.pc = new RTCPeerConnection({
                iceServers: this.servers.iceServers,
                iceTransportPolicy: 'all'
            });
            
            // إضافة المسارات الصوتية
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
            });
            
            // إعداد معالج المسار الصوتي الوارد
            this.pc.ontrack = e => {
                if (e.track.kind === 'audio') {
                    e.track.enabled = true;
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            // إعداد Data Channel (سيتم إنشاؤه من قبل الطرف المتصل)
            this.pc.ondatachannel = e => { 
                this.setupDataChannel(e.channel); 
                this.dc = e.channel; 
            };
            
            // إعداد معالج ICE المرشح
            this.pc.onicecandidate = e => { 
                if (e.candidate) this.sendSignal(callerId, { candidate: e.candidate }); 
            };
            
            // إعداد معالج حالة الاتصال
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            // تعيين الوصف البعيد (العرض) وإنشاء الرد
            if (callData.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp));
                const answer = await this.pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
                await this.pc.setLocalDescription(answer);
                await this.sendSignal(callerId, { sdp: this.pc.localDescription });
            }
            
            // عرض واجهة المكالمة
            this.showCallUI();
            
        } catch (e) { 
            this.endCall(); 
            if (e.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الميكروفون');
            } else {
                alert('فشل قبول المكالمة: ' + e.message);
            }
        }
    },
    
    // ✅ معالجة إشارات WebRTC (عرض أو مرشح)
    async handleSignaling(data) {
        try {
            // إذا لم يكن هناك PC ونحن في مكالمة، نحتاج إلى إنشائه
            if (!this.pc && this.isInCall) {
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
        } catch (e) { 
            console.warn('Signaling error:', e);
        }
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
            <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg, #1a1a2e, #16213e);z-index:9998;"></div>
            <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;text-align:center;">
                <div style="font-size:5rem;margin-bottom:10px;">${contactAvatar}</div>
                <div style="font-size:1.5rem;color:white;font-weight:bold;">${contactName}</div>
                <div style="margin-top:5px;color:#aaa;font-size:0.8rem;" id="callTimer">00:00</div>
            </div>
            <div style="position:fixed;bottom:40px;left:0;right:0;z-index:9999;display:flex;justify-content:center;gap:30px;">
                <button id="speakerBtn" style="width:55px;height:55px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.3rem;cursor:pointer;transition:0.2s;">
                    <i class="fas fa-volume-up"></i>
                </button>
                <button id="endCallBtn" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.8rem;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.3);transition:0.2s;">
                    <i class="fas fa-phone-slash"></i>
                </button>
                <button id="muteBtn" style="width:55px;height:55px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.3rem;cursor:pointer;transition:0.2s;">
                    <i class="fas fa-microphone"></i>
                </button>
            </div>
        `;
        document.body.appendChild(ui);
        
        // ربط الأزرار
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            speakerBtn.onclick = () => this.toggleSpeaker();
        }
        
        const endCallBtn = document.getElementById('endCallBtn');
        if (endCallBtn) {
            endCallBtn.onclick = () => this.endCall();
        }
        
        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) {
            muteBtn.onclick = () => this.toggleMute();
        }
        
        this.startCallTimer();
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
    
    // ✅ إنهاء المكالمة (من أي طرف)
    endCall() { 
        if (!this.isInCall && !this.isCalling) return;
        
        this.isInCall = false; 
        this.isCalling = false;
        
        // إرسال حالة قطع الاتصال للطرف الآخر
        this.sendCallStatus('disconnected');
        
        // تنظيف المؤقتات
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        
        // تنظيف الصوت البعيد
        if (this.remoteAudioElement) {
            this.remoteAudioElement.pause();
            this.remoteAudioElement.srcObject = null;
            this.remoteAudioElement = null;
        }
        
        // إزالة واجهة المستخدم
        document.body.classList.remove('in-call'); 
        
        // إيقاف مسارات الصوت المحلية
        if (this.localStream) { 
            this.localStream.getTracks().forEach(t => t.stop()); 
            this.localStream = null; 
        } 
        
        // تنظيف الاتصالات
        this.cleanupConnections(); 
        
        // إزالة عناصر واجهة المستخدم
        const ui = document.getElementById('callUI'); 
        if (ui) ui.remove(); 
        const inc = document.getElementById('incomingCall'); 
        if (inc) inc.remove(); 
        
        // تنظيف البيانات المعلقة
        this.pendingCallData = null;
    },
    
    cleanupConnections() { 
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } 
        if (this.keepAliveInterval) { clearInterval(this.keepAliveInterval); this.keepAliveInterval = null; }
        if (this.dc) { 
            try { this.dc.close(); } catch(e) {}
            this.dc = null; 
        } 
        if (this.pc) { 
            try { this.pc.close(); } catch(e) {}
            this.pc = null; 
        } 
        this.incomingChunks = {}; 
        this.incomingFileInfo = {}; 
    }
};

// دالة بدء المكالمة من زر الواجهة
window.startAudioCall = async () => { 
    if (!ChatSystem.currentChat) {
        console.warn('لا توجد محادثة حالية');
        return;
    }
    if (CallSystem.isInCall || CallSystem.isCalling) {
        console.warn('مكالمة قيد التقدم بالفعل');
        return;
    }
    await CallSystem.startCall(ChatSystem.currentChat); 
};
