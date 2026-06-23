// ========== webrtc-call.js - النسخة المعدلة (واجهات ثابتة) ==========
// جميع ميزات الصوت + مكالمات الفيديو + إرسال الملفات

const CallSystem = {
    pc: null, dc: null,           // ✅ خاصة بالميزات (دردشة، ملفات، موقع)
    pcCall: null, dcCall: null,   // ✅ خاصة بالمكالمات (صوت، فيديو)
    localStream: null, isInCall: false, callType: null, currentCallId: null,
    incomingChunks: {}, incomingFileInfo: {},
    callTimerInterval: null, keepAliveInterval: null, keepAliveIntervalCall: null,
    isAudioMuted: false, isVideoMuted: false, isSpeakerEnabled: false,
    remoteAudioElement: null,
    _incomingCallTimeout: null,
    servers: { 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ] 
    },
    
    // ==================== 3. Data Channel فقط ====================
    
async ensureDataChannelOnly(calleeId) {
    if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
        console.log('🚫 منع فتح Data Channel - الميزات غير مفعلة');
        return false;
    }
    
    if (!calleeId) return false;
    
    if (this.dc && this.dc.readyState === 'open') {
        console.log('✅ Data Channel موجود ومفتوح');
        return true;
    }
    
    if (this.dc && this.dc.readyState === 'connecting') {
        console.log('⏳ Data Channel في طور الاتصال...');
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 10000);
            const check = setInterval(() => {
                if (this.dc && this.dc.readyState === 'open') {
                    clearInterval(check);
                    clearTimeout(timeout);
                    resolve(true);
                } else if (this.dc && (this.dc.readyState === 'failed' || this.dc.readyState === 'closed')) {
                    clearInterval(check);
                    clearTimeout(timeout);
                    this.createDataChannelOnly(calleeId).then(resolve);
                }
            }, 500);
        });
    }
    
    return this.createDataChannelOnly(calleeId);
},

async createDataChannelOnly(calleeId) {
    if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
        console.log('🚫 منع إنشاء Data Channel - الميزات غير مفعلة');
        return false;
    }
    
    if (this.dc && this.dc.readyState === 'open') {
        console.log('✅ Data Channel موجود ومفتوح، لا حاجة لإعادة الإنشاء');
        return true;
    }
    
    if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed')) {
        try { this.pc.close(); } catch(e) {}
        this.pc = null;
    }
    if (this.dc && (this.dc.readyState === 'failed' || this.dc.readyState === 'closed')) {
        try { this.dc.close(); } catch(e) {}
        this.dc = null;
    }
    
    if (this.pc && (this.pc.connectionState === 'connecting' || this.pc.connectionState === 'new')) {
        console.log('⏳ PeerConnection قيد الاتصال بالفعل، انتظر...');
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 10000);
            const check = setInterval(() => {
                if (this.dc && this.dc.readyState === 'open') {
                    clearInterval(check);
                    clearTimeout(timeout);
                    resolve(true);
                } else if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed')) {
                    clearInterval(check);
                    clearTimeout(timeout);
                    this.createDataChannelOnly(calleeId).then(resolve);
                }
            }, 500);
        });
    }
    
    try {
        console.log('🔧 إنشاء Data Channel فقط (بدون مكالمة)...');
        
        this.pc = new RTCPeerConnection(this.servers);
        this.dc = this.pc.createDataChannel('chat', { ordered: true, maxRetransmits: 3 });
        this.setupDataChannel(this.dc);
        
        this.pc.onicecandidate = e => { 
            if (e.candidate) {
                console.log('📡 إرسال ICE candidate');
                this.sendSignal(calleeId, { candidate: e.candidate }).catch(() => {});
            }
        };
        
        this.pc.ondatachannel = e => { 
            console.log('📡 استقبال Data Channel من الطرف الآخر');
            this.setupDataChannel(e.channel); 
            this.dc = e.channel; 
        };
        
        const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
        await this.pc.setLocalDescription(offer);
        await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: 'datachannel' });
        
        console.log('✅ تم إرسال Offer لفتح Data Channel');
        return true;
    } catch (error) {
        console.error('❌ فشل إنشاء Data Channel:', error);
        return false;
    }
},
    
    // ==================== 4. المكالمة الصوتية ====================

    async startAudioCall(calleeId) {
        if (!ChatSystem.friendInConversation) {
            console.log('❌ لا يمكن بدء المكالمة: الطرف الآخر ليس في المحادثة');
            return;
        }
        
        if (!window.auth?.currentUser) {
            console.log('❌ لا يمكن بدء المكالمة: لا يوجد مستخدم');
            return;
        }
        if (this.isInCall) {
            console.log('❌ لا يمكن بدء المكالمة: مكالمة نشطة بالفعل');
            return;
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
                return;
            }
            console.log('✅ تم الحصول على الميكروفون');
            
            this.pcCall = new RTCPeerConnection(this.servers);
            
            this.localStream.getTracks().forEach(track => {
                this.pcCall.addTrack(track, this.localStream);
                console.log(`➕ تم إضافة مسار ${track.kind}`);
            });
            
            this.dcCall = this.pcCall.createDataChannel('chat');
            this.setupDataChannel(this.dcCall);
            
            this._callIceCandidates = [];
            this._callBatchTimer = null;
            
            this.pcCall.onicecandidate = e => { 
                if (e.candidate) {
                    console.log('📡 تجميع ICE candidate للمكالمة');
                    this._callIceCandidates.push(e.candidate);
                }
            };
            
            this.pcCall.ontrack = e => {
                console.log(`📞 استقبال مسار ${e.track.kind}`);
                if (e.track.kind === 'audio') {
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pcCall.onconnectionstatechange = () => {
                console.log(`🔄 حالة الاتصال: ${this.pcCall?.connectionState}`);
                if (this.pcCall && (this.pcCall.connectionState === 'failed' || this.pcCall.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            console.log('📞 إنشاء عرض مكالمة صوتية...');
            const offer = await this.pcCall.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await this.pcCall.setLocalDescription(offer);
            
            await new Promise(resolve => {
                if (this._callBatchTimer) clearTimeout(this._callBatchTimer);
                this._callBatchTimer = setTimeout(() => {
                    console.log(`📦 انتهاء تجميع المكالمة (5 ثواني) - تم تجميع ${this._callIceCandidates.length} ICE candidate`);
                    resolve();
                }, 5000);
            });
            
            await this.sendSignal(calleeId, { 
                sdp: this.pcCall.localDescription, 
                type: 'audio',
                iceCandidates: this._callIceCandidates.map(c => ({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }))
            });
            
            this._callIceCandidates = [];
            this._callBatchTimer = null;
            
            console.log('✅ تم إرسال العرض مع ICE candidates المجمعة');
            
        } catch (e) { 
            console.error('❌ خطأ في بدء المكالمة الصوتية:', e);
            this.endCall(); 
        }
    },

// ==================== 5. المكالمة المرئية ====================

    async startVideoCall(calleeId) {
        if (!ChatSystem.friendInConversation) {
            console.log('❌ لا يمكن بدء المكالمة: الطرف الآخر ليس في المحادثة');
            return;
        }
        
        if (!window.auth?.currentUser) {
            console.log('❌ لا يمكن بدء المكالمة: لا يوجد مستخدم');
            return;
        }
        if (this.isInCall) {
            console.log('❌ لا يمكن بدء المكالمة: مكالمة نشطة بالفعل');
            return;
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
                return;
            }
            
            this.showCallUI('video');
            
            this.pcCall = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pcCall.addTrack(track, this.localStream));
            
            this.dcCall = this.pcCall.createDataChannel('chat');
            this.setupDataChannel(this.dcCall);
            
            this._callIceCandidates = [];
            this._callBatchTimer = null;
            
            this.pcCall.onicecandidate = e => { 
                if (e.candidate) {
                    console.log('📡 تجميع ICE candidate للمكالمة');
                    this._callIceCandidates.push(e.candidate);
                }
            };
            
            this.pcCall.ontrack = e => {
                const rv = document.getElementById('remoteVideo');
                if (rv && e.streams[0]) rv.srcObject = e.streams[0];
            };
            this.pcCall.onconnectionstatechange = () => {
                if (this.pcCall && (this.pcCall.connectionState === 'failed' || this.pcCall.connectionState === 'disconnected')) this.endCall();
            };
            
            const offer = await this.pcCall.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await this.pcCall.setLocalDescription(offer);
            
            await new Promise(resolve => {
                if (this._callBatchTimer) clearTimeout(this._callBatchTimer);
                this._callBatchTimer = setTimeout(() => {
                    console.log(`📦 انتهاء تجميع المكالمة (5 ثواني) - تم تجميع ${this._callIceCandidates.length} ICE candidate`);
                    resolve();
                }, 5000);
            });
            
            await this.sendSignal(calleeId, { 
                sdp: this.pcCall.localDescription, 
                type: 'video',
                iceCandidates: this._callIceCandidates.map(c => ({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }))
            });
            
            this._callIceCandidates = [];
            this._callBatchTimer = null;
            
            console.log('✅ تم إرسال العرض مع ICE candidates المجمعة');
            
        } catch (e) { 
            this.endCall(); 
        }
    },

    
    // ==================== 6. إعداد الصوت عن بعد ====================
    
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
                this.remoteAudioElement.setSinkId('speaker').then(() => {
                    console.log('✅ تم التبديل إلى السماعة الخارجية');
                }).catch(e => console.log('❌ فشل التبديل إلى السماعة:', e));
            } else {
                this.remoteAudioElement.setSinkId('default').then(() => {
                    console.log('✅ تم التبديل إلى السماعة الداخلية');
                }).catch(e => console.log('❌ فشل التبديل:', e));
            }
        }
    },


    // ==================== 7. استقبال المكالمات ====================

    async receiveCall(callerId, callData) {
        if (this.isInCall) {
            console.log('❌ مكالمة نشطة بالفعل');
            this.sendSignal(callerId, { type: 'reject' });
            return;
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
                return;
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
            
            this.pcCall = new RTCPeerConnection(this.servers);
            
            this.localStream.getTracks().forEach(track => {
                this.pcCall.addTrack(track, this.localStream);
                console.log(`➕ تم إضافة مسار ${track.kind}`);
            });
            
            this._answerIceCandidates = [];
            this._answerBatchTimer = null;
            
            this.pcCall.onicecandidate = e => { 
                if (e.candidate) {
                    console.log('📡 تجميع ICE candidate للإجابة');
                    this._answerIceCandidates.push(e.candidate);
                }
            };
            
            this.pcCall.ontrack = e => {
                console.log('📞 استقبال مسار:', e.track.kind);
                
                if (e.track.kind === 'video') {
                    console.log('✅ تم استقبال فيديو بعيد');
                    const rv = document.getElementById('remoteVideo');
                    if (rv) {
                        rv.srcObject = e.streams[0];
                        rv.play().catch(err => console.log('خطأ في تشغيل الفيديو البعيد:', err));
                        console.log('✅ تم ربط الفيديو البعيد');
                    } else {
                        console.log('⚠️ عنصر remoteVideo غير موجود');
                        setTimeout(() => {
                            const rv2 = document.getElementById('remoteVideo');
                            if (rv2) {
                                rv2.srcObject = e.streams[0];
                                console.log('✅ تم ربط الفيديو البعيد (بعد التأخير)');
                            }
                        }, 500);
                    }
                } else if (e.track.kind === 'audio') {
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pcCall.ondatachannel = e => {
                console.log('📡 استقبال Data Channel');
                this.setupDataChannel(e.channel);
                this.dcCall = e.channel;
            };
            
            this.pcCall.onconnectionstatechange = () => {
                console.log(`🔄 حالة الاتصال: ${this.pcCall?.connectionState}`);
                if (this.pcCall && (this.pcCall.connectionState === 'failed' || this.pcCall.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            if (callData.sdp) {
                await this.pcCall.setRemoteDescription(new RTCSessionDescription(callData.sdp));
                const answerOptions = { offerToReceiveAudio: true, offerToReceiveVideo: this.callType === 'video' };
                const answer = await this.pcCall.createAnswer(answerOptions);
                await this.pcCall.setLocalDescription(answer);
                
                await new Promise(resolve => {
                    if (this._answerBatchTimer) clearTimeout(this._answerBatchTimer);
                    this._answerBatchTimer = setTimeout(() => {
                        console.log(`📦 انتهاء تجميع الإجابة (5 ثواني) - تم تجميع ${this._answerIceCandidates.length} ICE candidate`);
                        resolve();
                    }, 5000);
                });
                
                await this.sendSignal(callerId, { 
                    sdp: this.pcCall.localDescription,
                    iceCandidates: this._answerIceCandidates.map(c => ({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }))
                });
                
                this._answerIceCandidates = [];
                this._answerBatchTimer = null;
                
                console.log('✅ تم إرسال الرد مع ICE candidates المجمعة');
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
            
        } catch (e) { 
            console.error('❌ خطأ في استقبال المكالمة:', e);
            this.sendSignal(callerId, { type: 'reject' });
            this.endCall(); 
        }
    },
    
    
    // ========== 8. شاشة المكالمة الواردة (معدلة - تستخدم عناصر ثابتة) ==========

    showIncomingCall(callerId, callData) {
        if (callData.type === 'datachannel') {
            console.log('📡 استلام طلب فتح Data Channel - لا حاجة لعرض شاشة');
            this.handleSignaling(callData);
            return;
        }
        
        console.log('🔔 عرض شاشة المكالمة الواردة...');
        this.currentCallId = callerId;
        
        const overlay = document.getElementById('incomingCall');
        const avatar = document.getElementById('incomingCallAvatar');
        const name = document.getElementById('incomingCallName');
        const leftThumb = document.getElementById('leftThumb');
        const rightThumb = document.getElementById('rightThumb');
        const swipeButton = document.getElementById('swipeButton');
        
        // تحديث أيقونة القبول حسب نوع المكالمة
        const callType = callData.type === 'video' ? 'video' : 'audio';
        const acceptIcon = callType === 'video' ? 'fa-video' : 'fa-phone';
        leftThumb.innerHTML = `<i class="fas ${acceptIcon}"></i>`;
        
        // جلب اسم المستخدم
        const fetchUserName = async () => {
            try {
                const userDoc = await window.db.collection('users').doc(callerId).get();
                if (userDoc.exists) {
                    return userDoc.data().name || 'مستخدم';
                }
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
            name.textContent = contactName;
            avatar.textContent = contactAvatar;
            
            // إظهار الشاشة
            overlay.style.display = 'flex';
            
            // إعداد السحب
            this.setupIncomingCallSwipe(callerId, callData);
        });
        
        // مؤقت 30 ثانية
        if (this._incomingCallTimeout) clearTimeout(this._incomingCallTimeout);
        this._incomingCallTimeout = setTimeout(() => {
            overlay.style.display = 'none';
            this.sendSignal(callerId, { type: 'reject' });
        }, 30000);
    },
    
    setupIncomingCallSwipe(callerId, callData) {
        const overlay = document.getElementById('incomingCall');
        const leftThumb = document.getElementById('leftThumb');
        const rightThumb = document.getElementById('rightThumb');
        const button = document.getElementById('swipeButton');
        
        if (!button || !leftThumb || !rightThumb) return;
        
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
                    overlay.style.display = 'none';
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
                    overlay.style.display = 'none';
                    this.sendSignal(callerId, { type: 'reject' });
                }, 200);
            } else {
                rightThumb.style.right = '8px';
            }
        };
        
        // إزالة المستمعات القديمة
        leftThumb._cleanup && leftThumb._cleanup();
        rightThumb._cleanup && rightThumb._cleanup();
        
        leftThumb.addEventListener('mousedown', onLeftStart);
        leftThumb.addEventListener('touchstart', onLeftStart, { passive: false });
        
        rightThumb.addEventListener('mousedown', onRightStart);
        rightThumb.addEventListener('touchstart', onRightStart, { passive: false });
        
        const moveHandler = (e) => {
            onLeftMove(e);
            onRightMove(e);
        };
        const endHandler = () => {
            onLeftEnd();
            onRightEnd();
        };
        
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', endHandler);
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', endHandler);
        
        // حفظ دالة التنظيف
        leftThumb._cleanup = () => { document.removeEventListener('mousemove', moveHandler); document.removeEventListener('mouseup', endHandler); document.removeEventListener('touchmove', moveHandler); document.removeEventListener('touchend', endHandler); };
        rightThumb._cleanup = leftThumb._cleanup;
    },

    // ==================== 9. Data Channel وإدارة الاتصال ====================

setupDataChannel(channel) {
    if (!channel) return;
    console.log('📡 إعداد Data Channel');
    
    channel.onmessage = e => {
        try {
            const msg = JSON.parse(e.data);
            
            if (msg.type === 'direct_text') {
                console.log('📨 استلام رسالة نصية مباشرة:', msg.text);
                const displayMsg = { 
                    id: msg.id, 
                    type: 'text', 
                    text: msg.text, 
                    sender: 'friend', 
                    time: msg.time || new Date().toISOString() 
                };
                if (ChatSystem.currentChat) {
                    ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg);
                    ChatSystem.displayMessage(displayMsg);
                }
                return;
            }
            
            if (msg.type === 'webrtc_signal') {
                console.log('📡 استلام إشارة WebRTC مباشرة:', msg.data);
                if (msg.data.sdp && msg.data.sdp.type === 'offer') {
                    this.showIncomingCall(ChatSystem.currentChat, msg.data);
                } else {
                    this.handleSignaling(msg.data);
                }
                return;
            }
            
            if (msg.type === 'force_close_conversation') {
                console.log('👢 استلام إشارة طرد مباشرة من الطرف الآخر');
                if (ChatSystem.currentChat) {
                    console.log('🚪 تم طردك من المحادثة');
                    ChatSystem.closeChat();
                    ChatSystem.featuresEnabled = false;
                    ChatSystem.featureRequestPending = false;
                    ChatSystem.featureRequestReceived = false;
                    
                    const toggleInput = document.getElementById('featureToggleInput');
                    if (toggleInput) toggleInput.checked = false;
                    
                    const kickBtn = document.getElementById('kickBtn');
                    if (kickBtn) {
                        kickBtn.classList.remove('active');
                        kickBtn.style.opacity = '0.5';
                        kickBtn.style.pointerEvents = 'none';
                    }
                }
                return;
            }
            
            if (msg.type === 'force_disable_features') {
                console.log('🔴 استلام إشارة إلغاء الميزات مباشرة من الطرف الآخر');
                if (ChatSystem.currentChat) {
                    console.log('⚠️ تم إلغاء الميزات بناءً على طلب الطرف الآخر');
                    ChatSystem.featuresEnabled = false;
                    ChatSystem.featureRequestPending = false;
                    ChatSystem.featureRequestReceived = false;
                    
                    const toggleInput = document.getElementById('featureToggleInput');
                    if (toggleInput) toggleInput.checked = false;
                    
                    const kickBtn = document.getElementById('kickBtn');
                    if (kickBtn) {
                        kickBtn.classList.remove('active');
                        kickBtn.style.opacity = '0.5';
                        kickBtn.style.pointerEvents = 'none';
                    }
                    
                    ChatSystem.updateAllButtons();
                }
                return;
            }
            
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
                ChatSystem.displayMessage(displayMsg);
            }
        } catch (error) {
            console.error('خطأ في معالجة الرسالة:', error);
        }
    };
    
    channel.onopen = () => {
        console.log('✅ Data Channel مفتوح');
        this.sendCallStatus('connected');
        
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        this.keepAliveInterval = setInterval(() => {
            if (this.dc && this.dc.readyState === 'open') {
                this.dc.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            }
        }, 2000);
        
        if (channel === this.dcCall) {
            if (this.keepAliveIntervalCall) clearInterval(this.keepAliveIntervalCall);
            this.keepAliveIntervalCall = setInterval(() => {
                if (this.dcCall && this.dcCall.readyState === 'open') {
                    this.dcCall.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
                }
            }, 2000);
        }
    };
    
    channel.onclose = () => {
        console.log('❌ Data Channel مغلق');
        this.sendCallStatus('disconnected');
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        
        if (this.keepAliveIntervalCall) {
            clearInterval(this.keepAliveIntervalCall);
            this.keepAliveIntervalCall = null;
        }
        
        if (channel === this.dc && ChatSystem.currentChat && ChatSystem.featuresEnabled) {
            console.log('🔌 انقطاع قناة الميزات - إلغاء تفعيل الميزات');
            ChatSystem.featuresEnabled = false;
            ChatSystem.featureRequestPending = false;
            ChatSystem.featureRequestReceived = false;
            
            if (ChatSystem.featureBlinkInterval) {
                clearInterval(ChatSystem.featureBlinkInterval);
                ChatSystem.featureBlinkInterval = null;
            }
            
            ChatSystem.updateAllButtons();
        }
    };
    
    channel.onerror = (e) => {
        console.error('❌ خطأ في Data Channel:', e);
        
        if (channel === this.dc && ChatSystem.currentChat && ChatSystem.featuresEnabled) {
            console.log('⚠️ خطأ في قناة الميزات - إلغاء تفعيل الميزات');
            ChatSystem.featuresEnabled = false;
            ChatSystem.featureRequestPending = false;
            ChatSystem.featureRequestReceived = false;
            
            if (ChatSystem.featureBlinkInterval) {
                clearInterval(ChatSystem.featureBlinkInterval);
                ChatSystem.featureBlinkInterval = null;
            }
            
            ChatSystem.updateAllButtons();
        }
    };
},

// ==================== 9.2 معالجة حالة المكالمة ====================

handleCallStatus(msg) {
    if (msg.status === 'connected') {
        console.log('📞 الطرف الآخر متصل');
    } else if (msg.status === 'disconnected') {
        console.log('📞 الطرف الآخر قطع الاتصال');
        if (this.isInCall) {
            this.endCall();
        }
    }
},

// ==================== 9.3 إرسال حالة المكالمة ====================

sendCallStatus(status) {
    if (this.dc && this.dc.readyState === 'open') {
        this.dc.send(JSON.stringify({ type: 'call_status', status: status, timestamp: Date.now() }));
    }
},

// ==================== 9.4 معالجة إشارات WebRTC ====================

async handleSignaling(data) {
    try {
        if (data.type === 'reject') {
            console.log('📞 الطرف الآخر رفض المكالمة');
            document.getElementById('incomingCall').style.display = 'none';
            this.endCall();
            return;
        }
        
        if (data.type === 'call_ended') {
            console.log('📞 المتصل أنهى المكالمة قبل الرد');
            document.getElementById('incomingCall').style.display = 'none';
            this.endCall();
            return;
        }
        
        if (!this.pcCall) {
            this.pcCall = new RTCPeerConnection(this.servers);
            this.pcCall.ondatachannel = e => { 
                this.dcCall = e.channel; 
                this.setupDataChannel(this.dcCall); 
            };
            this.pcCall.onicecandidate = e => { 
                if (e.candidate) this.sendSignal(ChatSystem.currentChat, { candidate: e.candidate }).catch(() => {}); 
            };
        }
        
        if (data.sdp) {
            await this.pcCall.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === 'offer') {
                const answer = await this.pcCall.createAnswer();
                await this.pcCall.setLocalDescription(answer);
                await this.sendSignal(ChatSystem.currentChat, { sdp: this.pcCall.localDescription });
            }
        } 
        else if (data.iceCandidates && data.iceCandidates.length > 0) {
            console.log(`📦 استلام ${data.iceCandidates.length} ICE candidate مجمعة`);
            for (const ice of data.iceCandidates) {
                try {
                    await this.pcCall.addIceCandidate(new RTCIceCandidate(ice));
                } catch(e) {
                    console.warn('فشل إضافة ICE candidate مجمع:', e);
                }
            }
        }
        else if (data.candidate) {
            if (this.pcCall && data.candidate) {
                await this.pcCall.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log('📡 تم إضافة ICE candidate منفرد');
            }
        }
    } catch (e) {
        console.warn('Signaling error:', e);
    }
},

// ==================== 9.5 إرسال الإشارات ====================

async sendSignal(calleeId, data) {
    if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
        console.log('📡 تجاهل إرسال إشارة WebRTC - الميزات غير مفعلة');
        return;
    }
    
    const isCallSignal = (data.type === 'audio' || data.type === 'video') || 
                         (data.sdp && (data.sdp.type === 'offer' || data.sdp.type === 'answer'));
    
    if (isCallSignal) {
        if (this.dc && this.dc.readyState === 'open') {
            try {
                this.dc.send(JSON.stringify({ type: 'webrtc_signal', data: data }));
                console.log('📡 تم إرسال إشارة المكالمة مباشرة عبر dc');
                return;
            } catch(e) {
                console.error('❌ فشل الإرسال عبر dc:', e);
            }
        }
    }
    
    if (this.dc && this.dc.readyState === 'open') {
        try {
            this.dc.send(JSON.stringify({ type: 'webrtc_signal', data: data }));
            console.log('📡 تم إرسال الإشارة مباشرة عبر Data Channel');
            return;
        } catch(e) {
            console.error('❌ فشل الإرسال المباشر:', e);
        }
    }
    
    console.error('❌ فشل إرسال الإشارة: لا توجد قناة مفتوحة');
},
    
    // ==================== 10. واجهة المستخدم (معدلة - تستخدم واجهات ثابتة) ====================

showCallUI(type) {
    // إخفاء جميع واجهات المكالمات أولاً
    const audioUI = document.getElementById('audioCallUI');
    const videoUI = document.getElementById('videoCallUI');
    if (audioUI) audioUI.style.display = 'none';
    if (videoUI) videoUI.style.display = 'none';
    
    document.body.classList.add('in-call');
    
    const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
    const contactAvatar = document.querySelector('#conversationAvatar')?.textContent || '👤';
    
    if (type === 'audio') {
        if (!audioUI) {
            console.error('❌ audioCallUI غير موجود في HTML');
            return;
        }
        audioUI.style.display = 'block';
        
        // تحديث الاسم والصورة
        const nameEl = document.getElementById('callName');
        const avatarEl = document.getElementById('callAvatar');
        if (nameEl) nameEl.textContent = contactName;
        if (avatarEl) avatarEl.textContent = contactAvatar;
        
        // إعداد المستمعات - إزالة القديمة وإضافة الجديدة
        const endBtn = document.getElementById('endCallBtn');
        if (endBtn) {
            const newEndBtn = endBtn.cloneNode(true);
            endBtn.parentNode.replaceChild(newEndBtn, endBtn);
            newEndBtn.addEventListener('click', () => this.endCall());
        }
        
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            const newSpeakerBtn = speakerBtn.cloneNode(true);
            speakerBtn.parentNode.replaceChild(newSpeakerBtn, speakerBtn);
            newSpeakerBtn.addEventListener('click', () => {
                this.toggleSpeaker();
                const icon = newSpeakerBtn.querySelector('i');
                if (icon) {
                    icon.className = this.isSpeakerEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
                }
            });
        }
        
        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) {
            const newMuteBtn = muteBtn.cloneNode(true);
            muteBtn.parentNode.replaceChild(newMuteBtn, muteBtn);
            newMuteBtn.addEventListener('click', () => {
                this.toggleAudio();
                const icon = newMuteBtn.querySelector('i');
                if (icon) {
                    icon.className = this.isAudioMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                    newMuteBtn.style.color = this.isAudioMuted ? '#f44336' : '#2196F3';
                }
            });
            // تحديث الحالة الأولية
            const icon = newMuteBtn.querySelector('i');
            if (icon) {
                icon.className = this.isAudioMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                newMuteBtn.style.color = this.isAudioMuted ? '#f44336' : '#2196F3';
            }
        }
        
        this.startCallTimer();
        
    } else if (type === 'video') {
        if (!videoUI) {
            console.error('❌ videoCallUI غير موجود في HTML');
            return;
        }
        videoUI.style.display = 'block';
        
        // ربط الفيديو المحلي
        const lv = document.getElementById('localVideo');
        if (lv && this.localStream) {
            lv.srcObject = this.localStream;
        }
        
        // إعداد المستمعات - إزالة القديمة وإضافة الجديدة
        const endBtn = document.getElementById('endCallBtnVideo');
        if (endBtn) {
            const newEndBtn = endBtn.cloneNode(true);
            endBtn.parentNode.replaceChild(newEndBtn, endBtn);
            newEndBtn.addEventListener('click', () => this.endCall());
        }
        
        const switchCam = document.getElementById('switchCameraBtn');
        if (switchCam) {
            const newSwitchCam = switchCam.cloneNode(true);
            switchCam.parentNode.replaceChild(newSwitchCam, switchCam);
            newSwitchCam.addEventListener('click', () => this.switchCamera());
        }
        
        const muteAudioBtn = document.getElementById('muteAudioBtn');
        if (muteAudioBtn) {
            const newMuteAudioBtn = muteAudioBtn.cloneNode(true);
            muteAudioBtn.parentNode.replaceChild(newMuteAudioBtn, muteAudioBtn);
            newMuteAudioBtn.addEventListener('click', () => {
                this.toggleAudio();
                const icon = newMuteAudioBtn.querySelector('i');
                if (icon) {
                    icon.className = this.isAudioMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                    newMuteAudioBtn.style.color = this.isAudioMuted ? '#f44336' : '#2196F3';
                }
            });
            // تحديث الحالة الأولية
            const icon = newMuteAudioBtn.querySelector('i');
            if (icon) {
                icon.className = this.isAudioMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
                newMuteAudioBtn.style.color = this.isAudioMuted ? '#f44336' : '#2196F3';
            }
        }
        
        const muteVideoBtn = document.getElementById('muteVideoBtn');
        if (muteVideoBtn) {
            const newMuteVideoBtn = muteVideoBtn.cloneNode(true);
            muteVideoBtn.parentNode.replaceChild(newMuteVideoBtn, muteVideoBtn);
            newMuteVideoBtn.addEventListener('click', () => {
                this.toggleVideo();
                const icon = newMuteVideoBtn.querySelector('i');
                if (icon) {
                    icon.className = this.isVideoMuted ? 'fas fa-video-slash' : 'fas fa-video';
                    newMuteVideoBtn.style.color = this.isVideoMuted ? '#f44336' : '#2196F3';
                }
            });
            // تحديث الحالة الأولية
            if (this.isVideoMuted) {
                const icon = newMuteVideoBtn.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-video-slash';
                    newMuteVideoBtn.style.color = '#f44336';
                }
            }
        }
    }
},

    // ==================== 11. مؤقت المكالمة ====================

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

    // ==================== 12. التحكم بالمكالمة ====================

    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                console.log(`🎤 كتم الصوت: ${!audioTrack.enabled ? 'مفعل' : 'ملغي'}`);
            }
        }
        this.isAudioMuted = this.localStream?.getAudioTracks()[0]?.enabled === false;
    },

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                console.log(`📹 كتم الفيديو: ${!videoTrack.enabled ? 'مفعل' : 'ملغي'}`);
            }
        }
        this.isVideoMuted = this.localStream?.getVideoTracks()[0]?.enabled === false;
    },

    toggleSpeaker() {
        this.isSpeakerEnabled = !this.isSpeakerEnabled;
        this.applySpeakerSettings();
        console.log(`🔊 وضع السماعة: ${this.isSpeakerEnabled ? 'خارجية' : 'داخلية'}`);
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
            if (this.pcCall) {
                const sender = this.pcCall.getSenders().find(s => s.track?.kind === 'video');
                if (sender) await sender.replaceTrack(newVideoTrack);
            }
            const audioTrack = this.localStream.getAudioTracks()[0];
            this.localStream = new MediaStream([newVideoTrack, audioTrack].filter(Boolean));
            const lv = document.getElementById('localVideo');
            if (lv) lv.srcObject = this.localStream;
            console.log(`🔄 تبديل الكاميرا إلى ${newFacing === 'user' ? 'أمامية' : 'خلفية'}`);
        } catch (e) {
            console.error('❌ فشل تبديل الكاميرا:', e);
        }
    },
    
    // ==================== 13. إرسال الملفات ====================

async sendFileDirect(file, type) {
    if (!this.dc || this.dc.readyState !== 'open') {
        console.log('❌ Data Channel غير مفتوح');
        return false;
    }
    
    try {
        let blobToSend = file;
        if (type === 'image') {
            blobToSend = await this.compressImage(file);
        }
        
        const arrayBuffer = await blobToSend.arrayBuffer();
        const chunkSize = 16000;
        const totalChunks = Math.ceil(arrayBuffer.byteLength / chunkSize);
        const fileId = Date.now().toString();
        
        console.log(`📤 إرسال ${type}: ${file.name || 'ملف'} (${totalChunks} جزء)`);
        
        for (let i = 0; i < totalChunks; i++) {
            if (this.dc.readyState !== 'open') {
                ChatSystem.hideProgressBar();
                return false;
            }
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, arrayBuffer.byteLength);
            const chunk = arrayBuffer.slice(start, end);
            
            const chunkData = {
                type: type,
                data: Array.from(new Uint8Array(chunk)),
                chunk: i,
                total: totalChunks,
                id: fileId,
                fileName: file.name || 'ملف'
            };
            this.dc.send(JSON.stringify(chunkData));
            const progress = ((i + 1) / totalChunks) * 100;
            const typeLabel = type === 'video' ? 'الفيديو' : type === 'image' ? 'الصورة' : 'الملف';
            ChatSystem.updateProgressBar(progress, `جاري إرسال ${typeLabel}...`);
            await new Promise(r => setTimeout(r, 50));
        }
        ChatSystem.hideProgressBar();
        console.log('✅ تم إرسال الملف بنجاح');
        return true;
    } catch (e) {
        console.error('❌ فشل إرسال الملف:', e);
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
    
    const chunkData = new Uint8Array(msg.data);
    this.incomingChunks[msg.id][msg.chunk] = chunkData;
    this.incomingFileInfo[msg.id].received++;
    const progress = (this.incomingFileInfo[msg.id].received / msg.total) * 100;
    const fileType = msg.type === 'video' ? 'الفيديو' : msg.type === 'image' ? 'الصورة' : 'الملف';
    ChatSystem.updateProgressBar(progress, `جاري استلام ${fileType}...`);
    
    if (this.incomingFileInfo[msg.id].received === msg.total) {
        let totalLength = 0;
        for (let i = 0; i < msg.total; i++) {
            totalLength += this.incomingChunks[msg.id][i].length;
        }
        
        const fullBuffer = new Uint8Array(totalLength);
        let offset = 0;
        for (let i = 0; i < msg.total; i++) {
            fullBuffer.set(this.incomingChunks[msg.id][i], offset);
            offset += this.incomingChunks[msg.id][i].length;
        }
        
        let mimeType = 'application/octet-stream';
        if (msg.type === 'image') mimeType = 'image/jpeg';
        else if (msg.type === 'video') mimeType = 'video/mp4';
        else if (msg.type === 'voice') mimeType = 'audio/webm';
        
        const blob = new Blob([fullBuffer], { type: mimeType });
        const objectUrl = URL.createObjectURL(blob);
        
        const displayMsg = {
            id: msg.id,
            type: msg.type === 'location' ? 'text' : msg.type,
            data: objectUrl,
            fileName: msg.fileName || (msg.type === 'image' ? 'صورة' : msg.type === 'video' ? 'فيديو' : 'ملف'),
            sender: 'friend',
            time: new Date().toISOString(),
            _blobUrl: objectUrl
        };
        
        if (ChatSystem.currentChat) {
            ChatSystem.displayMessage(displayMsg);
        }
        ChatSystem.hideProgressBar();
        
        delete this.incomingChunks[msg.id];
        delete this.incomingFileInfo[msg.id];
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
                const maxSize = 800;
                if (width > height && width > maxSize) {
                    height = (height * maxSize) / width;
                    width = maxSize;
                } else if (height > maxSize) {
                    width = (width * maxSize) / height;
                    height = maxSize;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.7);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
},

// ==================== 13.1 معالجة استلام الملفات (معدل - تخزين ArrayBuffer في ChatSystem) ====================
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
    
    const chunkData = new Uint8Array(msg.data);
    this.incomingChunks[msg.id][msg.chunk] = chunkData;
    this.incomingFileInfo[msg.id].received++;
    const progress = (this.incomingFileInfo[msg.id].received / msg.total) * 100;
    const fileType = msg.type === 'video' ? 'الفيديو' : msg.type === 'image' ? 'الصورة' : 'الملف';
    ChatSystem.updateProgressBar(progress, `جاري استلام ${fileType}...`);
    
    if (this.incomingFileInfo[msg.id].received === msg.total) {
        let totalLength = 0;
        for (let i = 0; i < msg.total; i++) {
            totalLength += this.incomingChunks[msg.id][i].length;
        }
        
        const fullBuffer = new Uint8Array(totalLength);
        let offset = 0;
        for (let i = 0; i < msg.total; i++) {
            fullBuffer.set(this.incomingChunks[msg.id][i], offset);
            offset += this.incomingChunks[msg.id][i].length;
        }
        
        let mimeType = 'application/octet-stream';
        if (msg.type === 'image') mimeType = 'image/jpeg';
        else if (msg.type === 'video') mimeType = 'video/mp4';
        else if (msg.type === 'voice') mimeType = 'audio/webm';
        
        const blob = new Blob([fullBuffer], { type: mimeType });
        const objectUrl = URL.createObjectURL(blob);
        
        // ✅ تخزين ArrayBuffer في ChatSystem._fileCache
        if (typeof ChatSystem !== 'undefined' && ChatSystem._storeFile) {
            ChatSystem._storeFile(msg.id, fullBuffer.buffer, msg.fileName, mimeType, msg.type);
            console.log(`💾 تم تخزين الملف في الكاش (استلام): ${msg.id}`);
        }
        
        const displayMsg = {
            id: msg.id,
            type: msg.type === 'location' ? 'text' : msg.type,
            data: objectUrl,
            fileName: msg.fileName || (msg.type === 'image' ? 'صورة' : msg.type === 'video' ? 'فيديو' : 'ملف'),
            sender: 'friend',
            time: new Date().toISOString(),
            _blobUrl: objectUrl,
            _fileId: msg.id  // ✅ ربط الرسالة بالـ ArrayBuffer المخزن
        };
        
        if (ChatSystem.currentChat) {
            ChatSystem.displayMessage(displayMsg);
        }
        ChatSystem.hideProgressBar();
        
        delete this.incomingChunks[msg.id];
        delete this.incomingFileInfo[msg.id];
    }
},

// ==================== 14. إنهاء المكالمة (معدل - تستخدم واجهات ثابتة) ====================
    
    endCall() {
        console.log('📞 إنهاء المكالمة...');
        
        if (this.currentCallId && ChatSystem.currentChat) {
            this.sendSignal(ChatSystem.currentChat, { type: 'call_ended' });
        }
        this.currentCallId = null;
        
        this.sendCallStatus('disconnected');
        
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        if (this.keepAliveIntervalCall) {
            clearInterval(this.keepAliveIntervalCall);
            this.keepAliveIntervalCall = null;
        }
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        if (this._incomingCallTimeout) {
            clearTimeout(this._incomingCallTimeout);
            this._incomingCallTimeout = null;
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
        
        if (this.dcCall) {
            try { this.dcCall.close(); } catch(e) {}
            this.dcCall = null;
        }
        if (this.pcCall) {
            try { this.pcCall.close(); } catch(e) {}
            this.pcCall = null;
        }
        
        // إخفاء جميع واجهات المكالمات
        document.getElementById('audioCallUI').style.display = 'none';
        document.getElementById('videoCallUI').style.display = 'none';
        
        this.cleanupDynamicElements();
        
        this.incomingChunks = {};
        this.incomingFileInfo = {};
        
        document.body.classList.remove('in-call');
        
        this.isInCall = false;
        this.callType = null;
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
        
        console.log('✅ تم إنهاء المكالمة');
    },
    
    // ==================== 16. تنظيف العناصر الديناميكية ====================
    
    cleanupDynamicElements() {
        console.log('🧹 بدء تنظيف العناصر الديناميكية...');
        
        // إخفاء العناصر الثابتة
        const elements = ['incomingCall', 'audioCallUI', 'videoCallUI', 'locationSwipeModal', 'imagePreviewModal', 'videoPreviewModal'];
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'none';
                if (id === 'imagePreviewModal') {
                    const img = document.getElementById('previewImage');
                    if (img) img.src = '';
                }
                if (id === 'videoPreviewModal') {
                    const video = document.getElementById('previewVideo');
                    if (video) { video.pause(); video.src = ''; }
                }
                if (id === 'incomingCall') {
                    const leftThumb = document.getElementById('leftThumb');
                    const rightThumb = document.getElementById('rightThumb');
                    if (leftThumb) { leftThumb.style.left = '8px'; leftThumb.style.transition = 'none'; }
                    if (rightThumb) { rightThumb.style.right = '8px'; rightThumb.style.transition = 'none'; }
                }
                if (id === 'audioCallUI' || id === 'videoCallUI') {
                    // إعادة تعيين الفيديو البعيد
                    const rv = document.getElementById('remoteVideo');
                    if (rv) rv.srcObject = null;
                    const lv = document.getElementById('localVideo');
                    if (lv) lv.srcObject = null;
                }
            }
        });
        
        // تنظيف المؤقتات
        if (this._callBatchTimer) {
            clearTimeout(this._callBatchTimer);
            this._callBatchTimer = null;
        }
        if (this._answerBatchTimer) {
            clearTimeout(this._answerBatchTimer);
            this._answerBatchTimer = null;
        }
        if (this._incomingCallTimeout) {
            clearTimeout(this._incomingCallTimeout);
            this._incomingCallTimeout = null;
        }
        
        this._callIceCandidates = [];
        this._answerIceCandidates = [];
        
        console.log('✅ تم تنظيف جميع العناصر الثابتة');
    }
};
       
    
// ==================== 15. الدوال العامة ====================
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

console.log('✅ WebRTC Call System جاهز - مع دعم الواجهات الثابتة');
