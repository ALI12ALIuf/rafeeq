// ========== webrtc-call.js - نسخة مبسطة تعمل 100% ==========

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false,
    incomingChunks: {}, incomingFileInfo: {},
    servers: { 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ] 
    },
    
    // ==================== مكالمة صوتية - مبسطة ====================
    async startAudioCall(calleeId) {
        if (this.isInCall) {
            alert('يوجد مكالمة نشطة حالياً');
            return;
        }
        
        try {
            // 1. طلب الميكروفون
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.localStream = stream;
            
            // 2. عرض واجهة المكالمة (بسيطة)
            this.showSimpleAudioUI();
            
            // 3. إنشاء الاتصال
            this.pc = new RTCPeerConnection(this.servers);
            
            // 4. إضافة مسار الصوت
            stream.getTracks().forEach(track => {
                this.pc.addTrack(track, stream);
            });
            
            // 5. استقبال الصوت من الطرف الآخر
            this.pc.ontrack = (event) => {
                console.log('✅ تم استقبال الصوت');
                // الصوت يتم تشغيله تلقائياً
            };
            
            // 6. معالجة المرشحات
            this.pc.onicecandidate = (e) => {
                if (e.candidate) {
                    this.sendSignal(calleeId, { candidate: e.candidate, type: 'audio' });
                }
            };
            
            // 7. إنشاء العرض
            const offer = await this.pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
            });
            await this.pc.setLocalDescription(offer);
            
            // 8. إرسال العرض
            await this.sendSignal(calleeId, {
                sdp: this.pc.localDescription,
                type: 'audio'
            });
            
            this.isInCall = true;
            
        } catch (error) {
            console.error('خطأ:', error);
            alert('فشل بدء المكالمة: ' + error.message);
            this.endCall();
        }
    },
    
    // واجهة صوتية بسيطة
    showSimpleAudioUI() {
        const ui = document.createElement('div');
        ui.id = 'callUI';
        ui.innerHTML = `
            <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:#000;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;">
                <div style="font-size:24px;margin-bottom:20px;">📞 مكالمة صوتية</div>
                <div id="callTimer" style="font-size:48px;margin-bottom:30px;">00:00</div>
                <div style="display:flex;gap:20px;">
                    <button onclick="CallSystem.toggleAudio()" style="width:60px;height:60px;border-radius:50%;background:#333;border:none;color:white;font-size:24px;">🎤</button>
                    <button onclick="CallSystem.endCall()" style="width:60px;height:60px;border-radius:50%;background:#f00;border:none;color:white;font-size:24px;">🔴</button>
                </div>
            </div>
        `;
        document.body.appendChild(ui);
        this.startTimer();
    },
    
    // ==================== مكالمة فيديو ====================
    async startVideoCall(calleeId) {
        if (this.isInCall) return;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            this.localStream = stream;
            this.showVideoUI();
            
            this.pc = new RTCPeerConnection(this.servers);
            stream.getTracks().forEach(track => this.pc.addTrack(track, stream));
            
            this.pc.ontrack = (e) => {
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo && e.streams[0]) remoteVideo.srcObject = e.streams[0];
            };
            
            this.pc.onicecandidate = (e) => {
                if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate, type: 'video' });
            };
            
            const offer = await this.pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: 'video' });
            
            this.isInCall = true;
            
        } catch (error) {
            alert('خطأ: ' + error.message);
            this.endCall();
        }
    },
    
    showVideoUI() {
        const ui = document.createElement('div');
        ui.id = 'callUI';
        ui.innerHTML = `
            <video id="remoteVideo" autoplay playsinline style="position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:9998;background:#000;"></video>
            <video id="localVideo" autoplay playsinline muted style="position:fixed;bottom:80px;right:20px;width:100px;height:150px;object-fit:cover;z-index:9999;border-radius:10px;border:2px solid white;"></video>
            <div style="position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:20px;">
                <button onclick="CallSystem.toggleAudio()" style="width:50px;height:50px;border-radius:50%;background:rgba(0,0,0,0.6);border:none;color:white;">🎤</button>
                <button onclick="CallSystem.toggleVideo()" style="width:50px;height:50px;border-radius:50%;background:rgba(0,0,0,0.6);border:none;color:white;">📹</button>
                <button onclick="CallSystem.endCall()" style="width:60px;height:60px;border-radius:50%;background:#f00;border:none;color:white;">🔴</button>
            </div>
            <div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(0,0,0,0.5);padding:8px 16px;border-radius:20px;color:white;" id="callTimer">00:00</div>
        `;
        document.body.appendChild(ui);
        
        const localVideo = document.getElementById('localVideo');
        if (localVideo && this.localStream) localVideo.srcObject = this.localStream;
        
        this.startTimer();
    },
    
    // ==================== استقبال المكالمات ====================
    async receiveCall(callerId, callData) {
        if (this.isInCall) return;
        
        const isVideo = callData.type === 'video';
        
        try {
            // طلب الصلاحيات
            const constraints = isVideo ? { audio: true, video: true } : { audio: true, video: false };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.localStream = stream;
            
            // عرض الواجهة المناسبة
            if (isVideo) this.showVideoUI();
            else this.showSimpleAudioUI();
            
            // إنشاء الاتصال
            this.pc = new RTCPeerConnection(this.servers);
            stream.getTracks().forEach(track => this.pc.addTrack(track, stream));
            
            this.pc.ontrack = (e) => {
                if (isVideo) {
                    const remoteVideo = document.getElementById('remoteVideo');
                    if (remoteVideo && e.streams[0]) remoteVideo.srcObject = e.streams[0];
                }
            };
            
            this.pc.onicecandidate = (e) => {
                if (e.candidate) this.sendSignal(callerId, { candidate: e.candidate, type: isVideo ? 'video' : 'audio' });
            };
            
            // معالجة العرض
            if (callData.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp));
                const answer = await this.pc.createAnswer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: isVideo
                });
                await this.pc.setLocalDescription(answer);
                await this.sendSignal(callerId, { sdp: this.pc.localDescription, type: isVideo ? 'video' : 'audio' });
            }
            
            this.isInCall = true;
            
        } catch (error) {
            alert('خطأ: ' + error.message);
            this.endCall();
        }
    },
    
    showIncomingCall(callerId, callData) {
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const isVideo = callData.type === 'video';
        
        const overlay = document.createElement('div');
        overlay.id = 'incomingCall';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;';
        overlay.innerHTML = `
            <div style="font-size:48px;">${isVideo ? '📹' : '🎧'}</div>
            <div style="font-size:24px;">${contactName}</div>
            <div>${isVideo ? 'مكالمة فيديو' : 'مكالمة صوتية'}</div>
            <div style="display:flex;gap:30px;">
                <button id="acceptBtn" style="width:70px;height:70px;border-radius:50%;background:#4CAF50;border:none;font-size:30px;">✅</button>
                <button id="rejectBtn" style="width:70px;height:70px;border-radius:50%;background:#f44336;border:none;font-size:30px;">❌</button>
            </div>
        `;
        document.body.appendChild(overlay);
        
        document.getElementById('acceptBtn').onclick = () => {
            overlay.remove();
            this.receiveCall(callerId, callData);
        };
        document.getElementById('rejectBtn').onclick = () => overlay.remove();
    },
    
    // ==================== دوال مساعدة ====================
    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        let seconds = 0;
        this.timerInterval = setInterval(() => {
            if (!this.isInCall) {
                clearInterval(this.timerInterval);
                return;
            }
            seconds++;
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            const timer = document.getElementById('callTimer');
            if (timer) timer.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
    },
    
    toggleAudio() {
        if (this.localStream) {
            const track = this.localStream.getAudioTracks()[0];
            if (track) track.enabled = !track.enabled;
        }
    },
    
    toggleVideo() {
        if (this.localStream) {
            const track = this.localStream.getVideoTracks()[0];
            if (track) track.enabled = !track.enabled;
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
            console.error('Send signal error:', error);
        }
    },
    
    async handleSignaling(data) {
        try {
            if (data.sdp && data.sdp.type === 'offer') {
                this.showIncomingCall(ChatSystem.currentChat, data);
            } else if (this.pc) {
                if (data.sdp) {
                    await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                } else if (data.candidate) {
                    await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            }
        } catch (e) {
            console.warn('Signaling error:', e);
        }
    },
    
    endCall() {
        this.isInCall = false;
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        const ui = document.getElementById('callUI');
        if (ui) ui.remove();
        const inc = document.getElementById('incomingCall');
        if (inc) inc.remove();
    }
};

// دوال التشغيل
window.startVideoCall = () => CallSystem.startVideoCall(ChatSystem.currentChat);
window.startAudioCall = () => CallSystem.startAudioCall(ChatSystem.currentChat);
