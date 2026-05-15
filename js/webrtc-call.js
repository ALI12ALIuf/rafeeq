// ========== webrtc-call.js ==========
// نظام اتصال WebRTC مباشر + المكالمات + إرسال الملفات

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false,
    incomingChunks: {}, incomingFileInfo: {},
    reconnectTimer: null, maxReconnectAttempts: 3, reconnectAttempts: 0,
    callTimerInterval: null,
    servers: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' },{ urls: 'stun:stun1.l.google.com:19302' },{ urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },{ urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }] },
    
    async ensureDataChannel(calleeId) { /* ... (نفس الكود الأصلي، لم يتغير) ... */ 
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
    async createNewDataChannel(calleeId) { /* ... (نفس الكود الأصلي، لم يتغير) ... */ 
        this.reconnectAttempts = 0; this.cleanupConnections();
        try {
            this.pc = new RTCPeerConnection(this.servers);
            this.dc = this.pc.createDataChannel('chat', { ordered: true, maxRetransmits: 3 });
            this.setupDataChannel(this.dc);
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }).catch(() => {}); };
            this.pc.oniceconnectionstatechange = () => { if (this.pc?.iceConnectionState === 'failed') this.pc.restartIce(); };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            this.pc.onconnectionstatechange = () => { switch(this.pc?.connectionState) { case 'connected': this.reconnectAttempts = 0; break; case 'failed': case 'disconnected': this.scheduleReconnect(); break; } };
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription });
        } catch (error) { throw error; }
    },
    setupDataChannel(channel) { /* ... (نفس الكود الأصلي، لم يتغير) ... */ 
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
    handleChunkMessage(msg) { /* ... (نفس الكود الأصلي، لم يتغير) ... */ 
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
    scheduleReconnect() { /* ... (نفس الكود الأصلي، لم يتغير) ... */ 
        if (!ChatSystem.currentChat || !ChatSystem.friendOnline) return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
        this.reconnectTimer = setTimeout(async () => { try { if (ChatSystem.currentChat && ChatSystem.friendOnline) await this.ensureDataChannel(ChatSystem.currentChat); } catch (error) {} this.reconnectTimer = null; }, delay);
    },
    
    // ========== بدء المكالمة (تم إصلاح الخلل) ==========
    async startCall(calleeId, callType = 'video') {
        if (!window.auth?.currentUser || this.isInCall) return;
        this.isInCall = true;
        try {
            // تحديد المسموح به بناءً على نوع المكالمة
            const constraints = { 
                audio: true, 
                video: callType === 'video' ? { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 },
                    facingMode: 'user'
                } : false 
            };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // إظهار الواجهة الصحيحة فورًا
            this.showCallUI(callType);
            
            this.pc = new RTCPeerConnection(this.servers);
            // إضافة المسارات إلى جلسة الـ PeerConnection
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            this.dc = this.pc.createDataChannel('chat'); 
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }); };
            this.pc.ontrack = e => { 
                // للمكالمات الصوتية، لا يوجد فيديو بعيد
                if (callType === 'video') {
                    const rv = document.getElementById('remoteVideo'); 
                    if (rv && e.streams[0]) rv.srcObject = e.streams[0];
                }
            };
            this.pc.onconnectionstatechange = () => { if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) this.endCall(); };
            
            // إنشاء العرض (Offer) مع تحديد نوع الوسائط
            const offer = await this.pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: callType === 'video'
            });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: callType });
        } catch (e) { 
            this.endCall(); 
            if (e.name === 'NotAllowedError') alert('يرجى السماح بالوصول إلى الكاميرا والميكروفون');
            else console.error(e);
        }
    },
    
    async sendFileDirect(file, type) { /* ... (نفس الكود الأصلي، لم يتغير) ... */ 
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
    
    showIncomingCall(callerId, callData) { /* ... (نفس الكود الأصلي، تم تحديث اسم المتصل بشكل آمن) ... */ 
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const overlay = document.createElement('div'); overlay.id = 'incomingCall';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;';
        overlay.innerHTML = `<div style="font-size:1.5rem;">📞 ${this.escapeHtml(contactName)} يتصل بك...</div><div style="display:flex;gap:30px;"><button id="btnAccept" style="width:70px;height:70px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;">✅</button><button id="btnReject" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;">❌</button></div>`;
        document.body.appendChild(overlay);
        document.getElementById('btnAccept').onclick = () => { overlay.remove(); this.receiveCall(callerId, callData); };
        document.getElementById('btnReject').onclick = () => { overlay.remove(); };
    },
    
    // ========== استقبال المكالمة (تم إصلاح الخلل) ==========
    async receiveCall(callerId, callData) {
        if (this.isInCall) return;
        this.isInCall = true;
        // تحديد نوع المكالمة من البيانات المرسلة
        const isVideoCall = callData.type === 'video';
        
        try {
            const constraints = { 
                audio: true, 
                video: isVideoCall ? { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 },
                    facingMode: 'user'
                } : false 
            };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.showCallUI(isVideoCall ? 'video' : 'audio');
            
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(callerId, { candidate: e.candidate }); };
            this.pc.ontrack = e => { 
                if (isVideoCall) {
                    const rv = document.getElementById('remoteVideo'); 
                    if (rv && e.streams[0]) rv.srcObject = e.streams[0];
                }
            };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            this.pc.onconnectionstatechange = () => { if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) this.endCall(); };
            
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
    
    async handleSignaling(data) { /* ... (نفس الكود الأصلي، لم يتغير) ... */ 
        try {
            if (!this.pc) { this.pc = new RTCPeerConnection(this.servers); this.pc.ondatachannel = e => { this.dc = e.channel; this.setupDataChannel(this.dc); }; this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(ChatSystem.currentChat, { candidate: e.candidate }).catch(() => {}); }; }
            if (data.sdp) { await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); if (data.sdp.type === 'offer') { const answer = await this.pc.createAnswer(); await this.pc.setLocalDescription(answer); await this.sendSignal(ChatSystem.currentChat, { sdp: this.pc.localDescription }); } }
            else if (data.candidate) await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {}
    },
    
    async sendSignal(calleeId, data) { /* ... (نفس الكود الأصلي، لم يتغير) ... */ 
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'webrtc', data: encrypted, timestamp: Date.now() });
        } catch (error) {}
    },
    
    // ========== تبديل الكاميرا ==========
    async switchCamera() { /* ... (نفس الكود الأصلي، لم يتغير) ... */ 
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
            
            // استبدال المسار في PeerConnection
            if (this.pc) {
                const sender = this.pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) await sender.replaceTrack(newVideoTrack);
            }
            
            // تحديث localStream
            const audioTrack = this.localStream.getAudioTracks()[0];
            this.localStream = new MediaStream([newVideoTrack, audioTrack].filter(Boolean));
            
            // تحديث الفيديو المحلي
            const lv = document.getElementById('localVideo');
            if (lv) lv.srcObject = this.localStream;
            
        } catch (e) {
            console.error('❌ فشل تبديل الكاميرا:', e);
        }
    },
    
    // ========== واجهة المستخدم المتطورة للمكالمات ==========
    showCallUI(callType) { 
        document.body.classList.add('in-call'); 
        
        // إزالة أي واجهة مكالمة قديمة لتجنب التكرار
        const existingUI = document.getElementById('callUI');
        if (existingUI) existingUI.remove();

        const ui = document.createElement('div'); 
        ui.id = 'callUI'; 
        
        // الحصول على اسم جهة الاتصال
        const contactName = document.getElementById('conversationName')?.textContent || 'رفيق';
        
        if (callType === 'audio') {
            // --- واجهة المكالمة الصوتية المتطورة ---
            ui.innerHTML = `
                <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:sans-serif;">
                    <div style="text-align:center;">
                        <div style="width:120px;height:120px;background:linear-gradient(135deg, #0f3460, #e94560);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;box-shadow:0 10px 25px rgba(0,0,0,0.3);">
                            <span style="font-size:4rem;">🎙️</span>
                        </div>
                        <div class="call-name" style="font-size:1.8rem;font-weight:bold;margin-bottom:0.5rem;text-shadow:0 2px 5px rgba(0,0,0,0.3);">${this.escapeHtml(contactName)}</div>
                        <div class="call-timer" id="callTimer" style="font-size:1.2rem;color:#a0a0c0;margin-bottom:3rem;background:rgba(0,0,0,0.3);padding:4px 12px;border-radius:30px;display:inline-block;">00:00</div>
                    </div>
                    <div style="display:flex;gap:30px;justify-content:center;">
                        <button onclick="CallSystem.toggleAudio()" style="width:70px;height:70px;border-radius:50%;background:#2c2c3e;color:white;border:none;font-size:1.8rem;cursor:pointer;transition:0.2s;box-shadow:0 5px 15px rgba(0,0,0,0.2);" title="كتم الصوت" id="micToggleBtn">🎤</button>
                        <button onclick="CallSystem.endCall()" style="width:80px;height:80px;border-radius:50%;background:#e94560;color:white;border:none;font-size:2rem;cursor:pointer;transition:0.2s;box-shadow:0 5px 15px rgba(233,69,96,0.4);" title="إنهاء المكالمة">📞</button>
                        <button onclick="CallSystem.toggleSpeaker()" style="width:70px;height:70px;border-radius:50%;background:#2c2c3e;color:white;border:none;font-size:1.8rem;cursor:pointer;transition:0.2s;box-shadow:0 5px 15px rgba(0,0,0,0.2);" title="مكبر الصوت" id="speakerToggleBtn">🔊</button>
                    </div>
                    <div style="position:absolute;bottom:20px;font-size:0.8rem;color:#666;">مكالمة صوتية مشفرة</div>
                </div>`;
            
            // بدء العداد من 0
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
            // --- واجهة المكالمة المرئية المتطورة ---
            ui.innerHTML = `
                <video id="remoteVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;position:fixed;top:0;left:0;z-index:9998;background:#000;"></video>
                <video id="localVideo" autoplay playsinline muted style="width:120px;height:180px;object-fit:cover;position:fixed;bottom:100px;right:20px;z-index:9999;border-radius:20px;border:2px solid rgba(255,255,255,0.5);background:#333;box-shadow:0 5px 20px rgba(0,0,0,0.3);"></video>
                <div style="position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:25px;background:rgba(0,0,0,0.5);padding:12px 20px;border-radius:60px;backdrop-filter:blur(10px);">
                    <button onclick="CallSystem.switchCamera()" style="width:55px;height:55px;border-radius:50%;background:#2c2c3e;color:white;border:none;font-size:1.3rem;cursor:pointer;transition:0.2s;" title="تبديل الكاميرا">🔄</button>
                    <button onclick="CallSystem.toggleAudio()" style="width:55px;height:55px;border-radius:50%;background:#2c2c3e;color:white;border:none;font-size:1.3rem;cursor:pointer;transition:0.2s;" title="كتم الصوت" id="videoMicToggleBtn">🎤</button>
                    <button onclick="CallSystem.endCall()" style="width:65px;height:65px;border-radius:50%;background:#e94560;color:white;border:none;font-size:1.5rem;cursor:pointer;transition:0.2s;box-shadow:0 0 15px rgba(233,69,96,0.5);" title="إنهاء المكالمة">📞</button>
                    <button onclick="CallSystem.toggleVideo()" style="width:55px;height:55px;border-radius:50%;background:#2c2c3e;color:white;border:none;font-size:1.3rem;cursor:pointer;transition:0.2s;" title="إيقاف/تشغيل الكاميرا" id="videoToggleBtn">📹</button>
                </div>`;
                
            // ربط عناصر الفيديو بعد إضافتها للصفحة
            setTimeout(() => {
                const lv = document.getElementById('localVideo'); 
                if (lv && this.localStream) lv.srcObject = this.localStream; 
            }, 100);
        }
        
        document.body.appendChild(ui); 
    },
    
    // إضافة دالة مساعدة لتنظيف النص
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // دالة مكبر الصوت (تطوير مستقبلي)
    toggleSpeaker() {
        alert('🔊 ميزة مكبر الصوت ستتوفر في التحديث القادم!');
    },
    
    toggleAudio() { 
        if (this.localStream) { 
            const audioTrack = this.localStream.getAudioTracks()[0]; 
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                // تحديث شكل الزر لإظهار حالة الكتم (تحسين بسيط)
                const micBtn = document.getElementById('micToggleBtn') || document.getElementById('videoMicToggleBtn');
                if (micBtn) {
                    micBtn.style.background = audioTrack.enabled ? '#2c2c3e' : '#e94560';
                    micBtn.style.opacity = audioTrack.enabled ? '1' : '0.8';
                    micBtn.title = audioTrack.enabled ? 'كتم الصوت' : 'إلغاء الكتم';
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
                    videoBtn.title = videoTrack.enabled ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا';
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
        
        // تنظيف المؤقت
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
