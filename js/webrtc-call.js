// ========== webrtc-call.js ==========
// نظام اتصال WebRTC - مكالمات صوتية فقط

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false, isCalling: false,
    incomingChunks: {}, incomingFileInfo: {},
    reconnectTimer: null, maxReconnectAttempts: 3, reconnectAttempts: 0,
    callTimerInterval: null, keepAliveInterval: null, ringtoneInterval: null,
    isMuted: false, isSpeakerEnabled: false,
    remoteAudioElement: null, pendingCallData: null,
    currentCallSessionId: null,  // ✅ معرف جلسة المكالمة الحالية
    
    servers: { 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ] 
    },
    
    // ✅ إنشاء معرف جلسة فريد
    generateSessionId() {
        return Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
    },
    
    // ✅ عرض شاشة المكالمة الواردة
    showIncomingCall(callerId, callData, sessionId) {
        console.log('📞 عرض شاشة المكالمة الواردة من:', callerId, 'الجلسة:', sessionId);
        
        if (this.isInCall || this.isCalling) {
            console.log('❌ مكالمة نشطة، رفض');
            this.sendReject(callerId, sessionId);
            return;
        }
        
        if (ChatSystem.currentChat !== callerId) {
            console.log('❌ المكالمة من محادثة مختلفة، تجاهل');
            this.sendReject(callerId, sessionId);
            return;
        }
        
        this.pendingCallData = { callerId, callData, sessionId };
        
        let contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        let contactAvatar = document.querySelector('#conversationAvatar')?.textContent || '👤';
        
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
                <button id="btnAccept" style="width:80px;height:80px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;"><i class="fas fa-phone"></i></button>
                <button id="btnReject" style="width:80px;height:80px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;"><i class="fas fa-phone-slash"></i></button>
            </div>
        `;
        document.body.appendChild(overlay);
        
        this.playRingTone();
        
        document.getElementById('btnAccept').onclick = async () => {
            this.stopRingTone();
            overlay.remove();
            if (this.pendingCallData) {
                await this.receiveCall(
                    this.pendingCallData.callerId, 
                    this.pendingCallData.callData,
                    this.pendingCallData.sessionId
                );
                this.pendingCallData = null;
            }
        };
        
        document.getElementById('btnReject').onclick = async () => {
            this.stopRingTone();
            overlay.remove();
            if (this.pendingCallData) {
                await this.sendReject(this.pendingCallData.callerId, this.pendingCallData.sessionId);
                this.pendingCallData = null;
            }
        };
    },
    
    playRingTone() {
        try {
            if (this.ringtoneInterval) clearInterval(this.ringtoneInterval);
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.ringtoneInterval = setInterval(() => {
                if (!document.getElementById('incomingCall')) {
                    this.stopRingTone();
                    return;
                }
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                oscillator.frequency.value = 440;
                gainNode.gain.value = 0.3;
                oscillator.start();
                setTimeout(() => oscillator.stop(), 500);
            }, 2000);
            if (audioContext.state === 'suspended') audioContext.resume();
        } catch(e) {}
    },
    
    stopRingTone() {
        if (this.ringtoneInterval) {
            clearInterval(this.ringtoneInterval);
            this.ringtoneInterval = null;
        }
    },
    
    async sendReject(calleeId, sessionId) {
        console.log('📞 إرسال رفض إلى:', calleeId);
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ type: 'call_reject', sessionId: sessionId }), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'webrtc_reject', data: encrypted, timestamp: Date.now() });
        } catch (error) {}
    },
    
    async handleReject(sessionId) {
        console.log('📞 تم رفض المكالمة, الجلسة:', sessionId);
        // ✅ فقط إذا كانت الجلسة تطابق الجلسة الحالية
        if (sessionId && this.currentCallSessionId && sessionId !== this.currentCallSessionId) {
            console.log('❌ تجاهل رفض لجلسة مختلفة');
            return;
        }
        if (!this.isCalling) return;
        this.isCalling = false;
        this.currentCallSessionId = null;
        if (this.isInCall) {
            this.endCall();
        } else {
            alert('❌ الطرف الآخر رفض المكالمة');
            this.cleanupConnections();
            document.getElementById('callUI')?.remove();
        }
    },
    
    async startCall(calleeId) {
        console.log('📞 بدء مكالمة إلى:', calleeId);
        
        if (!window.auth?.currentUser) return;
        if (this.isInCall || this.isCalling) {
            alert('يوجد مكالمة نشطة');
            return;
        }
        
        // ✅ إنشاء معرف جلسة جديد
        this.currentCallSessionId = this.generateSessionId();
        this.isCalling = true;
        
        try {
            const constraints = { audio: true, video: false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (this.localStream.getAudioTracks().length === 0) throw new Error('لا يوجد ميكروفون');
            
            this.pc = new RTCPeerConnection({ iceServers: this.servers.iceServers, iceTransportPolicy: 'all' });
            
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }); };
            this.pc.ontrack = e => { if (e.track.kind === 'audio') this.setupRemoteAudio(e.streams[0]); };
            this.pc.onconnectionstatechange = () => {
                if (this.pc?.connectionState === 'failed' || this.pc?.connectionState === 'disconnected') this.endCall();
            };
            
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { 
                sdp: this.pc.localDescription, 
                sessionId: this.currentCallSessionId 
            });
            
            this.showCallUI();
            this.isInCall = true;
            
        } catch (e) {
            console.error(e);
            this.isCalling = false;
            this.currentCallSessionId = null;
            this.endCall();
            alert(e.name === 'NotAllowedError' ? 'السماح بالميكروفون مطلوب' : 'فشل بدء المكالمة');
        }
    },
    
    async receiveCall(callerId, callData, sessionId) {
        console.log('📞 قبول مكالمة من:', callerId, 'الجلسة:', sessionId);
        
        if (this.isInCall || this.isCalling) {
            await this.sendReject(callerId, sessionId);
            return;
        }
        
        // ✅ حفظ معرف الجلسة
        this.currentCallSessionId = sessionId;
        this.isInCall = true;
        
        try {
            const constraints = { audio: true, video: false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (this.localStream.getAudioTracks().length === 0) throw new Error('لا يوجد ميكروفون');
            
            this.pc = new RTCPeerConnection({ iceServers: this.servers.iceServers, iceTransportPolicy: 'all' });
            
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            this.pc.ontrack = e => { if (e.track.kind === 'audio') this.setupRemoteAudio(e.streams[0]); };
            this.pc.ondatachannel = e => { this.dc = e.channel; this.setupDataChannel(this.dc); };
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(callerId, { candidate: e.candidate }); };
            this.pc.onconnectionstatechange = () => {
                if (this.pc?.connectionState === 'failed' || this.pc?.connectionState === 'disconnected') this.endCall();
            };
            
            if (callData.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp));
                const answer = await this.pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
                await this.pc.setLocalDescription(answer);
                await this.sendSignal(callerId, { sdp: this.pc.localDescription });
            }
            
            this.showCallUI();
            
        } catch (e) {
            console.error(e);
            this.endCall();
            alert(e.name === 'NotAllowedError' ? 'السماح بالميكروفون مطلوب' : 'فشل قبول المكالمة');
        }
    },
    
    // ✅ القلب المعدل - يمنع أي إشارة قديمة أو غير مرغوب فيها
    async handleSignaling(data, fromUserId) {
        console.log('📞 إشارة من:', fromUserId, 'بيانات:', Object.keys(data));
        
        // ✅ الشرط الأهم: تجاهل أي إشارة إذا لم تكن المحادثة الحالية هي نفس المرسل
        if (ChatSystem.currentChat !== fromUserId) {
            console.log('❌ تجاهل تام: المرسل ليس المحادثة الحالية');
            return;
        }
        
        // ✅ تجاهل الإشارات التي لا تحتوي على sessionId (قديمة)
        if (!data.sessionId && data.sdp && data.sdp.type === 'offer') {
            console.log('❌ تجاهل عرض مكالمة بدون sessionId (قديم)');
            return;
        }
        
        // ✅ معالجة عرض مكالمة جديد مع sessionId صالح
        if (data.sdp && data.sdp.type === 'offer' && data.sessionId && !this.isInCall && !this.isCalling) {
            console.log('📞 عرض مكالمة جديد صالح، الجلسة:', data.sessionId);
            this.showIncomingCall(fromUserId, data, data.sessionId);
            return;
        }
        
        // ✅ رفض عرض جديد إذا كنا في مكالمة
        if (data.sdp && data.sdp.type === 'offer' && (this.isInCall || this.isCalling)) {
            console.log('❌ رفض عرض جديد - مكالمة نشطة');
            if (data.sessionId) this.sendReject(fromUserId, data.sessionId);
            return;
        }
        
        // ✅ تجاهل أي إشارة أخرى إذا لم تكن هناك مكالمة نشطة
        if (!this.isInCall && !this.isCalling) {
            console.log('❌ تجاهل: لا توجد مكالمة نشطة');
            return;
        }
        
        // ✅ معالجة الإشارات للمكالمة النشطة فقط
        try {
            if (!this.pc) {
                this.pc = new RTCPeerConnection({ iceServers: this.servers.iceServers, iceTransportPolicy: 'all' });
                this.pc.ondatachannel = e => { this.dc = e.channel; this.setupDataChannel(this.dc); };
                this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(fromUserId, { candidate: e.candidate }); };
                this.pc.ontrack = e => { if (e.track.kind === 'audio') this.setupRemoteAudio(e.streams[0]); };
            }
            
            if (data.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                if (data.sdp.type === 'offer') {
                    const answer = await this.pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
                    await this.pc.setLocalDescription(answer);
                    await this.sendSignal(fromUserId, { sdp: this.pc.localDescription });
                }
            } else if (data.candidate && this.pc) {
                await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (e) { console.warn('Signaling error:', e); }
    },
    
    setupDataChannel(channel) {
        if (!channel) return;
        channel.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'ping') return;
                if (msg.type === 'call_status') return this.handleCallStatus(msg);
                if (msg.chunk !== undefined) return this.handleChunkMessage(msg);
                
                const displayMsg = { id: msg.id || Date.now().toString(), type: msg.type, data: msg.data, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
                if (ChatSystem.currentChat) {
                    ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg);
                    ChatSystem.displayMessage(displayMsg);
                }
            } catch(error) {}
        };
        channel.onopen = () => {
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectAttempts = 0;
            this.sendCallStatus('connected');
            if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = setInterval(() => {
                if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            }, 2000);
        };
        channel.onclose = () => {
            this.sendCallStatus('disconnected');
            if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
            this.scheduleReconnect();
        };
        channel.onerror = () => this.scheduleReconnect();
    },
    
    handleCallStatus(msg) {
        if (msg.status === 'disconnected' && this.isInCall) {
            alert('الطرف الآخر أنهى المكالمة');
            this.endCall();
        }
    },
    
    sendCallStatus(status) {
        if (this.dc?.readyState === 'open') {
            this.dc.send(JSON.stringify({ type: 'call_status', status: status, timestamp: Date.now() }));
        }
    },
    
    handleChunkMessage(msg) {
        if (!this.incomingChunks[msg.id]) {
            this.incomingChunks[msg.id] = [];
            this.incomingFileInfo[msg.id] = { type: msg.type, fileName: msg.fileName, total: msg.total, received: 0 };
            ChatSystem.showProgressBar('جاري الاستلام...', 0);
        }
        
        this.incomingChunks[msg.id][msg.chunk] = msg.data;
        this.incomingFileInfo[msg.id].received++;
        
        const progress = (this.incomingFileInfo[msg.id].received / msg.total) * 100;
        ChatSystem.updateProgressBar(progress, `جاري استلام ${msg.type === 'video' ? 'فيديو' : msg.type === 'image' ? 'صورة' : 'ملف'}...`);
        
        if (this.incomingFileInfo[msg.id].received === msg.total) {
            const fullData = this.incomingChunks[msg.id].join('');
            const displayMsg = { id: msg.id, type: msg.type === 'location' ? 'text' : msg.type, data: fullData, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
            if (ChatSystem.currentChat) {
                ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg);
                ChatSystem.displayMessage(displayMsg);
            }
            ChatSystem.hideProgressBar();
            delete this.incomingChunks[msg.id];
            delete this.incomingFileInfo[msg.id];
        }
    },
    
    scheduleReconnect() {
        if (!ChatSystem.currentChat || this.reconnectAttempts >= this.maxReconnectAttempts) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
        this.reconnectTimer = setTimeout(async () => {
            try { if (ChatSystem.currentChat) await this.ensureDataChannel(ChatSystem.currentChat); }
            catch(e) {}
            this.reconnectTimer = null;
        }, delay);
    },
    
    async ensureDataChannel(calleeId) {
        if (!calleeId) return;
        if (this.dc?.readyState === 'open') return;
        if (this.dc?.readyState === 'connecting') {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => { clearInterval(checkInterval); reject(new Error('انتهت المهلة')); }, 10000);
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
        this.reconnectAttempts = 0;
        this.cleanupConnections();
        try {
            this.pc = new RTCPeerConnection({ iceServers: this.servers.iceServers, iceTransportPolicy: 'all' });
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
    
    setupRemoteAudio(stream) {
        if (this.remoteAudioElement) {
            this.remoteAudioElement.pause();
            this.remoteAudioElement.srcObject = null;
        }
        this.remoteAudioElement = new Audio();
        this.remoteAudioElement.srcObject = stream;
        this.remoteAudioElement.autoplay = true;
        this.applySpeakerSettings();
        this.remoteAudioElement.play().catch(() => {});
    },
    
    applySpeakerSettings() {
        if (!this.remoteAudioElement) return;
        if (this.remoteAudioElement.setSinkId) {
            const sinkId = this.isSpeakerEnabled ? 'speaker' : 'default';
            this.remoteAudioElement.setSinkId(sinkId).catch(() => this.fallbackSpeakerMode());
        } else { this.fallbackSpeakerMode(); }
    },
    
    fallbackSpeakerMode() {
        if (this.isSpeakerEnabled && this.remoteAudioElement?.srcObject) {
            const newAudio = new Audio();
            newAudio.srcObject = this.remoteAudioElement.srcObject;
            newAudio.autoplay = true;
            newAudio.volume = 1;
            this.remoteAudioElement.pause();
            this.remoteAudioElement = newAudio;
            newAudio.play().catch(() => {});
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
                ChatSystem.updateProgressBar(((i + 1) / totalChunks) * 100, `جاري إرسال ${type === 'video' ? 'فيديو' : type === 'image' ? 'صورة' : 'ملف'}...`);
                await new Promise(r => setTimeout(r, 50));
            }
            ChatSystem.hideProgressBar();
            return true;
        } catch(e) { ChatSystem.hideProgressBar(); return false; }
    },
    
    async sendSignal(calleeId, data) {
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            // ✅ إضافة sessionId و timestamp للإشارة
            const signalWithMeta = { 
                ...data, 
                timestamp: Date.now(),
                sessionId: data.sessionId || this.currentCallSessionId || null
            };
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(signalWithMeta), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'webrtc', data: encrypted, timestamp: Date.now() });
        } catch(error) {}
    },
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) audioTrack.enabled = !this.isMuted;
        }
        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) {
            muteBtn.innerHTML = this.isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
            muteBtn.style.background = this.isMuted ? '#f44336' : 'rgba(0,0,0,0.6)';
        }
    },
    
    toggleSpeaker() {
        this.isSpeakerEnabled = !this.isSpeakerEnabled;
        this.applySpeakerSettings();
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            speakerBtn.innerHTML = this.isSpeakerEnabled ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-mute"></i>';
            speakerBtn.style.background = this.isSpeakerEnabled ? '#2196F3' : 'rgba(0,0,0,0.6)';
        }
    },
    
    showCallUI() {
        document.body.classList.add('in-call');
        const existingUi = document.getElementById('callUI');
        if (existingUi) existingUi.remove();
        
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const contactAvatar = document.querySelector('#conversationAvatar')?.textContent || '👤';
        
        const ui = document.createElement('div');
        ui.id = 'callUI';
        ui.innerHTML = `
            <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg, #1a1a2e, #16213e);z-index:9998;"></div>
            <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;text-align:center;">
                <div style="font-size:5rem;margin-bottom:10px;">${contactAvatar}</div>
                <div style="font-size:1.5rem;color:white;font-weight:bold;">${contactName}</div>
                <div style="margin-top:5px;color:#aaa;font-size:0.8rem;" id="callTimer">00:00</div>
            </div>
            <div style="position:fixed;bottom:40px;left:0;right:0;z-index:9999;display:flex;justify-content:center;gap:30px;">
                <button id="speakerBtn" style="width:55px;height:55px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.3rem;cursor:pointer;"><i class="fas fa-volume-up"></i></button>
                <button id="endCallBtn" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.8rem;cursor:pointer;"><i class="fas fa-phone-slash"></i></button>
                <button id="muteBtn" style="width:55px;height:55px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;border:none;font-size:1.3rem;cursor:pointer;"><i class="fas fa-microphone"></i></button>
            </div>
        `;
        document.body.appendChild(ui);
        
        document.getElementById('speakerBtn').onclick = () => this.toggleSpeaker();
        document.getElementById('endCallBtn').onclick = () => this.endCall();
        document.getElementById('muteBtn').onclick = () => this.toggleMute();
        
        this.startCallTimer();
    },
    
    startCallTimer() {
        if (this.callTimerInterval) clearInterval(this.callTimerInterval);
        let seconds = 0;
        this.callTimerInterval = setInterval(() => {
            if (!this.isInCall) { clearInterval(this.callTimerInterval); return; }
            seconds++;
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            const timerEl = document.getElementById('callTimer');
            if (timerEl) timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
    },
    
    endCall() {
        console.log('📞 إنهاء المكالمة');
        if (!this.isInCall && !this.isCalling) return;
        
        this.isInCall = false;
        this.isCalling = false;
        this.currentCallSessionId = null;  // ✅ مسح معرف الجلسة
        this.stopRingTone();
        this.sendCallStatus('disconnected');
        
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        if (this.callTimerInterval) clearInterval(this.callTimerInterval);
        
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
        document.getElementById('callUI')?.remove();
        document.getElementById('incomingCall')?.remove();
        this.pendingCallData = null;
    },
    
    cleanupConnections() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        if (this.dc) { try { this.dc.close(); } catch(e) {} this.dc = null; }
        if (this.pc) { try { this.pc.close(); } catch(e) {} this.pc = null; }
        this.incomingChunks = {};
        this.incomingFileInfo = {};
    }
};

window.startAudioCall = async () => {
    if (!ChatSystem.currentChat) {
        alert('الرجاء اختيار محادثة أولاً');
        return;
    }
    if (CallSystem.isInCall || CallSystem.isCalling) {
        alert('يوجد مكالمة نشطة');
        return;
    }
    await CallSystem.startCall(CallSystem.currentChat);
};
