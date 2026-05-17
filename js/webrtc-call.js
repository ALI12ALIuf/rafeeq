// ========== webrtc-call.js ==========
// نظام اتصال WebRTC - مكالمات صوتية فقط (مثل واتساب)

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false,
    incomingChunks: {}, incomingFileInfo: {},
    reconnectTimer: null, maxReconnectAttempts: 3, reconnectAttempts: 0,
    callTimerInterval: null, keepAliveInterval: null,
    isMuted: false, isSpeakerEnabled: false,
    remoteAudioElement: null,
    pendingCall: null, // تخزين بيانات المكالمة الواردة
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
                    case 'connected': this.reconnectAttempts = 0; break; 
                    case 'failed': case 'disconnected': this.scheduleReconnect(); break; 
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
    
    // ========== بدء مكالمة (المتصل) ==========
    async startCall(calleeId) {
        console.log('📞 بدء مكالمة إلى', calleeId);
        
        if (!window.auth?.currentUser) {
            alert('يجب تسجيل الدخول أولاً');
            return;
        }
        if (this.isInCall) {
            alert('هناك مكالمة قيد التشغيل');
            return;
        }
        
        // إرسال إشارة طلب مكالمة إلى الطرف الآخر
        await this.sendCallRequest(calleeId);
        
        // بدء المكالمة من جانب المتصل
        await this.initiateCall(calleeId);
    },
    
    // إرسال طلب مكالمة إلى الطرف الآخر
    async sendCallRequest(calleeId) {
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ type: 'call_request', from: window.auth.currentUser.uid }), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { 
                id: Date.now().toString(), 
                type: 'call_request', 
                data: encrypted, 
                timestamp: Date.now() 
            });
            console.log('📤 تم إرسال طلب مكالمة إلى', calleeId);
        } catch (error) {
            console.error('فشل إرسال طلب المكالمة:', error);
        }
    },
    
    // بدء المكالمة فعلياً
    async initiateCall(calleeId) {
        this.isInCall = true;
        
        try {
            const silentAudio = new Audio();
            silentAudio.volume = 0;
            silentAudio.play().catch(() => {});
            
            const constraints = { audio: true, video: false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            const audioTracks = this.localStream.getAudioTracks();
            
            if (audioTracks.length === 0) {
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
            });
            this.dc = this.pc.createDataChannel('chat'); 
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }); };
            
            this.pc.ontrack = e => {
                if (e.track.kind === 'audio') {
                    e.track.enabled = true;
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) 
                    this.endCall();
            };
            
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false }); 
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription });
            
        } catch (e) { 
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
        this.remoteAudioElement.play().catch(e => console.log('تشغيل الصوت فشل:', e));
    },
    
    applySpeakerSettings() {
        if (!this.remoteAudioElement) return;
        if (this.remoteAudioElement.setSinkId) {
            const sinkId = this.isSpeakerEnabled ? 'speaker' : 'default';
            this.remoteAudioElement.setSinkId(sinkId).catch(e => console.log('فشل تغيير مخرج الصوت:', e));
        }
    },
    
    // ========== استقبال مكالمة (المستقبل) ==========
    async handleIncomingCall(callerId) {
        console.log('📞 مكالمة واردة من', callerId);
        
        if (this.isInCall) {
            // رد تلقائي إذا كان في مكالمة
            await this.sendCallResponse(callerId, false, 'busy');
            return;
        }
        
        // عرض شاشة قبول/رفض
        this.pendingCall = callerId;
        this.showIncomingCallUI(callerId);
    },
    
    showIncomingCallUI(callerId) {
        // جلب اسم المستخدم
        window.db.collection('users').doc(callerId).get().then(doc => {
            const contactName = doc.exists ? doc.data().name || 'مستخدم' : 'مستخدم';
            const contactAvatar = doc.exists ? window.getEmojiForUser(doc.data()) : '👤';
            
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
                </div>
            `;
            document.body.appendChild(overlay);
            
            document.getElementById('btnAccept').onclick = () => {
                overlay.remove();
                this.acceptCall(callerId);
            };
            document.getElementById('btnReject').onclick = () => {
                overlay.remove();
                this.rejectCall(callerId);
            };
        }).catch(() => {
            // إذا فشل جلب البيانات، عرض شاشة مبسطة
            const overlay = document.createElement('div'); overlay.id = 'incomingCall';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;';
            overlay.innerHTML = `
                <div style="text-align:center;">
                    <div style="font-size:5rem;margin-bottom:10px;">👤</div>
                    <div style="font-size:1.8rem;font-weight:bold;">مستخدم</div>
                    <div style="font-size:1rem;margin-top:8px;color:#ccc;">يتصل بك...</div>
                </div>
                <div style="display:flex;gap:40px;">
                    <button id="btnAccept" style="width:80px;height:80px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;">✅</button>
                    <button id="btnReject" style="width:80px;height:80px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;">❌</button>
                </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('btnAccept').onclick = () => { overlay.remove(); this.acceptCall(callerId); };
            document.getElementById('btnReject').onclick = () => { overlay.remove(); this.rejectCall(callerId); };
        });
    },
    
    async acceptCall(callerId) {
        console.log('✅ قبول المكالمة من', callerId);
        this.isInCall = true;
        this.pendingCall = null;
        
        // إرسال رد بالقبول
        await this.sendCallResponse(callerId, true);
        
        // بدء استقبال المكالمة
        await this.receiveCall(callerId);
    },
    
    async rejectCall(callerId) {
        console.log('❌ رفض المكالمة من', callerId);
        this.pendingCall = null;
        await this.sendCallResponse(callerId, false, 'rejected');
    },
    
    async sendCallResponse(calleeId, accepted, reason = '') {
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ 
                type: 'call_response', 
                accepted: accepted,
                reason: reason,
                from: window.auth.currentUser.uid 
            }), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { 
                id: Date.now().toString(), 
                type: 'call_response', 
                data: encrypted, 
                timestamp: Date.now() 
            });
        } catch (error) {
            console.error('فشل إرسال رد المكالمة:', error);
        }
    },
    
    // معالجة رد المكالمة من المستقبل
    async handleCallResponse(from, accepted) {
        if (accepted) {
            console.log('✅ الطرف الآخر قبل المكالمة');
            // المكالمة بدأت بالفعل من جانب المتصل
        } else {
            console.log('❌ الطرف الآخر رفض المكالمة');
            alert('الطرف الآخر رفض المكالمة');
            this.endCall();
        }
    },
    
    async receiveCall(callerId) {
        console.log('📞 بدء استقبال مكالمة من', callerId);
        
        try {
            const silentAudio = new Audio();
            silentAudio.volume = 0;
            silentAudio.play().catch(() => {});
            
            const constraints = { audio: true, video: false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            const audioTracks = this.localStream.getAudioTracks();
            
            if (audioTracks.length === 0) {
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
                if (e.track.kind === 'audio') {
                    e.track.enabled = true;
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) 
                    this.endCall();
            };
            
            // انتظار عرض (offer) من المتصل
            // هذا سيتم عبر handleSignaling
            
        } catch (e) { 
            this.endCall(); 
            if (e.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الميكروفون');
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
    
    async handleSignaling(data) {
        console.log('📡 signaling received:', data);
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
                console.log('📝 SDP received, type:', data.sdp.type);
                await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); 
                if (data.sdp.type === 'offer') { 
                    const answer = await this.pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: false }); 
                    await this.pc.setLocalDescription(answer); 
                    await this.sendSignal(ChatSystem.currentChat, { sdp: this.pc.localDescription }); 
                } 
            }
            else if (data.candidate) {
                console.log('🧊 ICE candidate received');
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
        this.isInCall = false; 
        this.pendingCall = null;
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
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } 
        if (this.keepAliveInterval) { clearInterval(this.keepAliveInterval); this.keepAliveInterval = null; }
        if (this.dc) { this.dc.close(); this.dc = null; } 
        if (this.pc) { this.pc.close(); this.pc = null; } 
        this.incomingChunks = {}; 
        this.incomingFileInfo = {}; 
    }
};

// ========== تحديث secure-chat.js ==========
// أضف هذه الأسطر في دالة processReceivedMessage في secure-chat.js

// في secure-chat.js داخل processReceivedMessage:
if (msg.package.type === 'call_request') {
    const decrypted = await this.decryptData(msg.package.data, sharedKey);
    const data = JSON.parse(decrypted);
    if (data.type === 'call_request') {
        CallSystem.handleIncomingCall(data.from);
    }
} else if (msg.package.type === 'call_response') {
    const decrypted = await this.decryptData(msg.package.data, sharedKey);
    const data = JSON.parse(decrypted);
    if (data.type === 'call_response') {
        CallSystem.handleCallResponse(data.from, data.accepted);
    }
}

window.startAudioCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat); };
