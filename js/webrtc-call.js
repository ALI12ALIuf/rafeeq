// ========== webrtc-call.js ==========
// نظام اتصال WebRTC مباشر + المكالمات + إرسال الملفات (الإصدار النهائي المستقر)

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false,
    incomingChunks: {}, incomingFileInfo: {},
    reconnectTimer: null, maxReconnectAttempts: 3, reconnectAttempts: 0,
    callTimerInterval: null,
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
    
    // ========== بدء المكالمة (إصدار منفصل ومستقر) ==========
    async startCall(calleeId, callType = 'video') {
        if (!window.auth?.currentUser || this.isInCall) return;
        this.isInCall = true;
        
        try {
            // 1. تحديد القيود بناءً على نوع المكالمة
            let constraints = { audio: true };
            if (callType === 'video') {
                constraints.video = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' };
            }
            
            // 2. الحصول على التيار المحلي
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // 3. عرض واجهة المستخدم المناسبة (صوت أو فيديو)
            this.showCallUI(callType);
            
            // 4. إنشاء اتصال PeerConnection جديد
            this.pc = new RTCPeerConnection(this.servers);
            
            // 5. إضافة المسارات (audio فقط للصوت، audio+video للفيديو)
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
            });
            
            // 6. إنشاء قناة البيانات (للملفات والإشارات)
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            
            // 7. معالج المرشحين (ICE candidates)
            this.pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignal(calleeId, { candidate: event.candidate });
                }
            };
            
            // 8. معالج استقبال المسار البعيد (فقط للفيديو)
            this.pc.ontrack = (event) => {
                if (callType === 'video') {
                    const remoteVideo = document.getElementById('remoteVideo');
                    if (remoteVideo && event.streams[0]) {
                        remoteVideo.srcObject = event.streams[0];
                    }
                }
            };
            
            // 9. مراقبة حالة الاتصال
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            // 10. إنشاء العرض (Offer) مع تحديد نوع الوسائط المطلوب استقبالها
            const offerOptions = {
                offerToReceiveAudio: true,
                offerToReceiveVideo: (callType === 'video')
            };
            const offer = await this.pc.createOffer(offerOptions);
            await this.pc.setLocalDescription(offer);
            
            // 11. إرسال الإشارة مع تحديد نوع المكالمة
            await this.sendSignal(calleeId, { 
                sdp: this.pc.localDescription, 
                callType: callType 
            });
            
        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            this.endCall();
            if (error.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الميكروفون والكاميرا');
            } else {
                alert('حدث خطأ أثناء بدء المكالمة');
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
        const overlay = document.createElement('div'); overlay.id = 'incomingCall';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;backdrop-filter:blur(5px);';
        
        const isVideo = callData.callType === 'video';
        const callTypeText = isVideo ? 'مكالمة فيديو' : 'مكالمة صوتية';
        
        overlay.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:3rem;margin-bottom:1rem;">${isVideo ? '📹' : '🎙️'}</div>
                <div style="font-size:1.5rem;margin-bottom:0.5rem;">${this.escapeHtml(contactName)}</div>
                <div style="font-size:1rem;color:#ccc;">${callTypeText}</div>
            </div>
            <div style="display:flex;gap:30px;">
                <button id="btnAccept" style="width:70px;height:70px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;transition:0.2s;">✅</button>
                <button id="btnReject" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;transition:0.2s;">❌</button>
            </div>
        `;
        document.body.appendChild(overlay);
        
        document.getElementById('btnAccept').onclick = () => { 
            overlay.remove(); 
            this.receiveCall(callerId, callData); 
        };
        document.getElementById('btnReject').onclick = () => { 
            overlay.remove(); 
        };
    },
    
    // ========== استقبال المكالمة (إصدار منفصل ومستقر) ==========
    async receiveCall(callerId, callData) {
        if (this.isInCall) return;
        this.isInCall = true;
        
        const isVideoCall = (callData.callType === 'video');
        
        try {
            // 1. تحديد القيود بناءً على نوع المكالمة
            let constraints = { audio: true };
            if (isVideoCall) {
                constraints.video = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' };
            }
            
            // 2. الحصول على التيار المحلي
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // 3. عرض واجهة المستخدم المناسبة
            this.showCallUI(isVideoCall ? 'video' : 'audio');
            
            // 4. إنشاء اتصال PeerConnection جديد
            this.pc = new RTCPeerConnection(this.servers);
            
            // 5. إضافة المسارات المحلية
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
            });
            
            // 6. معالج المرشحين
            this.pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignal(callerId, { candidate: event.candidate });
                }
            };
            
            // 7. معالج استقبال المسار البعيد (فقط للفيديو)
            this.pc.ontrack = (event) => {
                if (isVideoCall) {
                    const remoteVideo = document.getElementById('remoteVideo');
                    if (remoteVideo && event.streams[0]) {
                        remoteVideo.srcObject = event.streams[0];
                    }
                }
            };
            
            // 8. معالج قناة البيانات
            this.pc.ondatachannel = (event) => {
                this.dc = event.channel;
                this.setupDataChannel(this.dc);
            };
            
            // 9. مراقبة حالة الاتصال
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            // 10. تعيين الوصف البعيد وإنشاء الإجابة
            if (callData.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp));
                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                await this.sendSignal(callerId, { sdp: this.pc.localDescription });
            }
            
        } catch (error) {
            console.error('خطأ في استقبال المكالمة:', error);
            this.endCall();
            if (error.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الميكروفون والكاميرا');
            }
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
            }
            else if (data.candidate) {
                await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (e) { console.error('Signaling error:', e); }
    },
    
    async sendSignal(calleeId, data) {
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'webrtc', data: encrypted, timestamp: Date.now() });
        } catch (error) { console.error('Send signal error:', error); }
    },
    
    // ========== تبديل الكاميرا ==========
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
    
    // ========== واجهة المستخدم المتطورة ==========
    showCallUI(callType) { 
        document.body.classList.add('in-call'); 
        
        const existingUI = document.getElementById('callUI');
        if (existingUI) existingUI.remove();

        const ui = document.createElement('div'); 
        ui.id = 'callUI'; 
        
        const contactName = document.getElementById('conversationName')?.textContent || 'رفيق';
        
        if (callType === 'audio') {
            // واجهة المكالمة الصوتية
            ui.innerHTML = `
                <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:sans-serif;">
                    <div style="text-align:center;">
                        <div style="width:120px;height:120px;background:linear-gradient(135deg, #0f3460, #e94560);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;box-shadow:0 10px 25px rgba(0,0,0,0.3);">
                            <span style="font-size:4rem;">🎙️</span>
                        </div>
                        <div class="call-name" style="font-size:1.8rem;font-weight:bold;margin-bottom:0.5rem;">${this.escapeHtml(contactName)}</div>
                        <div class="call-timer" id="callTimer" style="font-size:1.2rem;color:#a0a0c0;margin-bottom:3rem;background:rgba(0,0,0,0.3);padding:4px 12px;border-radius:30px;display:inline-block;">00:00</div>
                    </div>
                    <div style="display:flex;gap:30px;justify-content:center;">
                        <button onclick="CallSystem.toggleAudio()" id="micToggleBtn" style="width:70px;height:70px;border-radius:50%;background:#2c2c3e;color:white;border:none;font-size:1.8rem;cursor:pointer;transition:0.2s;" title="كتم الصوت">🎤</button>
                        <button onclick="CallSystem.endCall()" style="width:80px;height:80px;border-radius:50%;background:#e94560;color:white;border:none;font-size:2rem;cursor:pointer;" title="إنهاء المكالمة">📞</button>
                        <button onclick="CallSystem.toggleSpeaker()" id="speakerToggleBtn" style="width:70px;height:70px;border-radius:50%;background:#2c2c3e;color:white;border:none;font-size:1.8rem;cursor:pointer;" title="مكبر الصوت">🔊</button>
                    </div>
                    <div style="position:absolute;bottom:20px;font-size:0.7rem;color:#666;">مكالمة صوتية مشفرة</div>
                </div>`;
            
            let callDuration = 0;
            if (this.callTimerInterval) clearInterval(this.callTimerInterval);
            this.callTimerInterval = setInterval(() => {
                callDuration++;
                const minutes = Math.floor(callDuration / 60);
                const seconds = callDuration % 60;
                const timerElement = document.getElementById('callTimer');
                if (timerElement) timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }, 1000);
        } 
        else { 
            // واجهة المكالمة المرئية
            ui.innerHTML = `
                <video id="remoteVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;position:fixed;top:0;left:0;z-index:9998;background:#000;"></video>
                <video id="localVideo" autoplay playsinline muted style="width:120px;height:180px;object-fit:cover;position:fixed;bottom:100px;right:20px;z-index:9999;border-radius:20px;border:2px solid rgba(255,255,255,0.5);background:#333;"></video>
                <div style="position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:25px;background:rgba(0,0,0,0.5);padding:12px 20px;border-radius:60px;backdrop-filter:blur(10px);">
                    <button onclick="CallSystem.switchCamera()" style="width:55px;height:55px;border-radius:50%;background:#2c2c3e;color:white;border:none;font-size:1.3rem;cursor:pointer;" title="تبديل الكاميرا">🔄</button>
                    <button onclick="CallSystem.toggleAudio()" id="videoMicToggleBtn" style="width:55px;height:55px;border-radius:50%;background:#2c2c3e;color:white;border:none;font-size:1.3rem;cursor:pointer;" title="كتم الصوت">🎤</button>
                    <button onclick="CallSystem.endCall()" style="width:65px;height:65px;border-radius:50%;background:#e94560;color:white;border:none;font-size:1.5rem;cursor:pointer;" title="إنهاء المكالمة">📞</button>
                    <button onclick="CallSystem.toggleVideo()" id="videoToggleBtn" style="width:55px;height:55px;border-radius:50%;background:#2c2c3e;color:white;border:none;font-size:1.3rem;cursor:pointer;" title="إيقاف/تشغيل الكاميرا">📹</button>
                </div>`;
                
            setTimeout(() => {
                const lv = document.getElementById('localVideo'); 
                if (lv && this.localStream) lv.srcObject = this.localStream; 
            }, 100);
        }
        
        document.body.appendChild(ui); 
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    toggleSpeaker() {
        // محاولة تجريبية لتفعيل مكبر الصوت
        if (this.pc) {
            // ملاحظة: التحكم بمكبر الصوت يعتمد على المتصفح
            // هذه محاولة أولية
            alert('🔊 سيتم إضافة ميزة مكبر الصوت بشكل كامل في التحديث القادم');
        }
    },
    
    toggleAudio() { 
        if (this.localStream) { 
            const audioTrack = this.localStream.getAudioTracks()[0]; 
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const micBtn = document.getElementById('micToggleBtn') || document.getElementById('videoMicToggleBtn');
                if (micBtn) {
                    micBtn.style.background = audioTrack.enabled ? '#2c2c3e' : '#e94560';
                    micBtn.style.opacity = audioTrack.enabled ? '1' : '0.8';
                }
            }
        } 
    },
    
    toggleVideo() { 
        if (this.localStream) { 
            const videoTrack = this.localStream.getVideoTracks()[0]; 
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const videoBtn = document.getElementById('videoToggleBtn');
                if (videoBtn) {
                    videoBtn.style.background = videoTrack.enabled ? '#2c2c3e' : '#e94560';
                }
            }
        } 
    },
    
    endCall() { 
        this.isInCall = false; 
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
        
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
    },
    
    cleanupConnections() { 
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } 
        if (this.dc) { this.dc.close(); this.dc = null; } 
        if (this.pc) { this.pc.close(); this.pc = null; } 
        this.incomingChunks = {}; 
        this.incomingFileInfo = {}; 
    }
};

window.startVideoCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat, 'video'); };
window.startAudioCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat, 'audio'); };
