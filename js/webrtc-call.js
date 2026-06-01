// ========== 1. webrtc-call.js - النسخة النهائية المتكاملة المصلحة ==========
// جميع ميزات الصوت + مكالمات الفيديو + إرسال الملفات + إصلاح مشاكل الكاميرا والشاشة السوداء

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false, callType: null, currentCallId: null,
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
        ],
        sdpSemantics: 'unified-plan' // 🌟 توحيد معايير الاتصال للأندرويد والآيفون لمنع الشاشة السوداء
    },
    
    // ==================== 1.5 حذف إشارات WebRTC من Firestore ====================
    async deleteAllWebRTCSignals(chatId) {
        if (!chatId) return;
        try {
            const messagesRef = window.db.collection('secure_messages');
            const snapshot = await messagesRef
                .where('to', '==', chatId)
                .where('package.type', '==', 'webrtc')
                .get();
            
            if (snapshot.empty) {
                console.log('📡 لا توجد إشارات WebRTC عالقة للمحادثة', chatId);
                return;
            }
            
            const batch = window.db.batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`✅ تم حذف ${snapshot.size} إشارة WebRTC عالقة من Firestore للمحادثة ${chatId}`);
        } catch(e) {
            console.warn('⚠️ فشل حذف الإشارات العالقة:', e);
        }
    },
    
    async deleteAllMyWebRTCSignals() {
        if (!window.auth?.currentUser) return;
        const myId = window.auth.currentUser.uid;
        try {
            const messagesRef = window.db.collection('secure_messages');
            const snapshot = await messagesRef
                .where('to', '==', myId)
                .where('package.type', '==', 'webrtc')
                .get();
            
            if (snapshot.empty) return;
            
            const batch = window.db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`✅ تم حذف ${snapshot.size} إشارة WebRTC عالقة للمستخدم الحالي`);
        } catch(e) {}
    },
    
    // ==================== 2. التنظيف التلقائي ====================
    async autoCleanupOnLoad() {
        console.log('🧹 تشغيل التنظيف التلقائي للمكالمات العالقة...');
        await this.deleteAllMyWebRTCSignals();
        
        this.isInCall = false;
        this.callType = null;
        this.currentCallId = null;
        this.isAudioMuted = false;
        this.isVideoMuted = false;
        this.isSpeakerEnabled = false;
        
        if (this.keepAliveInterval) { clearInterval(this.keepAliveInterval); this.keepAliveInterval = null; }
        if (this.callTimerInterval) { clearInterval(this.callTimerInterval); this.callTimerInterval = null; }
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        
        if (this.remoteAudioElement) {
            this.remoteAudioElement.pause();
            this.remoteAudioElement.srcObject = null;
            this.remoteAudioElement = null;
        }
        
        if (this.localStream) {
            try { this.localStream.getTracks().forEach(t => t.stop()); } catch(e) {}
            this.localStream = null;
        }
        
        this.cleanupConnections();
        
        const ui = document.getElementById('callUI');
        if (ui) ui.remove();
        const inc = document.getElementById('incomingCall');
        if (inc) inc.remove();
        document.body.classList.remove('in-call');
        
        if (typeof PresenceSystem !== 'undefined' && window.auth?.currentUser) {
            try {
                await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                    online: true,
                    inCall: false,
                    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log('✅ تم تنظيف حالة المستخدم في قاعدة البيانات');
            } catch(e) {
                console.warn('⚠️ فشل تنظيف قاعدة البيانات:', e.message);
            }
        }
        console.log('✅ اكتمل التنظيف التلقائي - جاهز للمكالمات الجديدة');
    },
    
    // ==================== 3. Data Channel فقط ====================
    async ensureDataChannelOnly(calleeId) {
        if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) return false;
        if (!calleeId) return false;
        if (this.dc && this.dc.readyState === 'open') return true;
        
        if (this.dc && this.dc.readyState === 'connecting') {
            return new Promise((resolve) => {
                const timeout = setTimeout(() => resolve(false), 10000);
                const check = setInterval(() => {
                    if (this.dc && this.dc.readyState === 'open') {
                        clearInterval(check); clearTimeout(timeout); resolve(true);
                    } else if (this.dc && (this.dc.readyState === 'failed' || this.dc.readyState === 'closed')) {
                        clearInterval(check); clearTimeout(timeout);
                        this.createDataChannelOnly(calleeId).then(resolve);
                    }
                }, 500);
            });
        }
        return this.createDataChannelOnly(calleeId);
    },
    
    async createDataChannelOnly(calleeId) {
        if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) return false;
        this.cleanupConnections();
        try {
            this.pc = new RTCPeerConnection(this.servers);
            this.dc = this.pc.createDataChannel('chat', { ordered: true, maxRetransmits: 3 });
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { 
                if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }).catch(() => {});
            };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            
            const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: 'datachannel' });
            return true;
        } catch (error) {
            return false;
        }
    },
    
    // ==================== 4. المكالمة الصوتية ====================
    async startAudioCall(calleeId) {
        if (!ChatSystem.friendInConversation || !window.auth?.currentUser || this.isInCall) return;
        
        this.isInCall = true;
        this.callType = 'audio';
        this.currentCallId = calleeId;
        
        try {
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                inCall: true, callType: 'audio'
            }).catch(() => {});
            
            this.showCallUI('audio');
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            
            if (this.localStream.getAudioTracks().length === 0) { this.endCall(); return; }
            
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }); };
            this.pc.ontrack = e => { if (e.track.kind === 'audio') this.setupRemoteAudio(e.streams[0]); };
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) this.endCall();
            };
            
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: 'audio' });
        } catch (e) { 
            this.endCall(); 
        }
    },

    // ==================== 5. المكالمة المرئية (المتصل) ====================
    async startVideoCall(calleeId) {
        if (!ChatSystem.friendInConversation || !window.auth?.currentUser || this.isInCall) return;
        
        this.isInCall = true;
        this.callType = 'video';
        this.currentCallId = calleeId;
        this.isVideoMuted = false; // تشغيل الكاميرا فوراً للمتصل
        
        try {
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                inCall: true, callType: 'video'
            }).catch(() => {});
            
            // طلب الكاميرا الأمامية افتراضياً للمتصل بدقة متوازنة للهواتف
            const constraints = { 
                audio: true, 
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
            };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            this.showCallUI('video');
            this.pc = new RTCPeerConnection(this.servers);
            
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }); };
            
            this.pc.ontrack = e => {
                if (e.track.kind === 'video') {
                    const rv = document.getElementById('remoteVideo');
                    if (rv && e.streams[0]) {
                        rv.srcObject = e.streams[0];
                        rv.setAttribute('autoplay', '');
                        rv.setAttribute('playsinline', '');
                        rv.play().catch(() => {});
                    }
                }
            };
            
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) this.endCall();
            };
            
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: 'video' });
            
        } catch (e) { 
            this.endCall(); 
        }
    },
    
    // ==================== 6. إعداد الصوت عن بعد ====================
    setupRemoteAudio(stream) {
        if (this.remoteAudioElement) { this.remoteAudioElement.pause(); this.remoteAudioElement.srcObject = null; }
        this.remoteAudioElement = new Audio();
        this.remoteAudioElement.srcObject = stream;
        this.remoteAudioElement.autoplay = true;
        this.applySpeakerSettings();
        this.remoteAudioElement.play().catch(() => {});
    },
    
    applySpeakerSettings() {
        if (!this.remoteAudioElement) return;
        if (this.remoteAudioElement.setSinkId) {
            const target = this.isSpeakerEnabled ? 'speaker' : 'default';
            this.remoteAudioElement.setSinkId(target).catch(() => {});
        }
    },

    // ==================== 7. استقبال المكالمات (المستقبل) ====================
    async receiveCall(callerId, callData) {
        if (this.isInCall) { this.sendSignal(callerId, { type: 'reject' }); return; }
        
        this.isInCall = true;
        this.callType = callData.type || 'audio';
        this.currentCallId = callerId;
        this.isVideoMuted = false; // ✅ إصلاح: جعل الكاميرا تعمل تلقائياً دون كتم عند المجاوبة
        
        try {
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                inCall: true, callType: this.callType
            }).catch(() => {});
            
            const constraints = { 
                audio: true, 
                video: this.callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.showCallUI(this.callType);
            
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(callerId, { candidate: e.candidate }); };
            
            this.pc.ontrack = e => {
                if (e.track.kind === 'video') {
                    const rv = document.getElementById('remoteVideo');
                    if (rv && e.streams[0]) {
                        rv.srcObject = e.streams[0];
                        rv.setAttribute('autoplay', '');
                        rv.setAttribute('playsinline', ''); // منع فتح مشغل النظام بالآيفون
                        rv.play().catch(() => {});
                    }
                } else if (e.track.kind === 'audio') {
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) this.endCall();
            };
            
            if (callData.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp));
                const answerOptions = { offerToReceiveAudio: true, offerToReceiveVideo: this.callType === 'video' };
                const answer = await this.pc.createAnswer(answerOptions);
                await this.pc.setLocalDescription(answer);
                await this.sendSignal(callerId, { sdp: this.pc.localDescription });
            }
            
            if (this.callType === 'video') {
                const lv = document.getElementById('localVideo');
                if (lv && this.localStream) lv.srcObject = this.localStream;
            }
            
        } catch (e) { 
            this.sendSignal(callerId, { type: 'reject' });
            this.endCall(); 
        }
    },
    
    // ==================== 8. شاشة المكالمة الواردة ====================
    showIncomingCall(callerId, callData) {
        if (callData.type === 'datachannel') { this.handleSignaling(callData); return; }
        this.currentCallId = callerId;
        const callType = callData.type === 'video' ? 'video' : 'audio';
        const acceptIcon = callType === 'video' ? 'fa-video' : 'fa-phone';
        
        const fetchUserData = async () => {
            try {
                const doc = await window.db.collection('users').doc(callerId).get();
                if (doc.exists) return doc.data();
            } catch (e) {}
            return {};
        };
        
        fetchUserData().then(userData => {
            const contactName = userData.name || 'مستخدم';
            const emojiMap = { 'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧' };
            const contactAvatar = emojiMap[userData.avatarType] || '👤';
            
            const existingOverlay = document.getElementById('incomingCall');
            if (existingOverlay) existingOverlay.remove();
            
            const overlay = document.createElement('div');
            overlay.id = 'incomingCall';
            overlay.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:#0a0e27;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:system-ui;`;
            
            overlay.innerHTML = `
                <style>
                    @keyframes float { 0%,100% {transform:translateY(0px);} 50% {transform:translateY(-15px);} }
                    @keyframes ring { 0% {transform:rotate(0deg);} 25% {transform:rotate(6deg);} 50% {transform:rotate(0deg);} 75% {transform:rotate(-6deg);} 100% {transform:rotate(0deg);} }
                    .avatar-float { animation: float 2.5s ease-in-out infinite; }
                    .ring-animation { animation: ring 1.2s ease-in-out infinite; transform-origin: center; }
                    .swipe-container { width: 360px; margin: 30px auto; position: relative; }
                    .swipe-button { width:100%; height:80px; border-radius:50px; position:relative; overflow:hidden; background:linear-gradient(90deg, #1a5a2a 0%, #1a5a2a 50%, #8b1a1a 50%, #8b1a1a 100%); border:2px solid #2196F3; }
                    .swipe-thumb { position:absolute; top:8px; width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.8rem; z-index:30; cursor:grab; border:2px solid #2196F3; }
                    .thumb-left { left:8px; background:linear-gradient(145deg, #4CAF50, #1b5e2a); color:white; }
                    .thumb-right { right:8px; background:linear-gradient(145deg, #f44336, #8b0000); color:white; }
                    .divider-line { position:absolute; top:10px; bottom:10px; left:50%; width:2px; background:#2196F3; transform:translateX(-50%); pointer-events:none; z-index:5; }
                    .center-dot { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:14px; height:14px; background:#2196F3; border-radius:50%; pointer-events:none; z-index:20; }
                </style>
                <div style="text-align:center; margin-bottom:50px;">
                    <div class="avatar-float ring-animation" style="font-size:5.5rem; margin-bottom:15px;">${contactAvatar}</div>
                    <div style="font-size:1.8rem; font-weight:bold;">${contactName}</div>
                </div>
                <div class="swipe-container">
                    <div id="swipeButton" class="swipe-button">
                        <div class="divider-line"></div>
                        <div class="center-dot"></div>
                        <div id="leftThumb" class="swipe-thumb thumb-left"><i class="fas ${acceptIcon}"></i></div>
                        <div id="rightThumb" class="swipe-thumb thumb-right"><i class="fas fa-phone-slash"></i></div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            
            const button = document.getElementById('swipeButton');
            const leftThumb = document.getElementById('leftThumb');
            const rightThumb = document.getElementById('rightThumb');
            
            let isDraggingLeft = false, isDraggingRight = false;
            let leftStartX = 0, rightStartX = 0, leftCurrentPos = 8, rightCurrentPos = 8;
            const maxLeftMove = (button.clientWidth / 2) - 40;
            const maxRightMove = (button.clientWidth / 2) - 40;
            
            const onLeftStart = (e) => {
                e.preventDefault(); isDraggingLeft = true;
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                leftStartX = clientX - (leftThumb.getBoundingClientRect().left - button.getBoundingClientRect().left);
                leftThumb.style.transition = 'none';
            };
            const onLeftMove = (e) => {
                if (!isDraggingLeft) return;
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                let newLeft = clientX - leftStartX - button.getBoundingClientRect().left;
                newLeft = Math.max(8, Math.min(newLeft, maxLeftMove));
                leftCurrentPos = newLeft; leftThumb.style.left = newLeft + 'px';
            };
            const onLeftEnd = () => {
                if (!isDraggingLeft) return; isDraggingLeft = false;
                leftThumb.style.transition = 'left 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
                if (leftCurrentPos >= maxLeftMove - 10) {
                    overlay.remove(); this.receiveCall(callerId, callData);
                } else { leftThumb.style.left = '8px'; }
            };
            
            const onRightStart = (e) => {
                e.preventDefault(); isDraggingRight = true;
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                rightStartX = (rightThumb.getBoundingClientRect().right - clientX);
                rightThumb.style.transition = 'none';
            };
            const onRightMove = (e) => {
                if (!isDraggingRight) return;
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                let newRight = (button.getBoundingClientRect().right - clientX) - rightStartX;
                newRight = Math.max(8, Math.min(newRight, maxRightMove));
                rightCurrentPos = newRight; rightThumb.style.right = newRight + 'px';
            };
            const onRightEnd = () => {
                if (!isDraggingRight) return; isDraggingRight = false;
                rightThumb.style.transition = 'right 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
                if (rightCurrentPos >= maxRightMove - 10) {
                    overlay.remove(); this.sendSignal(callerId, { type: 'reject' });
                } else { rightThumb.style.right = '8px'; }
            };
            
            leftThumb.addEventListener('mousedown', onLeftStart);
            leftThumb.addEventListener('touchstart', onLeftStart, { passive: false });
            rightThumb.addEventListener('mousedown', onRightStart);
            rightThumb.addEventListener('touchstart', onRightStart, { passive: false });
            
            document.addEventListener('mousemove', (e) => { onLeftMove(e); onRightMove(e); });
            document.addEventListener('touchmove', (e) => { onLeftMove(e); onRightMove(e); }, { passive: false });
            document.addEventListener('mouseup', () => { onLeftEnd(); onRightEnd(); });
            document.addEventListener('touchend', () => { onLeftEnd(); onRightEnd(); });
            
            setTimeout(() => {
                const stillThere = document.getElementById('incomingCall');
                if (stillThere) { stillThere.remove(); this.sendSignal(callerId, { type: 'reject' }); }
            }, 30000);
        });
    },
    
    // ==================== 9. Data Channel وإدارة الاتصال ====================
    setupDataChannel(channel) {
        if (!channel) return;
        channel.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'direct_text') {
                    const displayMsg = { id: msg.id, type: 'text', text: msg.text, sender: 'friend', time: msg.time || new Date().toISOString() };
                    if (ChatSystem.currentChat) { ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg); ChatSystem.displayMessage(displayMsg); }
                    return;
                }
                if (msg.type === 'webrtc_signal') { this.handleSignaling(msg.data); return; }
                if (msg.type === 'force_close_conversation') {
                    if (ChatSystem.currentChat) {
                        ChatSystem.closeChat(); ChatSystem.featuresEnabled = false;
                        const toggleInput = document.getElementById('featureToggleInput');
                        if (toggleInput) toggleInput.checked = false;
                    }
                    return;
                }
                if (msg.type === 'ping') return;
                if (msg.type === 'call_status') { this.handleCallStatus(msg); return; }
                if (msg.chunk !== undefined) { this.handleChunkMessage(msg); return; }
                
                const displayMsg = { id: msg.id || Date.now().toString(), type: msg.type, data: msg.data, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
                if (ChatSystem.currentChat) { ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg); ChatSystem.displayMessage(displayMsg); }
            } catch (error) {}
        };
        
        channel.onopen = () => {
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectAttempts = 0; this.sendCallStatus('connected');
            if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = setInterval(() => {
                if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            }, 2000);
        };
        
        channel.onclose = () => {
            this.sendCallStatus('disconnected');
            if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
            this.scheduleReconnect();
        };
    },
    
    handleCallStatus(msg) {
        if (msg.status === 'disconnected' && this.isInCall) this.endCall();
    },
    
    sendCallStatus(status) {
        if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify({ type: 'call_status', status: status, timestamp: Date.now() }));
    },
    
    scheduleReconnect() {
        if (!ChatSystem.currentChat || this.reconnectAttempts >= this.maxReconnectAttempts) return;
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
        this.reconnectTimer = setTimeout(async () => {
            if (ChatSystem.currentChat) await this.ensureDataChannelOnly(ChatSystem.currentChat);
        }, delay);
    },
    
    async handleSignaling(data) {
        try {
            if (data.type === 'reject' || data.type === 'call_ended') { this.endCall(); return; }
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
            } else if (data.candidate && this.pc) {
                await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (e) {}
    },
    
    async sendSignal(calleeId, data) {
        if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) return;
        if (this.dc && this.dc.readyState === 'open') {
            try { this.dc.send(JSON.stringify({ type: 'webrtc_signal', data: data })); return; } catch(e) {}
        }
        try {
            const myPriv = await SecureChatSystem.getMyPrivateKey();
            const recPub = await SecureChatSystem.getReceiverPublicKey(calleeId);
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPriv, recPub);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'webrtc', data: encrypted, timestamp: Date.now() });
        } catch (error) {}
    },
    
    // ==================== 10. واجهة المستخدم (أثناء المكالمة) ====================
    showCallUI(type) {
        document.body.classList.add('in-call');
        const existingUi = document.getElementById('callUI');
        if (existingUi) existingUi.remove();
        
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const contactAvatar = document.querySelector('#conversationAvatar')?.textContent || '👤';
        
        let uiHTML = '';
        if (type === 'video') {
            uiHTML = `
                <style>
                    @keyframes pulse { 0% {transform:scale(1);} 70% {transform:scale(1.05);} 100% {transform:scale(1);} }
                    .call-btn { backdrop-filter: blur(10px); background: rgba(30, 30, 40, 0.85) !important; border: 1px solid rgba(255,255,255,0.15) !important; }
                    .end-call-btn { background: linear-gradient(135deg, #f44336, #d32f2f) !important; animation: pulse 1.5s infinite; }
                    .local-video { border: 3px solid rgba(255,255,255,0.3); box-shadow: 0 5px 20px rgba(0,0,0,0.3); object-fit: cover; }
                </style>
                <video id="remoteVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;position:fixed;top:0;left:0;z-index:9998;background:#0a0e27;"></video>
                <video id="localVideo" autoplay playsinline muted class="local-video" style="width:120px;height:170px;position:fixed;bottom:100px;right:20px;z-index:9999;border-radius:16px;"></video>
                <div style="position:fixed;bottom:40px;left:0;right:0;z-index:9999;display:flex;justify-content:center;gap:25px;padding:0 20px;">
                    <button id="switchCameraBtn" class="call-btn" style="width:60px;height:60px;border-radius:50%;font-size:1.5rem;color:#2196F3;" title="تبديل الكاميرا"><i class="fas fa-sync-alt"></i></button>
                    <button id="muteAudioBtn" class="call-btn" style="width:60px;height:60px;border-radius:50%;font-size:1.5rem;color:#2196F3;" title="كتم الميكروفون"><i class="fas fa-microphone"></i></button>
                    <button id="endCallBtn" class="end-call-btn" style="width:75px;height:75px;border-radius:50%;font-size:2rem;color:white;" title="إنهاء المكالمة"><i class="fas fa-phone-slash"></i></button>
                    <button id="muteVideoBtn" class="call-btn" style="width:60px;height:60px;border-radius:50%;font-size:1.5rem;color:#2196F3;" title="إيقاف الكاميرا"><i class="fas fa-video"></i></button>
                </div>`;
        } else {
            uiHTML = `
                <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg, #1a1a2e, #16213e);z-index:9997;"></div>
                <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;text-align:center;color:white;">
                    <div style="font-size:6rem;margin-bottom:15px;">${contactAvatar}</div>
                    <div style="font-size:1.8rem;font-weight:bold;">${contactName}</div>
                    <div style="margin-top:8px;color:#4CAF50;background:rgba(76,175,80,0.2);padding:5px 15px;border-radius:20px;display:inline-block;">
                        <span id="callTimer">00:00</span>
                    </div>
                </div>
                <div style="position:fixed;bottom:40px;left:0;right:0;z-index:9999;display:flex;justify-content:center;gap:30px;">
                    <button id="speakerBtn" class="call-btn" style="width:65px;height:65px;border-radius:50%;font-size:1.6rem;color:#2196F3;"><i class="fas fa-volume-up"></i></button>
                    <button id="endCallBtn" class="end-call-btn" style="width:80px;height:80px;border-radius:50%;font-size:2.2rem;color:white;"><i class="fas fa-phone-slash"></i></button>
                    <button id="muteBtn" class="call-btn" style="width:65px;height:65px;border-radius:50%;font-size:1.6rem;color:#2196F3;"><i class="fas fa-microphone"></i></button>
                </div>`;
        }
        
        const ui = document.createElement('div'); ui.id = 'callUI'; ui.innerHTML = uiHTML; document.body.appendChild(ui);
        document.getElementById('endCallBtn')?.addEventListener('click', () => this.endCall());
        
        if (type === 'video') {
            const lv = document.getElementById('localVideo');
            if (lv && this.localStream) lv.srcObject = this.localStream;
            document.getElementById('switchCameraBtn')?.addEventListener('click', () => this.switchCamera());
            
            const muteAudioBtn = document.getElementById('muteAudioBtn');
            muteAudioBtn?.addEventListener('click', () => {
                this.toggleAudio();
                const icon = muteAudioBtn.querySelector('i');
                if (icon) {
                    icon.className = this.isAudioMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                    muteAudioBtn.style.color = this.isAudioMuted ? '#f44336' : '#2196F3';
                }
            });
            
            const muteVideoBtn = document.getElementById('muteVideoBtn');
            muteVideoBtn?.addEventListener('click', () => {
                this.toggleVideo();
                const icon = muteVideoBtn.querySelector('i');
                if (icon) {
                    icon.className = this.isVideoMuted ? 'fas fa-video-slash' : 'fas fa-video';
                    muteVideoBtn.style.color = this.isVideoMuted ? '#f44336' : '#2196F3';
                }
            });
        } else {
            document.getElementById('speakerBtn')?.addEventListener('click', () => {
                this.toggleSpeaker();
                const icon = document.getElementById('speakerBtn').querySelector('i');
                if (icon) icon.className = this.isSpeakerEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
            });
            document.getElementById('muteBtn')?.addEventListener('click', () => {
                this.toggleMute();
                const icon = document.getElementById('muteBtn').querySelector('i');
                if (icon) {
                    icon.className = this.isAudioMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                    document.getElementById('muteBtn').style.color = this.isAudioMuted ? '#f44336' : '#2196F3';
                }
            });
            this.startCallTimer();
        }
    },

    // ==================== 11. مؤقت المكالمة ====================
    startCallTimer() {
        if (this.callTimerInterval) clearInterval(this.callTimerInterval);
        let seconds = 0;
        this.callTimerInterval = setInterval(() => {
            if (!this.isInCall) return; seconds++;
            const timerEl = document.getElementById('callTimer');
            if (timerEl) {
                const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
                const secs = (seconds % 60).toString().padStart(2, '0');
                timerEl.textContent = `${mins}:${secs}`;
            }
        }, 1000);
    },

    // ==================== 12. التحكم بالمكالمة ====================
    toggleMute() {
        this.isAudioMuted = !this.isAudioMuted;
        if (this.localStream?.getAudioTracks()[0]) this.localStream.getAudioTracks()[0].enabled = !this.isAudioMuted;
    },
    toggleAudio() {
        if (this.localStream?.getAudioTracks()[0]) {
            this.localStream.getAudioTracks()[0].enabled = !this.localStream.getAudioTracks()[0].enabled;
            this.isAudioMuted = !this.localStream.getAudioTracks()[0].enabled;
        }
    },
    toggleVideo() {
        if (this.localStream?.getVideoTracks()[0]) {
            this.localStream.getVideoTracks()[0].enabled = !this.localStream.getVideoTracks()[0].enabled;
            this.isVideoMuted = !this.localStream.getVideoTracks()[0].enabled;
        }
    },
    toggleSpeaker() { this.isSpeakerEnabled = !this.isSpeakerEnabled; this.applySpeakerSettings(); },

    // ==================== 🌟 دالة تبديل الكاميرا المصلحة بالكامل 🌟 ====================
    async switchCamera() {
        if (!this.localStream) return;
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (!videoTrack) return;
        
        const currentFacing = videoTrack.getSettings().facingMode;
        const newFacing = currentFacing === 'user' ? 'environment' : 'user';
        
        // 1. إيقاف المسار الحالي تماماً لتحرير حساس الكاميرا في الهاتف
        videoTrack.stop();
        
        try {
            // 2. طلب تيار الكاميرا الجديدة
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: newFacing, width: { ideal: 640 }, height: { ideal: 480 } }
            });
            const newVideoTrack = newStream.getVideoTracks()[0];
            
            // 3. تحديث المسار داخل اتصال الـ RTCPeerConnection فوراً
            if (this.pc) {
                const sender = this.pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(newVideoTrack);
                }
            }
            
            // 4. دمج المسار الجديد مع الصوت في الـ localStream الرئيسي
            const audioTrack = this.localStream.getAudioTracks()[0];
            this.localStream = new MediaStream([newVideoTrack, audioTrack].filter(Boolean));
            
            // 5. تحديث الشاشة المصغرة للمستخدم
            const lv = document.getElementById('localVideo');
            if (lv) lv.srcObject = this.localStream;
            
            // 6. 🌟 إجبار النظام على إعادة التفاوض السريعة (Renegotiation) لكي يرى الطرف الآخر الصورة فوراً
            if (this.pc) {
                const offer = await this.pc.createOffer({ offerToReceiveVideo: true });
                await this.pc.setLocalDescription(offer);
                await this.sendSignal(ChatSystem.currentChat, { sdp: this.pc.localDescription });
            }
            
            console.log(`🔄 تم تبديل الكاميرا بنجاح إلى: ${newFacing}`);
        } catch (e) {
            console.error('❌ فشل تبديل الكاميرا:', e);
        }
    },
    
    // ==================== 13. إرسال واستقبال الملفات ====================
    async sendFileDirect(file, type) {
        if (!this.dc || this.dc.readyState !== 'open') return false;
        try {
            let blobToSend = file;
            if (type === 'image') blobToSend = await this.compressImage(file);
            const b64 = await this.fileToBase64(blobToSend);
            const chunkSize = 16000;
            const totalChunks = Math.ceil(b64.length / chunkSize);
            const fileId = Date.now().toString();
            
            for (let i = 0; i < totalChunks; i++) {
                if (this.dc.readyState !== 'open') { ChatSystem.hideProgressBar(); return false; }
                const chunk = { type: type, data: b64.substring(i * chunkSize, (i + 1) * chunkSize), chunk: i, total: totalChunks, id: fileId, fileName: file.name || 'ملف' };
                this.dc.send(JSON.stringify(chunk));
                const progress = ((i + 1) / totalChunks) * 100;
                ChatSystem.updateProgressBar(progress, `جاري إرسال الملف...`);
                await new Promise(r => setTimeout(r, 50));
            }
            ChatSystem.hideProgressBar(); return true;
        } catch (e) { ChatSystem.hideProgressBar(); return false; }
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
        ChatSystem.updateProgressBar(progress, `جاري استلام الملف...`);
        
        if (this.incomingFileInfo[msg.id].received === msg.total) {
            const fullData = this.incomingChunks[msg.id].join('');
            let finalData = fullData;
            if (msg.type === 'image' && !fullData.startsWith('data:image')) finalData = 'data:image/jpeg;base64,' + fullData;
            else if (msg.type === 'video' && !fullData.startsWith('data:video')) finalData = 'data:video/mp4;base64,' + fullData;
            else if (msg.type === 'voice' && !fullData.startsWith('data:audio')) finalData = 'data:audio/webm;base64,' + fullData;
            
            const displayMsg = { id: msg.id, type: msg.type === 'location' ? 'text' : msg.type, data: finalData, fileName: msg.fileName || 'ملف', sender: 'friend', time: new Date().toISOString() };
            if (ChatSystem.currentChat) { ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg); ChatSystem.displayMessage(displayMsg); }
            ChatSystem.hideProgressBar();
            delete this.incomingChunks[msg.id]; delete this.incomingFileInfo[msg.id];
        }
    },
    
    compressImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width, height = img.height;
                    if (width > height && width > 800) { height = (height * 800) / width; width = 800; }
                    else if (height > 800) { width = (width * 800) / height; height = 800; }
                    canvas.width = width; canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.7);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1] || reader.result);
            reader.onerror = reject; reader.readAsDataURL(file);
        });
    },
    
    // ==================== 14. إنهاء المكالمة والتنظيف ====================
    endCall() {
        if (this.currentCallId && ChatSystem.currentChat) this.sendSignal(ChatSystem.currentChat, { type: 'call_ended' });
        this.currentCallId = null; this.sendCallStatus('disconnected');
        
        if (this.keepAliveInterval) { clearInterval(this.keepAliveInterval); this.keepAliveInterval = null; }
        if (this.callTimerInterval) { clearInterval(this.callTimerInterval); this.callTimerInterval = null; }
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        
        if (this.remoteAudioElement) { this.remoteAudioElement.pause(); this.remoteAudioElement.srcObject = null; this.remoteAudioElement = null; }
        if (this.localStream) { try { this.localStream.getTracks().forEach(t => t.stop()); } catch(e) {} this.localStream = null; }
        
        this.cleanupConnections();
        
        const ui = document.getElementById('callUI'); if (ui) ui.remove();
        const inc = document.getElementById('incomingCall'); if (inc) inc.remove();
        document.body.classList.remove('in-call');
        
        this.isInCall = false; this.callType = null; this.isAudioMuted = false; this.isVideoMuted = false; this.isSpeakerEnabled = false; this.reconnectAttempts = 0;
        
        if (window.auth?.currentUser) {
            window.db.collection('users').doc(window.auth.currentUser.uid).update({
                inCall: false, callType: null, lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }
    },
    
    cleanupConnections() {
        if (this.dc) { try { this.dc.close(); } catch(e) {} this.dc = null; }
        if (this.pc) { try { this.pc.close(); } catch(e) {} this.pc = null; }
        this.incomingChunks = {}; this.incomingFileInfo = {};
    }
};

// ==================== 15. التنظيف عند تحميل وتحميل الصفحة ====================
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => { if (typeof CallSystem !== 'undefined') CallSystem.autoCleanupOnLoad(); }, 1500);
    });
}
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => { if (CallSystem.isInCall) CallSystem.endCall(); });
}

// ==================== 17. الدوال العامة للربط مع الأزرار ====================
window.startAudioCall = async () => {
    if (!ChatSystem.currentChat) { alert('الرجاء اختيار محادثة أولاً'); return; }
    await CallSystem.startAudioCall(ChatSystem.currentChat);
};
window.startVideoCall = async () => {
    if (!ChatSystem.currentChat) { alert('الرجاء اختيار محادثة أولاً'); return; }
    await CallSystem.startVideoCall(ChatSystem.currentChat);
};
window.cleanupCallState = async () => { await CallSystem.autoCleanupOnLoad(); };

console.log('✅ تم حفظ وإصلاح نظام مكالمات WebRTC بنجاح كامل 100%');
