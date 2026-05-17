// ========== webrtc-call.js ==========
// نظام اتصال WebRTC - مكالمات صوتية وفيديو + إرسال الملفات

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false, callType: null,
    incomingChunks: {}, incomingFileInfo: {},
    reconnectTimer: null, maxReconnectAttempts: 3, reconnectAttempts: 0,
    callTimerInterval: null, keepAliveInterval: null,
    isAudioMuted: false, isVideoMuted: false, isSpeakerEnabled: false,
    remoteAudioElement: null,
    servers: { 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ] 
    },
    
    async startAudioCall(calleeId) {
        if (!window.auth?.currentUser || this.isInCall) {
            console.log('❌ لا يمكن بدء المكالمة');
            return;
        }
        this.isInCall = true;
        this.callType = 'audio';
        
        try {
            const silentAudio = new Audio();
            silentAudio.volume = 0;
            silentAudio.play().catch(() => {});
            
            console.log('🎤 بدء مكالمة صوتية إلى:', calleeId);
            const constraints = { audio: true, video: false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (this.localStream.getAudioTracks().length === 0) {
                this.endCall();
                alert('لا يمكن الوصول إلى الميكروفون');
                return;
            }
            
            this.showCallUI('audio');
            
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { 
                if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate });
            };
            
            this.pc.ontrack = e => {
                if (e.track.kind === 'audio') {
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: 'audio', timestamp: Date.now() });
            console.log('✅ تم إرسال طلب المكالمة');
            
        } catch (e) { 
            console.error('❌ خطأ:', e);
            this.endCall(); 
            if (e.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الميكروفون');
            }
        }
    },
    
    async startVideoCall(calleeId) {
        if (!window.auth?.currentUser || this.isInCall) return;
        this.isInCall = true;
        this.callType = 'video';
        
        try {
            console.log('📹 بدء مكالمة فيديو إلى:', calleeId);
            const constraints = { 
                audio: true, 
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
            };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (this.localStream.getAudioTracks().length === 0) {
                this.endCall();
                alert('لا يمكن الوصول إلى الميكروفون');
                return;
            }
            
            this.showCallUI('video');
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }); };
            this.pc.ontrack = e => {
                const rv = document.getElementById('remoteVideo');
                if (rv && e.streams[0]) rv.srcObject = e.streams[0];
            };
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) this.endCall();
            };
            
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: 'video', timestamp: Date.now() });
            
        } catch (e) { 
            this.endCall(); 
            if (e.name === 'NotAllowedError') alert('يرجى السماح بالوصول إلى الكاميرا والميكروفون');
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
        
        this.remoteAudioElement.play().catch(e => console.log('❌ فشل تشغيل الصوت:', e));
    },
    
    applySpeakerSettings() {
        if (!this.remoteAudioElement) return;
        if (this.remoteAudioElement.setSinkId) {
            if (this.isSpeakerEnabled) {
                this.remoteAudioElement.setSinkId('speaker').catch(() => {});
            } else {
                this.remoteAudioElement.setSinkId('default').catch(() => {});
            }
        }
    },
    
    async receiveCall(callerId, callData) {
        if (this.isInCall) {
            console.log('❌ مكالمة نشطة بالفعل');
            return;
        }
        
        this.isInCall = true;
        this.callType = callData.type || 'audio';
        console.log(`📞 قبول مكالمة ${this.callType === 'video' ? 'فيديو' : 'صوتية'} من ${callerId}`);
        
        try {
            const silentAudio = new Audio();
            silentAudio.volume = 0;
            silentAudio.play().catch(() => {});
            
            const constraints = { 
                audio: true, 
                video: this.callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (this.localStream.getAudioTracks().length === 0) {
                this.endCall();
                alert('لا يمكن الوصول إلى الميكروفون');
                return;
            }
            
            this.showCallUI(this.callType);
            
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(callerId, { candidate: e.candidate }); };
            
            this.pc.ontrack = e => {
                if (this.callType === 'video') {
                    const rv = document.getElementById('remoteVideo');
                    if (rv && e.streams[0]) rv.srcObject = e.streams[0];
                } else if (e.track.kind === 'audio') {
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pc.ondatachannel = e => {
                this.setupDataChannel(e.channel);
                this.dc = e.channel;
            };
            
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            if (callData.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp));
                const answerOptions = { offerToReceiveAudio: true, offerToReceiveVideo: this.callType === 'video' };
                const answer = await this.pc.createAnswer(answerOptions);
                await this.pc.setLocalDescription(answer);
                await this.sendSignal(callerId, { sdp: this.pc.localDescription });
                console.log('✅ تم إرسال الرد');
            }
        } catch (e) { 
            console.error('❌ خطأ:', e);
            this.endCall(); 
            if (e.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الميكروفون');
            }
        }
    },
    
    showIncomingCall(callerId, callData) {
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const contactAvatar = document.querySelector('#conversationAvatar')?.textContent || '👤';
        const callTypeText = callData.type === 'video' ? '📹 مكالمة فيديو' : '📞 مكالمة صوتية';
        
        // إزالة أي نافذة قديمة
        const existingOverlay = document.getElementById('incomingCall');
        if (existingOverlay) existingOverlay.remove();
        
        const overlay = document.createElement('div'); 
        overlay.id = 'incomingCall';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;';
        overlay.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:5rem;margin-bottom:10px;">${contactAvatar}</div>
                <div style="font-size:1.8rem;font-weight:bold;">${contactName}</div>
                <div style="font-size:1.2rem;margin-top:8px;color:#4CAF50;">${callTypeText}</div>
                <div style="font-size:0.9rem;margin-top:5px;color:#aaa;">قيد الاتصال...</div>
            </div>
            <div style="display:flex;gap:40px;">
                <button id="btnAccept" style="width:80px;height:80px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.3);">📞</button>
                <button id="btnReject" style="width:80px;height:80px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.3);">❌</button>
            </div>
            <div style="font-size:0.8rem;color:#888;margin-top:20px;">سيتم إلغاء المكالمة تلقائياً بعد 30 ثانية</div>
        `;
        document.body.appendChild(overlay);
        
        // مؤقت 30 ثانية للإلغاء التلقائي
        const timeout = setTimeout(() => {
            const stillOverlay = document.getElementById('incomingCall');
            if (stillOverlay) {
                stillOverlay.remove();
                console.log('⏰ تم إلغاء المكالمة تلقائياً بعد 30 ثانية');
            }
        }, 30000);
        
        document.getElementById('btnAccept').onclick = () => { 
            clearTimeout(timeout);
            overlay.remove(); 
            this.receiveCall(callerId, callData); 
        };
        document.getElementById('btnReject').onclick = () => { 
            clearTimeout(timeout);
            overlay.remove(); 
            console.log('❌ تم رفض المكالمة');
        };
    },
    
    setupDataChannel(channel) {
        if (!channel) return;
        console.log('📡 إعداد Data Channel');
        
        channel.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'ping') return;
                if (msg.type === 'call_status') {
                    this.handleCallStatus(msg);
                    return;
                }
                if (msg.chunk !== undefined) {
                    this.handleChunkMessage(msg);
                    return;
                }
                const displayMsg = { id: msg.id || Date.now().toString(), type: msg.type, data: msg.data, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
                if (ChatSystem.currentChat) {
                    ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg);
                    ChatSystem.displayMessage(displayMsg);
                }
            } catch (error) {
                console.error('خطأ في معالجة الرسالة:', error);
            }
        };
        
        channel.onopen = () => {
            console.log('✅ Data Channel مفتوح');
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
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
            console.log('❌ Data Channel مغلق');
            this.sendCallStatus('disconnected');
            if (this.keepAliveInterval) {
                clearInterval(this.keepAliveInterval);
                this.keepAliveInterval = null;
            }
        };
        
        channel.onerror = (e) => {
            console.error('❌ خطأ في Data Channel:', e);
        };
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
    
    async handleSignaling(data) {
        try {
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
        } catch (error) {
            console.error('خطأ في إرسال الإشارة:', error);
        }
    },
    
    showCallUI(type) {
        document.body.classList.add('in-call');
        const existingUi = document.getElementById('callUI');
        if (existingUi) existingUi.remove();
        
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const contactAvatar = document.querySelector('#conversationAvatar')?.textContent || '👤';
        
        let uiHTML = '';
        if (type === 'video') {
            uiHTML = `
                <video id="remoteVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;position:fixed;top:0;left:0;z-index:9998;background:#000;"></video>
                <video id="localVideo" autoplay playsinline muted style="width:100px;height:150px;object-fit:cover;position:fixed;bottom:100px;right:20px;z-index:9999;border-radius:12px;border:2px solid white;background:#333;"></video>
                <div style="position:fixed;bottom:40px;left:0;right:0;z-index:9999;display:flex;justify-content:center;gap:30px;">
                    <button id="switchCameraBtn" style="width:55px;height:55px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.3rem;cursor:pointer;">🔄</button>
                    <button id="muteAudioBtn" style="width:55px;height:55px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.3rem;cursor:pointer;">🎤</button>
                    <button id="endCallBtn" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.8rem;cursor:pointer;">📞</button>
                    <button id="muteVideoBtn" style="width:55px;height:55px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.3rem;cursor:pointer;">📹</button>
                </div>`;
        } else {
            uiHTML = `
                <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg, #1a1a2e, #16213e);z-index:9997;"></div>
                <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;text-align:center;">
                    <div style="font-size:5rem;margin-bottom:10px;">${contactAvatar}</div>
                    <div style="font-size:1.5rem;color:white;font-weight:bold;">${contactName}</div>
                    <div style="margin-top:5px;color:#aaa;font-size:0.8rem;" id="callTimer">00:00</div>
                </div>
                <div style="position:fixed;bottom:40px;left:0;right:0;z-index:9999;display:flex;justify-content:center;gap:30px;">
                    <button id="speakerBtn" style="width:55px;height:55px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.3rem;cursor:pointer;">🔊</button>
                    <button id="endCallBtn" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.8rem;cursor:pointer;">📞</button>
                    <button id="muteBtn" style="width:55px;height:55px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.3rem;cursor:pointer;">🎤</button>
                </div>`;
        }
        
        const ui = document.createElement('div');
        ui.id = 'callUI';
        ui.innerHTML = uiHTML;
        document.body.appendChild(ui);
        
        document.getElementById('endCallBtn')?.addEventListener('click', () => this.endCall());
        
        if (type === 'video') {
            const lv = document.getElementById('localVideo');
            if (lv && this.localStream) lv.srcObject = this.localStream;
            document.getElementById('switchCameraBtn')?.addEventListener('click', () => this.switchCamera());
            document.getElementById('muteAudioBtn')?.addEventListener('click', () => this.toggleAudio());
            document.getElementById('muteVideoBtn')?.addEventListener('click', () => this.toggleVideo());
        } else {
            document.getElementById('speakerBtn')?.addEventListener('click', () => this.toggleSpeaker());
            document.getElementById('muteBtn')?.addEventListener('click', () => this.toggleMute());
            this.startCallTimer();
        }
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
    
    toggleMute() {
        this.isAudioMuted = !this.isAudioMuted;
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) audioTrack.enabled = !this.isAudioMuted;
        }
        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) {
            if (this.isAudioMuted) {
                muteBtn.innerHTML = '🔇';
                muteBtn.style.background = '#f44336';
            } else {
                muteBtn.innerHTML = '🎤';
                muteBtn.style.background = 'rgba(0,0,0,0.6)';
            }
        }
    },
    
    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const btn = document.getElementById('muteAudioBtn');
                if (btn) {
                    if (audioTrack.enabled) {
                        btn.innerHTML = '🎤';
                        btn.style.background = 'rgba(0,0,0,0.6)';
                    } else {
                        btn.innerHTML = '🔇';
                        btn.style.background = '#f44336';
                    }
                }
            }
        }
    },
    
    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const btn = document.getElementById('muteVideoBtn');
                if (btn) {
                    if (videoTrack.enabled) {
                        btn.innerHTML = '📹';
                        btn.style.background = 'rgba(0,0,0,0.6)';
                    } else {
                        btn.innerHTML = '🚫📹';
                        btn.style.background = '#f44336';
                    }
                }
            }
        }
    },
    
    toggleSpeaker() {
        this.isSpeakerEnabled = !this.isSpeakerEnabled;
        this.applySpeakerSettings();
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            if (this.isSpeakerEnabled) {
                speakerBtn.innerHTML = '🔊';
                speakerBtn.style.background = '#2196F3';
            } else {
                speakerBtn.innerHTML = '🔈';
                speakerBtn.style.background = 'rgba(0,0,0,0.6)';
            }
        }
    },
    
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
        } catch (e) {
            console.error('❌ فشل تبديل الكاميرا:', e);
        }
    },
    
    async sendFileDirect(file, type) {
        if (!this.dc || this.dc.readyState !== 'open') {
            console.log('❌ Data Channel غير مفتوح');
            return false;
        }
        
        try {
            let blobToSend = file;
            if (type === 'image') {
                blobToSend = await SecureChatSystem.compressImage(file);
            }
            
            const b64 = await SecureChatSystem.fileToBase64(blobToSend);
            const chunkSize = 16000;
            const totalChunks = Math.ceil(b64.length / chunkSize);
            const fileId = Date.now().toString();
            
            for (let i = 0; i < totalChunks; i++) {
                if (this.dc.readyState !== 'open') {
                    ChatSystem.hideProgressBar();
                    return false;
                }
                const chunk = {
                    type: type,
                    data: b64.substring(i * chunkSize, (i + 1) * chunkSize),
                    chunk: i,
                    total: totalChunks,
                    id: fileId,
                    fileName: file.name || 'ملف'
                };
                this.dc.send(JSON.stringify(chunk));
                const progress = ((i + 1) / totalChunks) * 100;
                const typeLabel = type === 'video' ? 'الفيديو' : type === 'image' ? 'الصورة' : 'الملف';
                ChatSystem.updateProgressBar(progress, `جاري إرسال ${typeLabel}...`);
                await new Promise(r => setTimeout(r, 50));
            }
            ChatSystem.hideProgressBar();
            return true;
        } catch (e) {
            ChatSystem.hideProgressBar();
            return false;
        }
    },
    
    handleChunkMessage(msg) {
        if (!this.incomingChunks[msg.id]) {
            this.incomingChunks[msg.id] = [];
            this.incomingFileInfo[msg.id] = {
                type: msg.type,
                fileName: msg.fileName,
                total: msg.total,
                received: 0
            };
            ChatSystem.showProgressBar('جاري استلام الملف...', 0);
        }
        
        this.incomingChunks[msg.id][msg.chunk] = msg.data;
        this.incomingFileInfo[msg.id].received++;
        const progress = (this.incomingFileInfo[msg.id].received / msg.total) * 100;
        const fileType = msg.type === 'video' ? 'الفيديو' : msg.type === 'image' ? 'الصورة' : 'الملف';
        ChatSystem.updateProgressBar(progress, `جاري استلام ${fileType}...`);
        
        if (this.incomingFileInfo[msg.id].received === msg.total) {
            const fullData = this.incomingChunks[msg.id].join('');
            const displayMsg = {
                id: msg.id,
                type: msg.type === 'location' ? 'text' : msg.type,
                data: fullData,
                fileName: msg.fileName,
                sender: 'friend',
                time: new Date().toISOString()
            };
            if (ChatSystem.currentChat) {
                ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg);
                ChatSystem.displayMessage(displayMsg);
            }
            ChatSystem.hideProgressBar();
            delete this.incomingChunks[msg.id];
            delete this.incomingFileInfo[msg.id];
        }
    },
    
    endCall() {
        console.log('📞 إنهاء المكالمة');
        this.isInCall = false;
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
    },
    
    cleanupConnections() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
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

window.startAudioCall = async () => {
    if (!ChatSystem.currentChat) {
        alert('الرجاء اختيار محادثة أولاً');
        return;
    }
    await CallSystem.startAudioCall(ChatSystem.currentChat);
};

window.startVideoCall = async () => {
    if (!ChatSystem.currentChat) {
        alert('الرجاء اختيار محادثة أولاً');
        return;
    }
    await CallSystem.startVideoCall(ChatSystem.currentChat);
};

console.log('✅ WebRTC Call System جاهز');
