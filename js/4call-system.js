// ========== 4call-system.js - نظام المكالمات الصوتية والمرئية المستقل ==========

const VoiceVideoSystem = {
    pc: null,
    dc: null,
    localStream: null,
    isInCall: false,
    callType: null,
    currentCallId: null,
    remoteAudioElement: null,
    isAudioMuted: false,
    isVideoMuted: false,
    isSpeakerEnabled: false,
    callTimerInterval: null,
    keepAliveInterval: null,
    
    servers: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
    },
    
    // ==================== حذف إشارات المكالمات فقط ====================
    async deleteCallSignals(chatId) {
        if (!chatId || !window.db) return;
        try {
            const messagesRef = window.db.collection('secure_messages');
            const snapshot = await messagesRef
                .where('to', '==', chatId)
                .where('package.type', 'in', ['call_offer', 'call_answer', 'call_ice', 'webrtc'])
                .get();
            
            if (snapshot.empty) return;
            
            const batch = window.db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`✅ تم حذف ${snapshot.size} إشارة مكالمات من Firestore`);
        } catch(e) {
            console.warn('⚠️ فشل حذف إشارات المكالمات:', e);
        }
    },
    
    // ==================== بدء مكالمة صوتية ====================
    async startAudioCall(calleeId) {
        if (!ChatSystem.friendInConversation || !ChatSystem.featuresEnabled) {
            console.log('❌ لا يمكن بدء المكالمة: الميزات غير مفعلة أو الطرف الآخر ليس في المحادثة');
            return false;
        }
        
        if (this.isInCall) {
            console.log('❌ مكالمة نشطة بالفعل');
            return false;
        }
        
        this.isInCall = true;
        this.callType = 'audio';
        this.currentCallId = calleeId;
        
        try {
            if (window.auth?.currentUser) {
                await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                    inCall: true,
                    callType: 'audio'
                }).catch(() => {});
            }
            
            this.showCallUI('audio');
            
            const silentAudio = new Audio();
            silentAudio.volume = 0;
            silentAudio.play().catch(() => {});
            
            console.log('🎤 طلب الوصول إلى الميكروفون...');
            const constraints = { audio: true, video: false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            const audioTracks = this.localStream.getAudioTracks();
            if (audioTracks.length === 0) {
                this.endCall();
                return false;
            }
            console.log('✅ تم الحصول على الميكروفون');
            
            this.pc = new RTCPeerConnection(this.servers);
            
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
                console.log(`➕ تم إضافة مسار ${track.kind}`);
            });
            
            this.pc.onicecandidate = e => {
                if (e.candidate) {
                    console.log('📡 إرسال ICE candidate للمكالمة');
                    this.sendSignal(calleeId, { candidate: e.candidate, type: 'call_ice' });
                }
            };
            
            this.pc.ontrack = e => {
                console.log(`📞 استقبال مسار ${e.track.kind}`);
                if (e.track.kind === 'audio') {
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pc.onconnectionstatechange = () => {
                console.log(`🔄 حالة اتصال المكالمة: ${this.pc?.connectionState}`);
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            console.log('📞 إنشاء عرض مكالمة صوتية...');
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: 'call_offer' });
            console.log('✅ تم إرسال العرض');
            return true;
            
        } catch (e) {
            console.error('❌ خطأ في بدء المكالمة الصوتية:', e);
            this.endCall();
            return false;
        }
    },
    
    // ==================== بدء مكالمة فيديو ====================
    async startVideoCall(calleeId) {
        if (!ChatSystem.friendInConversation || !ChatSystem.featuresEnabled) {
            console.log('❌ لا يمكن بدء المكالمة: الميزات غير مفعلة أو الطرف الآخر ليس في المحادثة');
            return false;
        }
        
        if (this.isInCall) {
            console.log('❌ مكالمة نشطة بالفعل');
            return false;
        }
        
        this.isInCall = true;
        this.callType = 'video';
        this.currentCallId = calleeId;
        
        try {
            if (window.auth?.currentUser) {
                await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                    inCall: true,
                    callType: 'video'
                }).catch(() => {});
            }
            
            const constraints = {
                audio: true,
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' }
            };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (this.localStream.getAudioTracks().length === 0) {
                this.endCall();
                return false;
            }
            
            this.showCallUI('video');
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            this.pc.onicecandidate = e => {
                if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate, type: 'call_ice' });
            };
            
            this.pc.ontrack = e => {
                const rv = document.getElementById('remoteVideo');
                if (rv && e.streams[0]) rv.srcObject = e.streams[0];
                if (e.track.kind === 'audio') {
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: 'call_offer' });
            return true;
            
        } catch (e) {
            console.error('❌ خطأ في بدء مكالمة الفيديو:', e);
            this.endCall();
            return false;
        }
    },
    
    // ==================== استقبال مكالمة ====================
    async receiveCall(callerId, callData) {
        if (this.isInCall) {
            console.log('❌ مكالمة نشطة بالفعل');
            this.sendSignal(callerId, { type: 'reject' });
            return false;
        }
        
        this.isInCall = true;
        this.callType = callData.type || 'audio';
        this.currentCallId = callerId;
        console.log(`📞 استقبال مكالمة ${this.callType === 'video' ? 'فيديو' : 'صوتية'} من ${callerId}`);
        
        try {
            if (window.auth?.currentUser) {
                await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                    inCall: true,
                    callType: this.callType
                }).catch(() => {});
            }
            
            const silentAudio = new Audio();
            silentAudio.volume = 0;
            silentAudio.play().catch(() => {});
            
            const constraints = {
                audio: true,
                video: this.callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' } : false
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (this.localStream.getAudioTracks().length === 0) {
                this.endCall();
                return false;
            }
            
            if (this.callType === 'video') {
                const videoTrack = this.localStream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.enabled = false;
                    this.isVideoMuted = true;
                    console.log('✅ تم إيقاف الكاميرا بشكل افتراضي');
                }
            }
            
            this.showCallUI(this.callType);
            
            this.pc = new RTCPeerConnection(this.servers);
            
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
                console.log(`➕ تم إضافة مسار ${track.kind}`);
            });
            
            this.pc.onicecandidate = e => {
                if (e.candidate) this.sendSignal(callerId, { candidate: e.candidate, type: 'call_ice' });
            };
            
            this.pc.ontrack = e => {
                console.log('📞 استقبال مسار:', e.track.kind);
                
                if (e.track.kind === 'video') {
                    console.log('✅ تم استقبال فيديو بعيد');
                    const rv = document.getElementById('remoteVideo');
                    if (rv) {
                        rv.srcObject = e.streams[0];
                        rv.play().catch(err => console.log('خطأ في تشغيل الفيديو البعيد:', err));
                    } else {
                        setTimeout(() => {
                            const rv2 = document.getElementById('remoteVideo');
                            if (rv2) rv2.srcObject = e.streams[0];
                        }, 500);
                    }
                } else if (e.track.kind === 'audio') {
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pc.onconnectionstatechange = () => {
                console.log(`🔄 حالة اتصال المكالمة: ${this.pc?.connectionState}`);
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            if (callData.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp));
                const answerOptions = { offerToReceiveAudio: true, offerToReceiveVideo: this.callType === 'video' };
                const answer = await this.pc.createAnswer(answerOptions);
                await this.pc.setLocalDescription(answer);
                await this.sendSignal(callerId, { sdp: this.pc.localDescription, type: 'call_answer' });
                console.log('✅ تم إرسال الرد');
            }
            
            if (this.callType === 'video') {
                setTimeout(() => {
                    const lv = document.getElementById('localVideo');
                    if (lv && this.localStream) {
                        lv.srcObject = this.localStream;
                        console.log('✅ تم ربط الفيديو المحلي');
                    }
                }, 500);
            }
            
            return true;
            
        } catch (e) {
            console.error('❌ خطأ في استقبال المكالمة:', e);
            this.sendSignal(callerId, { type: 'reject' });
            this.endCall();
            return false;
        }
    },
    
    // ==================== شاشة المكالمة الواردة ====================
    showIncomingCall(callerId, callData) {
        if (callData.type === 'datachannel') {
            console.log('📡 استلام طلب فتح Data Channel - لا حاجة لعرض شاشة');
            return;
        }
        
        console.log('🔔 عرض شاشة المكالمة الواردة...');
        this.currentCallId = callerId;
        
        const callType = callData.type === 'video' ? 'video' : 'audio';
        const appColor = '#2196F3';
        const acceptIcon = callType === 'video' ? 'fa-video' : 'fa-phone';
        
        const fetchUserName = async () => {
            try {
                const userDoc = await window.db.collection('users').doc(callerId).get();
                if (userDoc.exists) return userDoc.data().name || 'مستخدم';
            } catch (e) {}
            return 'مستخدم';
        };
        
        const fetchUserAvatar = async () => {
            try {
                const userDoc = await window.db.collection('users').doc(callerId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const emojiMap = { 'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧' };
                    return emojiMap[userData.avatarType] || '👤';
                }
            } catch (e) {}
            return '👤';
        };
        
        Promise.all([fetchUserName(), fetchUserAvatar()]).then(([contactName, contactAvatar]) => {
            const existingOverlay = document.getElementById('incomingCall');
            if (existingOverlay) existingOverlay.remove();
            
            const overlay = document.createElement('div');
            overlay.id = 'incomingCall';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: #0a0e27;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: white;
                font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
            `;
            
            overlay.innerHTML = `
                <style>
                    @keyframes float {
                        0%, 100% { transform: translateY(0px); }
                        50% { transform: translateY(-15px); }
                    }
                    @keyframes ring {
                        0% { transform: rotate(0deg); }
                        25% { transform: rotate(6deg); }
                        50% { transform: rotate(0deg); }
                        75% { transform: rotate(-6deg); }
                        100% { transform: rotate(0deg); }
                    }
                    .avatar-float {
                        animation: float 2.5s ease-in-out infinite;
                    }
                    .ring-animation {
                        animation: ring 1.2s ease-in-out infinite;
                        transform-origin: center;
                    }
                    .swipe-container {
                        width: 360px;
                        margin: 30px auto;
                        position: relative;
                    }
                    .swipe-button {
                        width: 100%;
                        height: 80px;
                        border-radius: 50px;
                        position: relative;
                        overflow: hidden;
                        cursor: grab;
                        user-select: none;
                        touch-action: none;
                        background: linear-gradient(90deg, #1a5a2a 0%, #1a5a2a 50%, #8b1a1a 50%, #8b1a1a 100%);
                        border: 2px solid ${appColor};
                        box-shadow: 0 8px 30px rgba(0,0,0,0.4);
                    }
                    .swipe-button:active {
                        cursor: grabbing;
                    }
                    .divider-line {
                        position: absolute;
                        top: 10px;
                        bottom: 10px;
                        left: 50%;
                        width: 2px;
                        background: ${appColor};
                        transform: translateX(-50%);
                        pointer-events: none;
                        z-index: 5;
                        border-radius: 2px;
                        box-shadow: 0 0 8px ${appColor};
                    }
                    .swipe-thumb {
                        position: absolute;
                        top: 8px;
                        width: 64px;
                        height: 64px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.8rem;
                        box-shadow: 0 8px 25px rgba(0,0,0,0.5);
                        transition: left 0.1s linear, right 0.1s linear;
                        cursor: grab;
                        z-index: 30;
                        backdrop-filter: blur(5px);
                        border: 2px solid ${appColor};
                    }
                    .swipe-thumb:active {
                        cursor: grabbing;
                        transform: scale(0.96);
                    }
                    .thumb-left {
                        left: 8px;
                        background: linear-gradient(145deg, #4CAF50, #1b5e2a);
                        color: white;
                    }
                    .thumb-right {
                        right: 8px;
                        left: auto;
                        background: linear-gradient(145deg, #f44336, #8b0000);
                        color: white;
                    }
                    .center-dot {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        width: 14px;
                        height: 14px;
                        background: ${appColor};
                        border-radius: 50%;
                        pointer-events: none;
                        z-index: 20;
                        box-shadow: 0 0 12px ${appColor};
                    }
                </style>
                
                <div style="text-align: center; margin-bottom: 50px;">
                    <div class="avatar-float ring-animation" style="font-size: 5.5rem; margin-bottom: 15px; filter: drop-shadow(0 10px 25px rgba(0,0,0,0.4));">${contactAvatar}</div>
                    <div style="font-size: 1.8rem; font-weight: bold; margin-bottom: 8px; letter-spacing: -0.5px;">${contactName}</div>
                </div>
                
                <div class="swipe-container">
                    <div id="swipeButton" class="swipe-button">
                        <div class="divider-line"></div>
                        <div class="center-dot"></div>
                        
                        <div id="leftThumb" class="swipe-thumb thumb-left">
                            <i class="fas ${acceptIcon}"></i>
                        </div>
                        <div id="rightThumb" class="swipe-thumb thumb-right">
                            <i class="fas fa-phone-slash"></i>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            
            const button = document.getElementById('swipeButton');
            const leftThumb = document.getElementById('leftThumb');
            const rightThumb = document.getElementById('rightThumb');
            
            let isDraggingLeft = false;
            let isDraggingRight = false;
            let leftStartX = 0;
            let rightStartX = 0;
            let leftCurrentPos = 8;
            let rightCurrentPos = 8;
            const buttonWidth = button.clientWidth;
            const centerPos = buttonWidth / 2;
            const maxLeftMove = centerPos - 40;
            const maxRightMove = centerPos - 40;
            
            const onLeftStart = (e) => {
                e.preventDefault();
                e.stopPropagation();
                isDraggingLeft = true;
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                const rect = leftThumb.getBoundingClientRect();
                leftStartX = clientX - (rect.left - button.getBoundingClientRect().left);
                leftThumb.style.transition = 'none';
            };
            
            const onLeftMove = (e) => {
                if (!isDraggingLeft) return;
                e.preventDefault();
                e.stopPropagation();
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                let newLeft = clientX - leftStartX - button.getBoundingClientRect().left;
                newLeft = Math.max(8, Math.min(newLeft, maxLeftMove));
                leftCurrentPos = newLeft;
                leftThumb.style.left = newLeft + 'px';
            };
            
            const onLeftEnd = () => {
                if (!isDraggingLeft) return;
                isDraggingLeft = false;
                leftThumb.style.transition = 'left 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
                
                if (leftCurrentPos >= maxLeftMove - 10) {
                    leftThumb.style.left = maxLeftMove + 'px';
                    setTimeout(() => {
                        overlay.remove();
                        this.receiveCall(callerId, callData);
                    }, 200);
                } else {
                    leftThumb.style.left = '8px';
                }
            };
            
            const onRightStart = (e) => {
                e.preventDefault();
                e.stopPropagation();
                isDraggingRight = true;
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                const rect = rightThumb.getBoundingClientRect();
                rightStartX = (rect.right - clientX);
                rightThumb.style.transition = 'none';
            };
            
            const onRightMove = (e) => {
                if (!isDraggingRight) return;
                e.preventDefault();
                e.stopPropagation();
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                const containerRect = button.getBoundingClientRect();
                let newRight = (containerRect.right - clientX) - rightStartX;
                newRight = Math.max(8, Math.min(newRight, maxRightMove));
                rightCurrentPos = newRight;
                rightThumb.style.right = newRight + 'px';
            };
            
            const onRightEnd = () => {
                if (!isDraggingRight) return;
                isDraggingRight = false;
                rightThumb.style.transition = 'right 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
                
                if (rightCurrentPos >= maxRightMove - 10) {
                    rightThumb.style.right = maxRightMove + 'px';
                    setTimeout(() => {
                        overlay.remove();
                        this.sendSignal(callerId, { type: 'reject' });
                    }, 200);
                } else {
                    rightThumb.style.right = '8px';
                }
            };
            
            leftThumb.addEventListener('mousedown', onLeftStart);
            leftThumb.addEventListener('touchstart', onLeftStart, { passive: false });
            rightThumb.addEventListener('mousedown', onRightStart);
            rightThumb.addEventListener('touchstart', onRightStart, { passive: false });
            
            document.addEventListener('mousemove', (e) => { onLeftMove(e); onRightMove(e); });
            document.addEventListener('mouseup', () => { onLeftEnd(); onRightEnd(); });
            document.addEventListener('touchmove', (e) => { onLeftMove(e); onRightMove(e); }, { passive: false });
            document.addEventListener('touchend', () => { onLeftEnd(); onRightEnd(); });
            
            setTimeout(() => {
                const stillThere = document.getElementById('incomingCall');
                if (stillThere) {
                    stillThere.remove();
                    this.sendSignal(callerId, { type: 'reject' });
                }
            }, 30000);
        });
    },
    
    // ==================== إعداد الصوت البعيد ====================
    setupRemoteAudio(stream) {
        console.log('🔊 إعداد الصوت عن بعد...');
        if (this.remoteAudioElement) {
            this.remoteAudioElement.pause();
            this.remoteAudioElement.srcObject = null;
        }
        
        this.remoteAudioElement = new Audio();
        this.remoteAudioElement.srcObject = stream;
        this.remoteAudioElement.autoplay = true;
        this.applySpeakerSettings();
        
        this.remoteAudioElement.play().then(() => {
            console.log('✅ بدء تشغيل الصوت عن بعد');
        }).catch(e => {
            console.log('❌ فشل تشغيل الصوت:', e);
        });
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
    
    // ==================== واجهة المستخدم ====================
    showCallUI(type) {
        document.body.classList.add('in-call');
        const existingUi = document.getElementById('callUI');
        if (existingUi) existingUi.remove();
        
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const contactAvatar = document.querySelector('#conversationAvatar')?.textContent || '👤';
        const appColor = '#2196F3';
        const bgColor = '#0a0e27';
        
        let uiHTML = '';
        if (type === 'video') {
            uiHTML = `
                <style>
                    @keyframes pulse {
                        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4); }
                        70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(244, 67, 54, 0); }
                        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244, 67, 54, 0); }
                    }
                    .call-btn {
                        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                        backdrop-filter: blur(10px);
                        background: rgba(30, 30, 40, 0.85) !important;
                        border: 1px solid rgba(255,255,255,0.15) !important;
                    }
                    .call-btn:active {
                        transform: scale(1.1);
                        background: rgba(50, 50, 60, 0.95) !important;
                    }
                    .end-call-btn {
                        background: linear-gradient(135deg, #f44336, #d32f2f) !important;
                        animation: pulse 1.5s infinite;
                    }
                    .end-call-btn:active {
                        transform: scale(1.1);
                        background: linear-gradient(135deg, #ff6659, #e53935) !important;
                    }
                    .local-video {
                        border: 3px solid rgba(255,255,255,0.3);
                        transition: all 0.3s ease;
                        box-shadow: 0 5px 20px rgba(0,0,0,0.3);
                    }
                </style>
                <video id="remoteVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;position:fixed;top:0;left:0;z-index:9998;background:${bgColor};"></video>
                <video id="localVideo" autoplay playsinline muted class="local-video" style="width:120px;height:170px;object-fit:cover;position:fixed;bottom:100px;right:20px;z-index:9999;border-radius:16px;cursor:pointer;"></video>
                <div style="position:fixed;bottom:40px;left:0;right:0;z-index:9999;display:flex;justify-content:center;gap:25px;flex-wrap:wrap;padding:0 20px;">
                    <button id="switchCameraBtn" class="call-btn" style="width:60px;height:60px;border-radius:50%;border:none;font-size:1.5rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.2);color:${appColor};" title="تبديل الكاميرا">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button id="muteAudioBtn" class="call-btn" style="width:60px;height:60px;border-radius:50%;border:none;font-size:1.5rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.2);color:${appColor};" title="كتم الميكروفون">
                        <i class="fas fa-microphone"></i>
                    </button>
                    <button id="endCallBtn" class="end-call-btn" style="width:75px;height:75px;border-radius:50%;border:none;font-size:2rem;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);color:white;" title="إنهاء المكالمة">
                        <i class="fas fa-phone-slash"></i>
                    </button>
                    <button id="muteVideoBtn" class="call-btn" style="width:60px;height:60px;border-radius:50%;border:none;font-size:1.5rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.2);color:${appColor};" title="إيقاف الكاميرا">
                        <i class="fas fa-video"></i>
                    </button>
                </div>`;
        } else {
            uiHTML = `
                <style>
                    @keyframes pulse {
                        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4); }
                        70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(244, 67, 54, 0); }
                        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244, 67, 54, 0); }
                    }
                    .call-btn {
                        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                        backdrop-filter: blur(10px);
                        background: rgba(30, 30, 40, 0.85) !important;
                        border: 1px solid rgba(255,255,255,0.15) !important;
                    }
                    .call-btn:active {
                        transform: scale(1.1);
                        background: rgba(50, 50, 60, 0.95) !important;
                    }
                    .end-call-btn {
                        background: linear-gradient(135deg, #f44336, #d32f2f) !important;
                        animation: pulse 1.5s infinite;
                    }
                    .end-call-btn:active {
                        transform: scale(1.1);
                        background: linear-gradient(135deg, #ff6659, #e53935) !important;
                    }
                    .avatar-animation {
                        animation: float 3s ease-in-out infinite;
                    }
                    @keyframes float {
                        0% { transform: translateY(0px); }
                        50% { transform: translateY(-10px); }
                        100% { transform: translateY(0px); }
                    }
                </style>
                <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg, #1a1a2e, #16213e);z-index:9997;"></div>
                <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;text-align:center;">
                    <div class="avatar-animation" style="font-size:6rem;margin-bottom:15px;filter:drop-shadow(0 10px 20px rgba(0,0,0,0.3));">${contactAvatar}</div>
                    <div style="font-size:1.8rem;color:white;font-weight:bold;margin-bottom:5px;text-shadow:0 2px 10px rgba(0,0,0,0.3);">${contactName}</div>
                    <div style="margin-top:8px;color:#4CAF50;font-size:0.9rem;background:rgba(76,175,80,0.2);padding:5px 15px;border-radius:20px;display:inline-block;">
                        <i class="fas fa-phone-alt" style="margin-left:5px;"></i> <span id="callTimer">00:00</span>
                    </div>
                </div>
                <div style="position:fixed;bottom:40px;left:0;right:0;z-index:9999;display:flex;justify-content:center;gap:30px;flex-wrap:wrap;padding:0 20px;">
                    <button id="speakerBtn" class="call-btn" style="width:65px;height:65px;border-radius:50%;border:none;font-size:1.6rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.2);color:${appColor};" title="تبديل السماعة">
                        <i class="fas fa-volume-up"></i>
                    </button>
                    <button id="endCallBtn" class="end-call-btn" style="width:80px;height:80px;border-radius:50%;border:none;font-size:2.2rem;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);color:white;" title="إنهاء المكالمة">
                        <i class="fas fa-phone-slash"></i>
                    </button>
                    <button id="muteBtn" class="call-btn" style="width:65px;height:65px;border-radius:50%;border:none;font-size:1.6rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.2);color:${appColor};" title="كتم الميكروفون">
                        <i class="fas fa-microphone"></i>
                    </button>
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
            
            const muteAudioBtn = document.getElementById('muteAudioBtn');
            muteAudioBtn?.addEventListener('click', () => {
                this.toggleAudio();
                const icon = muteAudioBtn.querySelector('i');
                if (icon) {
                    icon.className = this.isAudioMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                    muteAudioBtn.style.color = this.isAudioMuted ? '#f44336' : appColor;
                }
            });
            
            const muteVideoBtn = document.getElementById('muteVideoBtn');
            muteVideoBtn?.addEventListener('click', () => {
                this.toggleVideo();
                const icon = muteVideoBtn.querySelector('i');
                if (icon) {
                    icon.className = this.isVideoMuted ? 'fas fa-video-slash' : 'fas fa-video';
                    muteVideoBtn.style.color = this.isVideoMuted ? '#f44336' : appColor;
                }
            });
            
            if (this.isVideoMuted) {
                const muteVideoBtn = document.getElementById('muteVideoBtn');
                if (muteVideoBtn) {
                    const icon = muteVideoBtn.querySelector('i');
                    if (icon) icon.className = 'fas fa-video-slash';
                    muteVideoBtn.style.color = '#f44336';
                }
            }
        } else {
            const speakerBtn = document.getElementById('speakerBtn');
            speakerBtn?.addEventListener('click', () => {
                this.toggleSpeaker();
                const icon = speakerBtn.querySelector('i');
                if (icon) {
                    icon.className = this.isSpeakerEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
                }
            });
            
            const muteBtn = document.getElementById('muteBtn');
            muteBtn?.addEventListener('click', () => {
                this.toggleMute();
                const icon = muteBtn.querySelector('i');
                if (icon) {
                    icon.className = this.isAudioMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                    muteBtn.style.color = this.isAudioMuted ? '#f44336' : appColor;
                }
            });
            
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
    
    // ==================== التحكم بالمكالمة ====================
    toggleMute() {
        this.isAudioMuted = !this.isAudioMuted;
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) audioTrack.enabled = !this.isAudioMuted;
        }
    },
    
    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isAudioMuted = !audioTrack.enabled;
            }
        }
    },
    
    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isVideoMuted = !videoTrack.enabled;
            }
        }
    },
    
    toggleSpeaker() {
        this.isSpeakerEnabled = !this.isSpeakerEnabled;
        this.applySpeakerSettings();
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
    
    // ==================== إرسال الإشارات ====================
    async sendSignal(calleeId, data) {
        if (!ChatSystem.friendInConversation || !ChatSystem.featuresEnabled) {
            return;
        }
        
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, {
                id: Date.now().toString(),
                type: data.type === 'call_offer' ? 'call_offer' : 
                       data.type === 'call_answer' ? 'call_answer' : 
                       data.type === 'call_ice' ? 'call_ice' : 'webrtc',
                data: encrypted,
                timestamp: Date.now()
            });
            console.log('📡 تم إرسال إشارة مكالمة عبر Firebase');
        } catch (error) {
            console.error('❌ فشل إرسال إشارة المكالمة:', error);
        }
    },
    
    // ==================== إنهاء المكالمة ====================
    endCall() {
        console.log('📞 إنهاء المكالمة وتنظيف الحالة...');
        
        if (this.currentCallId && ChatSystem.currentChat) {
            this.sendSignal(ChatSystem.currentChat, { type: 'call_ended' });
        }
        
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        
        if (this.remoteAudioElement) {
            this.remoteAudioElement.pause();
            this.remoteAudioElement.srcObject = null;
            this.remoteAudioElement = null;
        }
        
        if (this.localStream) {
            try {
                this.localStream.getTracks().forEach(t => t.stop());
            } catch(e) {}
            this.localStream = null;
        }
        
        if (this.pc) {
            try { this.pc.close(); } catch(e) {}
            this.pc = null;
        }
        
        const ui = document.getElementById('callUI');
        if (ui) ui.remove();
        const inc = document.getElementById('incomingCall');
        if (inc) inc.remove();
        document.body.classList.remove('in-call');
        
        if (this.currentCallId) {
            this.deleteCallSignals(this.currentCallId);
        }
        
        this.isInCall = false;
        this.callType = null;
        this.currentCallId = null;
        this.isAudioMuted = false;
        this.isVideoMuted = false;
        this.isSpeakerEnabled = false;
        
        if (window.auth?.currentUser) {
            window.db.collection('users').doc(window.auth.currentUser.uid).update({
                inCall: false,
                callType: null,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }
        
        console.log('✅ تم إنهاء المكالمة وتنظيف جميع الحالات بنجاح');
    },
    
    // ==================== معالجة الإشارات الواردة ====================
    async handleIncomingSignal(callerId, signalData) {
        if (signalData.type === 'call_ended') {
            console.log('📞 الطرف الآخر أنهى المكالمة');
            this.endCall();
            return;
        }
        
        if (signalData.type === 'reject') {
            console.log('📞 الطرف الآخر رفض المكالمة');
            const inc = document.getElementById('incomingCall');
            if (inc) inc.remove();
            this.endCall();
            return;
        }
        
        if (signalData.type === 'call_offer' && !this.isInCall) {
            this.showIncomingCall(callerId, signalData);
            return;
        }
        
        if (!this.pc) {
            if (!this.isInCall) return;
            this.pc = new RTCPeerConnection(this.servers);
            this.pc.ontrack = e => {
                if (e.track.kind === 'audio') this.setupRemoteAudio(e.streams[0]);
                if (e.track.kind === 'video') {
                    const rv = document.getElementById('remoteVideo');
                    if (rv) rv.srcObject = e.streams[0];
                }
            };
            this.pc.onicecandidate = e => {
                if (e.candidate && this.currentCallId) {
                    this.sendSignal(this.currentCallId, { candidate: e.candidate, type: 'call_ice' });
                }
            };
        }
        
        try {
            if (signalData.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
                if (signalData.sdp.type === 'offer') {
                    const answer = await this.pc.createAnswer();
                    await this.pc.setLocalDescription(answer);
                    await this.sendSignal(callerId, { sdp: this.pc.localDescription, type: 'call_answer' });
                }
            } else if (signalData.candidate) {
                if (this.pc && signalData.candidate) {
                    await this.pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
                }
            }
        } catch (e) {
            console.warn('⚠️ خطأ في معالجة إشارة المكالمة:', e);
        }
    }
};

// ==================== الدوال العامة ====================
window.startAudioCall = async () => {
    if (!ChatSystem.currentChat) {
        alert('الرجاء اختيار محادثة أولاً');
        return;
    }
    if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
        alert('الميزات غير مفعلة أو الطرف الآخر ليس في المحادثة');
        return;
    }
    await VoiceVideoSystem.startAudioCall(ChatSystem.currentChat);
};

window.startVideoCall = async () => {
    if (!ChatSystem.currentChat) {
        alert('الرجاء اختيار محادثة أولاً');
        return;
    }
    if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
        alert('الميزات غير مفعلة أو الطرف الآخر ليس في المحادثة');
        return;
    }
    await VoiceVideoSystem.startVideoCall(ChatSystem.currentChat);
};

window.endCurrentCall = () => {
    VoiceVideoSystem.endCall();
};

// التنظيف التلقائي عند تحميل الصفحة
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            VoiceVideoSystem.deleteCallSignals(window.auth?.currentUser?.uid);
            if (VoiceVideoSystem.isInCall) VoiceVideoSystem.endCall();
        }, 1500);
    });
}

window.addEventListener('beforeunload', () => {
    if (VoiceVideoSystem.isInCall) VoiceVideoSystem.endCall();
});

console.log('✅ VoiceVideoSystem جاهز - نظام مكالمات مستقل');
