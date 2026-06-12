// ========== 1. webrtc-call.js - النسخة النهائية المعدلة ==========
// جميع ميزات الصوت + مكالمات الفيديو + إرسال الملفات

const CallSystem = {
    pc: null, dc: null,           // ✅ خاصة بالميزات (دردشة، ملفات، موقع)
    pcCall: null, dcCall: null,   // ✅ خاصة بالمكالمات (صوت، فيديو)
    localStream: null, isInCall: false, callType: null, currentCallId: null,
    incomingChunks: {}, incomingFileInfo: {},
    callTimerInterval: null, keepAliveInterval: null, keepAliveIntervalCall: null, // ✅ إضافة keepAliveIntervalCall
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
    
    // ==================== 3. Data Channel فقط (لإرسال الملفات بدون مكالمة) ====================
    
async ensureDataChannelOnly(calleeId) {
    if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
        console.log('🚫 منع فتح Data Channel - الميزات غير مفعلة');
        return false;
    }
    
    if (!calleeId) return false;
    
    // ✅ إذا القناة مفتوحة بالفعل
    if (this.dc && this.dc.readyState === 'open') {
        console.log('✅ Data Channel موجود ومفتوح');
        return true;
    }
    
    // ✅ إذا القناة في طور الاتصال - انتظر
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
    
    // ✅ إذا لا توجد قناة، قم بإنشائها
    return this.createDataChannelOnly(calleeId);
},

async createDataChannelOnly(calleeId) {
    if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
        console.log('🚫 منع إنشاء Data Channel - الميزات غير مفعلة');
        return false;
    }
    
    // ✅ إذا كانت القناة مفتوحة بالفعل، لا نعيد إنشاءها
    if (this.dc && this.dc.readyState === 'open') {
        console.log('✅ Data Channel موجود ومفتوح، لا حاجة لإعادة الإنشاء');
        return true;
    }
    
    // ✅ تنظيف الاتصالات القديمة فقط إذا كانت فاشلة أو مغلقة
    if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed')) {
        try { this.pc.close(); } catch(e) {}
        this.pc = null;
    }
    if (this.dc && (this.dc.readyState === 'failed' || this.dc.readyState === 'closed')) {
        try { this.dc.close(); } catch(e) {}
        this.dc = null;
    }
    
    // ✅ إذا كان هناك PeerConnection في حالة connecting، لا ننشئ جديداً
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
    
    // ==================== 4. المكالمة الصوتية (معدلة - تستخدم pcCall/dcCall + تجميع 5 ثواني) ====================

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
            
            // ✅ استخدام pcCall بدلاً من pc
            this.pcCall = new RTCPeerConnection(this.servers);
            
            this.localStream.getTracks().forEach(track => {
                this.pcCall.addTrack(track, this.localStream);
                console.log(`➕ تم إضافة مسار ${track.kind}`);
            });
            
            // ✅ استخدام dcCall بدلاً من dc
            this.dcCall = this.pcCall.createDataChannel('chat');
            this.setupDataChannel(this.dcCall);
            
            // ✅ مصفوفة لتجميع ICE candidates للمكالمة
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
            
            // ✅ انتظار 5 ثواني لتجميع ICE candidates (لضمان نجاح 100%)
            await new Promise(resolve => {
                if (this._callBatchTimer) clearTimeout(this._callBatchTimer);
                this._callBatchTimer = setTimeout(() => {
                    console.log(`📦 انتهاء تجميع المكالمة (5 ثواني) - تم تجميع ${this._callIceCandidates.length} ICE candidate`);
                    resolve();
                }, 5000);
            });
            
            // ✅ إرسال Offer + جميع ICE candidates المجمعة
            await this.sendSignal(calleeId, { 
                sdp: this.pcCall.localDescription, 
                type: 'audio',
                iceCandidates: this._callIceCandidates.map(c => ({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }))
            });
            
            // تنظيف
            this._callIceCandidates = [];
            this._callBatchTimer = null;
            
            console.log('✅ تم إرسال العرض مع ICE candidates المجمعة');
            
        } catch (e) { 
            console.error('❌ خطأ في بدء المكالمة الصوتية:', e);
            this.endCall(); 
        }
    },

// ==================== 5. المكالمة المرئية (معدلة - تستخدم pcCall/dcCall + تجميع 5 ثواني) ====================

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
            
            // ✅ استخدام pcCall بدلاً من pc
            this.pcCall = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pcCall.addTrack(track, this.localStream));
            
            // ✅ استخدام dcCall بدلاً من dc
            this.dcCall = this.pcCall.createDataChannel('chat');
            this.setupDataChannel(this.dcCall);
            
            // ✅ مصفوفة لتجميع ICE candidates للمكالمة
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
            
            // ✅ انتظار 5 ثواني لتجميع ICE candidates (لضمان نجاح 100%)
            await new Promise(resolve => {
                if (this._callBatchTimer) clearTimeout(this._callBatchTimer);
                this._callBatchTimer = setTimeout(() => {
                    console.log(`📦 انتهاء تجميع المكالمة (5 ثواني) - تم تجميع ${this._callIceCandidates.length} ICE candidate`);
                    resolve();
                }, 5000);
            });
            
            // ✅ إرسال Offer + جميع ICE candidates المجمعة
            await this.sendSignal(calleeId, { 
                sdp: this.pcCall.localDescription, 
                type: 'video',
                iceCandidates: this._callIceCandidates.map(c => ({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }))
            });
            
            // تنظيف
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


    // ==================== 7. استقبال المكالمات (معدلة - تستخدم pcCall/dcCall + تجميع 5 ثواني) ====================

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
            
            // ✅ استخدام pcCall بدلاً من pc
            this.pcCall = new RTCPeerConnection(this.servers);
            
            this.localStream.getTracks().forEach(track => {
                this.pcCall.addTrack(track, this.localStream);
                console.log(`➕ تم إضافة مسار ${track.kind}`);
            });
            
            // ✅ مصفوفة لتجميع ICE candidates للإجابة
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
                // ✅ استخدام dcCall بدلاً من dc
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
                
                // ✅ انتظار 5 ثواني لتجميع ICE candidates للإجابة
                await new Promise(resolve => {
                    if (this._answerBatchTimer) clearTimeout(this._answerBatchTimer);
                    this._answerBatchTimer = setTimeout(() => {
                        console.log(`📦 انتهاء تجميع الإجابة (5 ثواني) - تم تجميع ${this._answerIceCandidates.length} ICE candidate`);
                        resolve();
                    }, 5000);
                });
                
                // ✅ إرسال Answer + جميع ICE candidates المجمعة
                await this.sendSignal(callerId, { 
                    sdp: this.pcCall.localDescription,
                    iceCandidates: this._answerIceCandidates.map(c => ({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }))
                });
                
                // تنظيف
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
    
    
    // ========== 8. شاشة المكالمة الواردة (ثابتة - أزرار ضغط) ==========

showIncomingCall(callerId, callData) {
    if (callData.type === 'datachannel') {
        console.log('📡 استلام طلب فتح Data Channel - لا حاجة لعرض شاشة');
        this.handleSignaling(callData);
        return;
    }
    
    console.log('🔔 عرض شاشة المكالمة الواردة...');
    this.currentCallId = callerId;
    
    const callType = callData.type === 'video' ? 'video' : 'audio';
    const acceptIcon = callType === 'video' ? 'fa-video' : 'fa-phone';
    
    const fetchUserName = async () => {
        try {
            const userDoc = await window.db.collection('users').doc(callerId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                return userData.name || 'مستخدم';
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
        // ✅ استخدام الشاشة الثابتة بدلاً من إنشاء جديدة
        const screen = document.getElementById('incomingCallFixed');
        if (!screen) return;
        
        // تحديث البيانات
        document.getElementById('incomingAvatarFixed').textContent = contactAvatar;
        document.getElementById('incomingNameFixed').textContent = contactName;
        
        // تغيير أيقونة القبول حسب نوع المكالمة
        const acceptBtn = document.getElementById('acceptCallFixedBtn');
        acceptBtn.innerHTML = `<i class="fas ${acceptIcon}"></i>`;
        
        // إزالة المستمعات القديمة
        const newAcceptBtn = acceptBtn.cloneNode(true);
        const newRejectBtn = document.getElementById('rejectCallFixedBtn').cloneNode(true);
        acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);
        document.getElementById('rejectCallFixedBtn').parentNode.replaceChild(newRejectBtn, document.getElementById('rejectCallFixedBtn'));
        
        // إضافة مستمعات جديدة
        document.getElementById('acceptCallFixedBtn').onclick = () => {
            screen.style.display = 'none';
            this.receiveCall(callerId, callData);
        };
        
        document.getElementById('rejectCallFixedBtn').onclick = () => {
            screen.style.display = 'none';
            this.sendSignal(callerId, { type: 'reject' });
        };
        
        // إظهار الشاشة
        screen.style.display = 'flex';
        
        // مهلة 30 ثانية
        if (this._incomingTimeout) clearTimeout(this._incomingTimeout);
        this._incomingTimeout = setTimeout(() => {
            if (screen.style.display === 'flex') {
                screen.style.display = 'none';
                this.sendSignal(callerId, { type: 'reject' });
            }
        }, 30000);
    });
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
                // ✅ معالجة إشارات المكالمات (عرض شاشة المكالمة الواردة)
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
                    console.log('⚠️ تم إلغاء الميزات بناءً على طلب الطرف الآخر (انتهاء الـ 120 ثانية)');
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
        
        // ✅ إضافة keepAliveInterval منفصل لـ dcCall (قناة المكالمات)
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
        
        // ✅ تنظيف keepAliveIntervalCall
        if (this.keepAliveIntervalCall) {
            clearInterval(this.keepAliveIntervalCall);
            this.keepAliveIntervalCall = null;
        }
        
        // ✅ فقط إذا كانت القناة المغلقة هي dc (قناة الميزات) وليس dcCall (قناة المكالمة)
        if (channel === this.dc && ChatSystem.currentChat && ChatSystem.featuresEnabled) {
            console.log('🔌 انقطاع قناة الميزات - إلغاء تفعيل الميزات');
            ChatSystem.featuresEnabled = false;
            ChatSystem.featureRequestPending = false;
            ChatSystem.featureRequestReceived = false;
            
            if (ChatSystem.featureBlinkInterval) {
                clearInterval(ChatSystem.featureBlinkInterval);
                ChatSystem.featureBlinkInterval = null;
            }
            
            const btn = document.getElementById('enableFeaturesBtn');
            if (btn) {
                btn.style.background = '#f44336';
                btn.title = 'تفعيل الميزات';
            }
            
            ChatSystem.updateAllButtons();
        }
    };
    
    channel.onerror = (e) => {
        console.error('❌ خطأ في Data Channel:', e);
        
        // ✅ فقط إذا كانت القناة التي حدث فيها الخطأ هي dc (قناة الميزات) وليس dcCall
        if (channel === this.dc && ChatSystem.currentChat && ChatSystem.featuresEnabled) {
            console.log('⚠️ خطأ في قناة الميزات - إلغاء تفعيل الميزات');
            ChatSystem.featuresEnabled = false;
            ChatSystem.featureRequestPending = false;
            ChatSystem.featureRequestReceived = false;
            
            if (ChatSystem.featureBlinkInterval) {
                clearInterval(ChatSystem.featureBlinkInterval);
                ChatSystem.featureBlinkInterval = null;
            }
            
            const btn = document.getElementById('enableFeaturesBtn');
            if (btn) {
                btn.style.background = '#f44336';
                btn.title = 'تفعيل الميزات';
            }
            
            ChatSystem.updateAllButtons();
        }
    };
},

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

sendCallStatus(status) {
    if (this.dc && this.dc.readyState === 'open') {
        this.dc.send(JSON.stringify({ type: 'call_status', status: status, timestamp: Date.now() }));
    }
},

// ✅ تم حذف ensureDataChannel و createNewDataChannel (غير مستخدمين)

async handleSignaling(data) {
    try {
        if (data.type === 'reject') {
            console.log('📞 الطرف الآخر رفض المكالمة');
            const inc = document.getElementById('incomingCall');
            if (inc) inc.remove();
            this.endCall();
            return;
        }
        
        if (data.type === 'call_ended') {
            console.log('📞 المتصل أنهى المكالمة قبل الرد');
            const inc = document.getElementById('incomingCall');
            if (inc) inc.remove();
            this.endCall();
            return;
        }
        
        // ✅ استخدام pcCall للمكالمات بدلاً من pc
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
        } else if (data.candidate) {
            if (this.pcCall && data.candidate) {
                await this.pcCall.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        }
    } catch (e) {
        console.warn('Signaling error:', e);
    }
},

// ✅ دالة sendSignal المعدلة - إشارات المكالمات ترسل عبر dc (قناة الميزات)
async sendSignal(calleeId, data) {
    if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
        console.log('📡 تجاهل إرسال إشارة WebRTC - الميزات غير مفعلة أو الطرف الآخر ليس في المحادثة');
        return;
    }
    
    // ✅ تحديد نوع الإشارة: إذا كانت مكالمة (صوت أو فيديو)
    const isCallSignal = (data.type === 'audio' || data.type === 'video') || 
                         (data.sdp && (data.sdp.type === 'offer' || data.sdp.type === 'answer'));
    
    // ✅ إشارات المكالمات ترسل عبر dc (قناة الميزات الحالية)
    if (isCallSignal) {
        if (this.dc && this.dc.readyState === 'open') {
            try {
                this.dc.send(JSON.stringify({ type: 'webrtc_signal', data: data }));
                console.log('📡 تم إرسال إشارة المكالمة مباشرة عبر dc (قناة الميزات)');
                return;
            } catch(e) {
                console.error('❌ فشل الإرسال عبر dc:', e);
            }
        }
    }
    
    // ✅ إشارات الميزات (دردشة، ملفات، موقع) ترسل عبر dc أيضاً
    if (this.dc && this.dc.readyState === 'open') {
        try {
            this.dc.send(JSON.stringify({ type: 'webrtc_signal', data: data }));
            console.log('📡 تم إرسال الإشارة مباشرة عبر Data Channel');
            return;
        } catch(e) {
            console.error('❌ فشل الإرسال المباشر:', e);
        }
    }
    
    // ✅ إذا القناة لا تزال تفتح → أرسل عبر Firebase (لفتح القناة فقط)
    // هذا ضروري لتمرير Offer/Answer/ICE أثناء عملية الفتح
    try {
        const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
        const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
        if (!myPrivateKey || !receiverPublicKey) return;
        const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
        const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
        await SecureChatSystem.sendToServer(calleeId, { 
            id: Date.now().toString(), 
            type: 'webrtc', 
            data: encrypted, 
            timestamp: Date.now() 
        });
        console.log('📡 تم إرسال الإشارة عبر Firebase (لفتح القناة)');
    } catch (error) {
        console.error('خطأ في إرسال الإشارة:', error);
    }
},
    
    // ==================== 10. واجهة المستخدم (أثناء المكالمة) - نسخة ثابتة ====================

showCallUI(type) {
    document.body.classList.add('in-call');
    
    // ✅ إخفاء واجهة المحادثة
    const conversationPage = document.getElementById('conversationPage');
    if (conversationPage) conversationPage.style.opacity = '0.3';
    
    const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
    const contactAvatar = document.querySelector('#conversationAvatar')?.textContent || '👤';
    const bgColor = '#0a0e27';
    
    // ✅ إظهار أزرار التحكم الثابتة
    const controls = document.getElementById('callControls');
    if (controls) controls.style.display = 'flex';
    
    // إظهار/إخفاء الأزرار حسب نوع المكالمة
    const muteVideoBtn = document.getElementById('muteVideoBtn');
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    const speakerBtn = document.getElementById('speakerBtn');
    const muteAudioBtn = document.getElementById('muteAudioBtn');
    
    if (type === 'video') {
        if (muteVideoBtn) muteVideoBtn.style.display = 'flex';
        if (switchCameraBtn) switchCameraBtn.style.display = 'flex';
        if (speakerBtn) speakerBtn.style.display = 'none';
        if (muteAudioBtn) muteAudioBtn.style.display = 'flex';
        
        // إظهار عناصر الفيديو
        let videoContainer = document.getElementById('videoCallContainer');
        if (!videoContainer) {
            videoContainer = document.createElement('div');
            videoContainer.id = 'videoCallContainer';
            videoContainer.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9998;background:' + bgColor + ';';
            videoContainer.innerHTML = `
                <video id="remoteVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;"></video>
                <video id="localVideo" autoplay playsinline muted style="position:fixed;bottom:100px;right:20px;width:120px;height:170px;object-fit:cover;border-radius:16px;border:3px solid rgba(255,255,255,0.3);z-index:9999;cursor:pointer;"></video>
            `;
            document.body.appendChild(videoContainer);
        }
        videoContainer.style.display = 'block';
        
        const localVideo = document.getElementById('localVideo');
        if (localVideo && this.localStream) localVideo.srcObject = this.localStream;
        
        // إخفاء واجهة الصوت إذا كانت موجودة
        const audioUI = document.getElementById('audioCallUI');
        if (audioUI) audioUI.style.display = 'none';
        
    } else {
        if (muteVideoBtn) muteVideoBtn.style.display = 'none';
        if (switchCameraBtn) switchCameraBtn.style.display = 'none';
        if (speakerBtn) speakerBtn.style.display = 'flex';
        if (muteAudioBtn) muteAudioBtn.style.display = 'flex';
        
        // إخفاء عناصر الفيديو
        const videoContainer = document.getElementById('videoCallContainer');
        if (videoContainer) videoContainer.style.display = 'none';
        
        // إظهار واجهة الصوت
        let audioUI = document.getElementById('audioCallUI');
        if (!audioUI) {
            audioUI = document.createElement('div');
            audioUI.id = 'audioCallUI';
            audioUI.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg,#1a1a2e,#16213e);z-index:9997;display:flex;align-items:center;justify-content:center;';
            audioUI.innerHTML = `
                <div style="text-align:center;">
                    <div style="font-size:6rem;margin-bottom:15px;filter:drop-shadow(0 10px 20px rgba(0,0,0,0.3));">${contactAvatar}</div>
                    <div style="font-size:1.8rem;color:white;font-weight:bold;margin-bottom:5px;text-shadow:0 2px 10px rgba(0,0,0,0.3);">${contactName}</div>
                    <div style="margin-top:8px;color:#4CAF50;font-size:0.9rem;background:rgba(76,175,80,0.2);padding:5px 15px;border-radius:20px;display:inline-block;">
                        <i class="fas fa-phone-alt" style="margin-left:5px;"></i> <span id="callTimer">00:00</span>
                    </div>
                </div>
            `;
            document.body.appendChild(audioUI);
        }
        audioUI.style.display = 'flex';
    }
    
    // ✅ ربط الأزرار (مرة واحدة)
    const endCallBtn = document.getElementById('endCallBtn');
    
    if (muteAudioBtn) {
        muteAudioBtn.onclick = () => this.toggleAudio();
    }
    
    if (endCallBtn) {
        endCallBtn.onclick = () => this.endCall();
    }
    
    if (muteVideoBtn) {
        muteVideoBtn.onclick = () => this.toggleVideo();
    }
    
    if (switchCameraBtn) {
        switchCameraBtn.onclick = () => this.switchCamera();
    }
    
    if (speakerBtn) {
        speakerBtn.onclick = () => this.toggleSpeaker();
    }
    
    this.startCallTimer();
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

    // ❌ تم حذف toggleMute (استخدم toggleAudio بدلاً منها)

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
        
        console.log(`📤 إرسال ${type}: ${file.name || 'ملف'} (${totalChunks} جزء) - بدون base64`);
        
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
        console.log('✅ تم إرسال الملف بنجاح (بدون base64)');
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

// ==================== 14. إنهاء المكالمة (معدلة - تغلق pcCall/dcCall فقط) ====================
    
    endCall() {
        console.log('📞 إنهاء المكالمة...');
        
        // ✅ إخفاء أزرار التحكم الثابتة
        const controls = document.getElementById('callControls');
        if (controls) controls.style.display = 'none';
        
        // ✅ إخفاء واجهة الصوت
        const audioUI = document.getElementById('audioCallUI');
        if (audioUI) audioUI.style.display = 'none';
        
        // ✅ إخفاء عناصر الفيديو
        const videoContainer = document.getElementById('videoCallContainer');
        if (videoContainer) videoContainer.style.display = 'none';
        
        // ✅ إعادة إظهار واجهة المحادثة
        const conversationPage = document.getElementById('conversationPage');
        if (conversationPage) conversationPage.style.opacity = '1';
        
        if (this.currentCallId && ChatSystem.currentChat) {
            this.sendSignal(ChatSystem.currentChat, { type: 'call_ended' });
        }
        this.currentCallId = null;
        
        this.sendCallStatus('disconnected');
        
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        // ✅ تنظيف keepAliveIntervalCall
        if (this.keepAliveIntervalCall) {
            clearInterval(this.keepAliveIntervalCall);
            this.keepAliveIntervalCall = null;
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
        
        if (this.localStream) {
            try {
                this.localStream.getTracks().forEach(t => t.stop());
            } catch(e) {}
            this.localStream = null;
        }
        
        // ✅ إغلاق pcCall و dcCall فقط (خاصة بالمكالمات)
        // ولا نلمس pc و dc (خاصة بميزات الدردشة)
        if (this.dcCall) {
            try { this.dcCall.close(); } catch(e) {}
            this.dcCall = null;
        }
        if (this.pcCall) {
            try { this.pcCall.close(); } catch(e) {}
            this.pcCall = null;
        }
        
        this.incomingChunks = {};
        this.incomingFileInfo = {};
        
        // ✅ إزالة العناصر الديناميكية القديمة (إن وجدت للتوافق)
        const ui = document.getElementById('callUI');
        if (ui) ui.remove();
        const inc = document.getElementById('incomingCall');
        if (inc) inc.remove();
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

console.log('✅ WebRTC Call System جاهز - مع دعم Data Channel فقط للملفات');
