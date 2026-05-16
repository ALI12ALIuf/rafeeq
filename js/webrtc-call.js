// ========== webrtc-call.js - نسخة مفصولة بالكامل ==========
// فصل تام بين: 1- المكالمات الصوتية  2- مكالمات الفيديو

const CallSystem = {
    // المتغيرات العامة
    pc: null, dc: null, localStream: null, isInCall: false,
    incomingChunks: {}, incomingFileInfo: {},
    reconnectTimer: null, maxReconnectAttempts: 3, reconnectAttempts: 0,
    callTimerInterval: null,
    currentCallType: null,  // 'audio' أو 'video'
    
    // خوادم ICE
    servers: { 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ] 
    },
    
    // ==================== دوال مساعدة عامة ====================
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
    
    // ==================== المكالمات الصوتية (منفصلة تماماً) ====================
    async startAudioCall(calleeId) {
        if (!window.auth?.currentUser || this.isInCall) return;
        
        this.currentCallType = 'audio';
        this.isInCall = true;
        
        try {
            // طلب الميكروفون فقط
            const constraints = { audio: true, video: false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // عرض واجهة المكالمة الصوتية
            this.showAudioCallUI();
            
            // إنشاء اتصال WebRTC
            this.pc = new RTCPeerConnection(this.servers);
            
            // إضافة مسار الصوت فقط
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
            });
            
            // قناة البيانات
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            
            // معالجة المرشحات
            this.pc.onicecandidate = e => { 
                if (e.candidate) {
                    this.sendSignal(calleeId, { candidate: e.candidate, callType: 'audio' });
                }
            };
            
            // استقبال الصوت البعيد
            this.pc.ontrack = e => {
                // الصوت يتم تشغيله تلقائياً، لا حاجة لعنصر video
                console.log('تم استلام مسار صوتي');
            };
            
            this.pc.onconnectionstatechange = () => { 
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) 
                    this.endCall(); 
            };
            
            // إنشاء العرض (Offer) - طلب استقبال صوت فقط
            const offer = await this.pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
            });
            await this.pc.setLocalDescription(offer);
            
            await this.sendSignal(calleeId, { 
                sdp: this.pc.localDescription,
                callType: 'audio'
            });
            
        } catch (e) { 
            this.endCall(); 
            alert('خطأ في بدء المكالمة الصوتية: ' + (e.message || 'يرجى السماح بالوصول إلى الميكروفون'));
        }
    },
    
    // واجهة المكالمة الصوتية فقط
    showAudioCallUI() {
        document.body.classList.add('in-call');
        const ui = document.createElement('div');
        ui.id = 'callUI';
        ui.innerHTML = `
            <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg, #1a1a2e, #16213e);z-index:9997;"></div>
            <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;text-align:center;">
                <div style="background:linear-gradient(135deg, #667eea, #764ba2);border-radius:50%;width:120px;height:120px;display:flex;align-items:center;justify-content:center;margin:0 auto;box-shadow:0 4px 15px rgba(0,0,0,0.3);">
                    <i class="fas fa-phone" style="font-size:3rem;color:white;"></i>
                </div>
                <div style="margin-top:20px;color:white;font-size:1.2rem;font-weight:bold;">مكالمة صوتية</div>
                <div style="margin-top:5px;color:#aaa;font-size:0.8rem;" id="callTimer">00:00</div>
            </div>
            <div style="position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:30px;">
                <button id="audioMuteBtn" style="width:60px;height:60px;border-radius:50%;background:#333;color:white;border:none;font-size:1.5rem;cursor:pointer;">
                    <i class="fas fa-microphone"></i>
                </button>
                <button id="endCallBtn" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.8rem;cursor:pointer;">
                    <i class="fas fa-phone-slash"></i>
                </button>
            </div>
        `;
        document.body.appendChild(ui);
        
        // ربط الأحداث
        document.getElementById('audioMuteBtn').onclick = () => this.toggleAudio();
        document.getElementById('endCallBtn').onclick = () => this.endCall();
        
        this.startCallTimer();
    },
    
    // ==================== مكالمات الفيديو (منفصلة تماماً) ====================
    async startVideoCall(calleeId) {
        if (!window.auth?.currentUser || this.isInCall) return;
        
        this.currentCallType = 'video';
        this.isInCall = true;
        
        try {
            // طلب الميكروفون والكاميرا
            const constraints = { 
                audio: true,
                video: { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // عرض واجهة الفيديو
            this.showVideoCallUI();
            
            this.pc = new RTCPeerConnection(this.servers);
            
            // إضافة جميع المسارات
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
            });
            
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { 
                if (e.candidate) {
                    this.sendSignal(calleeId, { candidate: e.candidate, callType: 'video' });
                }
            };
            
            this.pc.ontrack = e => { 
                const rv = document.getElementById('remoteVideo');
                if (rv && e.streams[0]) {
                    rv.srcObject = e.streams[0];
                }
            };
            
            this.pc.onconnectionstatechange = () => { 
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) 
                    this.endCall(); 
            };
            
            const offer = await this.pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await this.pc.setLocalDescription(offer);
            
            await this.sendSignal(calleeId, { 
                sdp: this.pc.localDescription,
                callType: 'video'
            });
            
        } catch (e) { 
            this.endCall(); 
            alert('خطأ في بدء مكالمة الفيديو: ' + (e.message || 'يرجى السماح بالوصول إلى الكاميرا والميكروفون'));
        }
    },
    
    // واجهة مكالمة الفيديو فقط
    showVideoCallUI() {
        document.body.classList.add('in-call');
        const ui = document.createElement('div');
        ui.id = 'callUI';
        ui.innerHTML = `
            <video id="remoteVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;position:fixed;top:0;left:0;z-index:9998;background:#000;"></video>
            <video id="localVideo" autoplay playsinline muted style="width:120px;height:160px;object-fit:cover;position:fixed;bottom:100px;right:20px;z-index:9999;border-radius:12px;border:2px solid white;background:#333;box-shadow:0 2px 10px rgba(0,0,0,0.3);"></video>
            <div style="position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:20px;">
                <button id="switchCameraBtn" style="width:50px;height:50px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.2rem;cursor:pointer;">
                    <i class="fas fa-sync-alt"></i>
                </button>
                <button id="videoMuteBtn" style="width:50px;height:50px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.2rem;cursor:pointer;">
                    <i class="fas fa-microphone"></i>
                </button>
                <button id="endVideoCallBtn" style="width:60px;height:60px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.5rem;cursor:pointer;">
                    <i class="fas fa-phone-slash"></i>
                </button>
                <button id="toggleVideoBtn" style="width:50px;height:50px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.2rem;cursor:pointer;">
                    <i class="fas fa-video"></i>
                </button>
            </div>
            <div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(0,0,0,0.6);padding:8px 16px;border-radius:20px;color:white;font-size:0.9rem;" id="callTimer">00:00</div>
        `;
        document.body.appendChild(ui);
        
        // ربط الأحداث
        document.getElementById('switchCameraBtn').onclick = () => this.switchCamera();
        document.getElementById('videoMuteBtn').onclick = () => this.toggleAudio();
        document.getElementById('endVideoCallBtn').onclick = () => this.endCall();
        document.getElementById('toggleVideoBtn').onclick = () => this.toggleVideo();
        
        const lv = document.getElementById('localVideo');
        if (lv && this.localStream) lv.srcObject = this.localStream;
        
        this.startCallTimer();
    },
    
    // ==================== دوال استقبال المكالمات ====================
    showIncomingCall(callerId, callData) {
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const callType = callData.callType || 'audio';
        
        const overlay = document.createElement('div');
        overlay.id = 'incomingCall';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;';
        overlay.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:3rem;margin-bottom:10px;">${callType === 'video' ? '📹' : '🎧'}</div>
                <div style="font-size:1.5rem;">📞 ${contactName}</div>
                <div style="font-size:1rem;margin-top:8px;color:#ccc;">${callType === 'video' ? 'مكالمة فيديو' : 'مكالمة صوتية'}</div>
            </div>
            <div style="display:flex;gap:30px;">
                <button id="btnAccept" style="width:70px;height:70px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;">
                    <i class="fas fa-check"></i>
                </button>
                <button id="btnReject" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        document.body.appendChild(overlay);
        
        overlay._callData = { callerId, callData, callType };
        
        document.getElementById('btnAccept').onclick = () => {
            overlay.remove();
            this.receiveCall(callerId, callData);
        };
        document.getElementById('btnReject').onclick = () => {
            overlay.remove();
        };
    },
    
    async receiveCall(callerId, callData) {
        if (this.isInCall) return;
        
        const callType = callData.callType || 'audio';
        this.currentCallType = callType;
        this.isInCall = true;
        
        try {
            let constraints;
            let isVideo = (callType === 'video');
            
            if (isVideo) {
                constraints = {
                    audio: true,
                    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
                };
                this.showVideoCallUI();
            } else {
                constraints = { audio: true, video: false };
                this.showAudioCallUI();
            }
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (!isVideo) {
                // تحديث واجهة الصوت لعرض timer فقط
                const timerEl = document.getElementById('callTimer');
                if (timerEl) timerEl.style.display = 'block';
            }
            
            this.pc = new RTCPeerConnection(this.servers);
            
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
            });
            
            this.pc.onicecandidate = e => {
                if (e.candidate) {
                    this.sendSignal(callerId, { candidate: e.candidate, callType: this.currentCallType });
                }
            };
            
            this.pc.ontrack = e => {
                if (isVideo) {
                    const rv = document.getElementById('remoteVideo');
                    if (rv && e.streams[0]) rv.srcObject = e.streams[0];
                }
                // الصوت يعمل تلقائياً في كلا الحالتين
            };
            
            this.pc.ondatachannel = e => {
                this.setupDataChannel(e.channel);
                this.dc = e.channel;
            };
            
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected'))
                    this.endCall();
            };
            
            if (callData.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp));
                
                const answerOptions = {
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: isVideo
                };
                
                const answer = await this.pc.createAnswer(answerOptions);
                await this.pc.setLocalDescription(answer);
                await this.sendSignal(callerId, {
                    sdp: this.pc.localDescription,
                    callType: this.currentCallType
                });
            }
        } catch (e) {
            this.endCall();
            alert('خطأ في استقبال المكالمة: ' + (e.message || 'يرجى السماح بالوصول إلى الميكروفون/الكاميرا'));
        }
    },
    
    async handleSignaling(data) {
        try {
            if (!this.pc) {
                this.pc = new RTCPeerConnection(this.servers);
                this.pc.ondatachannel = e => {
                    this.dc = e.channel;
                    this.setupDataChannel(this.dc);
                };
                this.pc.onicecandidate = e => {
                    if (e.candidate) {
                        this.sendSignal(ChatSystem.currentChat, { candidate: e.candidate }).catch(() => {});
                    }
                };
            }
            
            if (data.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                if (data.sdp.type === 'offer') {
                    const callType = data.callType || 'audio';
                    const isVideo = (callType === 'video');
                    
                    const answerOptions = {
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: isVideo
                    };
                    
                    const answer = await this.pc.createAnswer(answerOptions);
                    await this.pc.setLocalDescription(answer);
                    await this.sendSignal(ChatSystem.currentChat, {
                        sdp: this.pc.localDescription,
                        callType: callType
                    });
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
    
    // ==================== دوال التحكم ====================
    async switchCamera() {
        if (!this.localStream) return;
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (!videoTrack) return;
        
        const currentFacing = videoTrack.getSettings().facingMode;
        const newFacing = currentFacing === 'user' ? 'environment' : 'user';
        videoTrack.stop();
        
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: newFacing, width: { ideal: 640 }, height: { ideal: 480 } }
            });
            const newVideoTrack = newStream.getVideoTracks()[0];
            
            if (this.pc) {
                const sender = this.pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) await sender.replaceTrack(newVideoTrack);
            }
            
            const audioTrack = this.localStream.getAudioTracks()[0];
            this.localStream = new MediaStream([newVideoTrack, audioTrack].filter(Boolean));
            const lv = document.getElementById('localVideo');
            if (lv) lv.srcObject = this.localStream;
        } catch (e) {}
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
                const icon = at.enabled ? 'fa-microphone' : 'fa-microphone-slash';
                const btns = document.querySelectorAll('#callUI button i');
                btns.forEach(btn => {
                    if (btn.classList.contains('fa-microphone') || btn.classList.contains('fa-microphone-slash')) {
                        btn.className = `fas ${icon}`;
                    }
                });
            }
        }
    },
    
    toggleVideo() {
        if (this.localStream) {
            const vt = this.localStream.getVideoTracks()[0];
            if (vt) {
                vt.enabled = !vt.enabled;
                const icon = vt.enabled ? 'fa-video' : 'fa-video-slash';
                const btns = document.querySelectorAll('#callUI button i');
                btns.forEach(btn => {
                    if (btn.classList.contains('fa-video') || btn.classList.contains('fa-video-slash')) {
                        btn.className = `fas ${icon}`;
                    }
                });
            }
        }
    },
    
    endCall() {
        this.isInCall = false;
        this.currentCallType = null;
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
    },
    
    cleanupConnections() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.dc) {
            this.dc.close();
            this.dc = null;
        }
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        this.incomingChunks = {};
        this.incomingFileInfo = {};
    }
};

// دوال البدء العامة
window.startVideoCall = async () => {
    if (!ChatSystem.currentChat) return;
    await CallSystem.startVideoCall(ChatSystem.currentChat);
};

window.startAudioCall = async () => {
    if (!ChatSystem.currentChat) return;
    await CallSystem.startAudioCall(ChatSystem.currentChat);
};
