// ========== 1. webrtc-call.js - النسخة النهائية المتكاملة (رقم 4 المحدثة) ==========
// جميع ميزات الصوت من ملف 22 + مكالمات الفيديو + إرسال الملفات + تنظيف تلقائي

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
        ] 
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
    
    // ==================== 2. التنظيف التلقائي الشامل ====================
    async autoCleanupOnLoad() {
        console.log('🧹 تشغيل التنظيف التلقائي للمكالمات العالقة...');
        
        await this.deleteAllMyWebRTCSignals();
        
        this.isInCall = false;
        this.callType = null;
        this.currentCallId = null;
        this.isAudioMuted = false;
        this.isVideoMuted = false;
        this.isSpeakerEnabled = false;
        
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
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
    
    // ==================== 3. ضمان وإدارة قنوات البيانات (الأنبوب الموحد) ====================
    async ensureDataChannelOnly(calleeId) {
        if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
            console.log('🚫 منع فتح Data Channel - الميزات غير مفعلة أو الطرف الآخر ليس في المحادثة');
            return false;
        }
        
        if (!calleeId) return false;
        
        if (this.dc && this.dc.readyState === 'open') {
            console.log('✅ Data Channel الموحد موجود ومفتوح بالفعل للعمل الحي');
            return true;
        }
        
        if (this.dc && this.dc.readyState === 'connecting') {
            console.log('⏳ Data Channel الموحد في طور الاتصال حالياً...');
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
            console.log('🚫 منع إنشاء Data Channel - شروط التفعيل والحضور لم تكتمل بعد');
            return false;
        }
        
        this.cleanupConnections();
        try {
            console.log('🔧 إنشاء وتأسيس الأنبوب الموحد الفوري (Data Channel فقط)...');
            
            this.pc = new RTCPeerConnection(this.servers);
            this.dc = this.pc.createDataChannel('chat', { ordered: true, maxRetransmits: 3 });
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { 
                if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }).catch(() => {});
            };
            
            this.pc.ondatachannel = e => { 
                this.setupDataChannel(e.channel); 
                this.dc = e.channel; 
            };
            
            const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: 'datachannel' });
            
            console.log('✅ تم إرسال طلب فتح الـ Data Channel بنجاح للطرف الآخر');
            return true;
        } catch (error) {
            console.error('❌ فشل إنشاء الأنبوب الموحد:', error);
            return false;
        }
    },
    
    setupDataChannel(channel) {
        if (!channel) return;
        this.dc = channel;
        this.dc.binaryType = 'arraybuffer';

        this.dc.onopen = () => {
            console.log("🚀 قناة البيانات الموحدة حية ومفتوحة الآن! مزامنة واجهات الاستخدام.");
            if (typeof ChatSystem !== 'undefined') {
                ChatSystem.updateFeatureToggleUI();
                ChatSystem.updateAllButtons();
            }
        };

        this.dc.onclose = () => {
            console.log("🔒 انغلقت قناة البيانات الموحدة. إلغاء تفعيل الميزات تلقائياً لمنع التعليق.");
            if (typeof ChatSystem !== 'undefined') {
                ChatSystem.resetFeatures();
            }
        };

        this.dc.onerror = (err) => {
            console.error("❌ خطأ مفاجئ داخل قناة البيانات الموحدة:", err);
        };

        this.dc.onmessage = (event) => {
            this.handleDataChannelMessage(event.data);
        };
    },

    // ==================== معالجة وفك تفتيت رسائل باينري الميزات المشحونة حياً ====================
    handleDataChannelMessage(data) {
        if (typeof data === 'string') {
            try {
                const msg = JSON.parse(data);
                
                // التحكم القسري بالطرد وإنهاء المحادثة فوراً
                if (msg.type === 'force_close_conversation') {
                    console.log('👢 استلام أمر إنهاء المحادثة القسري من الطرف الآخر');
                    if (typeof ChatSystem !== 'undefined') ChatSystem.closeChat();
                }
                // استقبال رأس الملف (الهيدر) لمعرفة تفاصيل الباينري القادم حياً
                else if (msg.type === 'file-header') {
                    this.incomingFileInfo = {
                        name: msg.name,
                        size: msg.size,
                        isImage: msg.isImage,
                        totalChunks: msg.totalChunks,
                        receivedChunks: 0
                    };
                    this.incomingChunks = [];
                    console.log(`📥 الاستعداد لاستقبال دفق باينري حي: ${msg.name}`);
                }
            } catch (e) {
                console.error("❌ فشل معالجة الرسالة النصية التخاطبية داخل الأنبوب:", e);
            }
        } 
        // استقبال القطع الباينري الحية وإعادة تجميعها كـ Blob بالذاكرة المؤقتة الصافية
        else if (data instanceof ArrayBuffer) {
            if (!this.incomingFileInfo.name) return;

            this.incomingChunks.push(data);
            this.incomingFileInfo.receivedChunks++;

            if (this.incomingFileInfo.receivedChunks === this.incomingFileInfo.totalChunks) {
                console.log(`✅ اكتمل تجميع الدفق الحي للملف بنجاح: ${this.incomingFileInfo.name}`);
                
                const blob = new Blob(this.incomingChunks);
                
                // تمرير الملف مجمعاً وجاهزاً فوراً لنظام الشات لعرضه وتأمين تشفيره في الجلسة الحالية
                if (typeof ChatSystem !== 'undefined' && typeof ChatSystem.displayReceivedFile === 'function') {
                    ChatSystem.displayReceivedFile(blob, this.incomingFileInfo.name, this.incomingFileInfo.isImage);
                }
                
                // التنظيف العشوائي الفوري للـ Chunks لمنع أي بقاء للكاش وحفظاً لخصوصية الرام المطلقة
                this.incomingChunks = [];
                this.incomingFileInfo = {};
            }
        }
    },

    // ==================== دالة الإرسال الموحدة والمركزية للملفات والصور والوسائط حياً ====================
    async sendFileUnified(file, isImage) {
        if (!this.dc || this.dc.readyState !== 'open') {
            throw new Error("🔒 الأنبوب الموحد مغلق حالياً، يرجى تفعيل الميزات أولاً!");
        }

        const CHUNK_SIZE = 16384; // تقطيع ذكي بمقدار 16 كيلوبايت لثبات الواجهة تماماً أثناء البث
        const arrayBuffer = await file.arrayBuffer();
        const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);

        // إرسال هيدر الملف التعريفي للطرف الآخر لتهيئة الرام ومؤشرات الحجم نوع الباينري
        this.dc.send(JSON.stringify({
            type: 'file-header',
            name: file.name,
            size: file.size,
            isImage: isImage,
            totalChunks: totalChunks
        }));

        // بث أجزاء الملف تباعاً مع معالجة حماية التدفق العالي للشبكة لمنع التجمد (Backpressure)
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
            const chunk = arrayBuffer.slice(start, end);
            
            while (this.dc.bufferedAmount > 1048576) { // إذا تجاوز حاجز الكاش 1 ميجابايت انتظر لثوانٍ معدودة لراحة المتصفح
                await new Promise(r => setTimeout(r, 20));
            }
            
            this.dc.send(chunk);
        }
        console.log(`✅ تم تقطيع وبث الملف الحي عبر الأنبوب الموحد بالكامل: ${file.name}`);
    },
    
    // ==================== 4. المكالمة الصوتية الأصلية الكاملة ====================
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
            
            this.pc = new RTCPeerConnection(this.servers);
            
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
                console.log(`➕ تم إضافة مسار ${track.kind}`);
            });
            
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { 
                if (e.candidate) {
                    console.log('📡 إرسال ICE candidate');
                    this.sendSignal(calleeId, { candidate: e.candidate });
                }
            };
            
            this.pc.ontrack = e => {
                console.log(`📞 استقبال مسار ${e.track.kind}`);
                if (e.track.kind === 'audio') {
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pc.onconnectionstatechange = () => {
                console.log(`🔄 حالة الاتصال: ${this.pc?.connectionState}`);
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            console.log('📞 إنشاء عرض مكالمة صوتية...');
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: 'audio' });
            console.log('✅ تم إرسال العرض');
            
        } catch (e) { 
            console.error('❌ خطأ في بدء المكالمة الصوتية:', e);
            this.endCall(); 
        }
    },

    // ==================== 5. المكالمة المرئية الأصلية الكاملة ====================
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
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            
            this.pc.onicecandidate = e => { 
                if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate });
            };
            
            this.pc.ontrack = e => {
                const rv = document.getElementById('remoteVideo');
                if (rv && e.streams[0]) rv.srcObject = e.streams[0];
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
    
    // ==================== 6. إعداد الصوت عن بعد والسماعات المدمجة ====================
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
            console.log('✅ بدء تشغيل الصوت عن بعد بنجاح');
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
                }).catch(e => console.log('❌ فشل التبديل إلى السماعة الخارجية:', e));
            } else {
                this.remoteAudioElement.setSinkId('default').then(() => {
                    console.log('✅ تم التبديل إلى السماعة الداخلية الأذن');
                }).catch(e => console.log('❌ فشل التبديل إلى سماعة الأذن:', e));
            }
        }
    },

    async sendSignal(chatId, signalData) {
        if (!chatId) return;
        try {
            await window.db.collection('secure_messages').add({
                from: window.auth?.currentUser?.uid || 'me',
                to: chatId,
                timestamp: Date.now(),
                package: { type: 'webrtc' },
                signal: JSON.stringify(signalData)
            });
        } catch (e) {
            console.error("❌ فشل إرسال إشارة الـ WebRTC للسحابة:", e);
        }
    },
    
    cleanupConnections() {
        if (this.dc) { try { this.dc.close(); } catch(e){} this.dc = null; }
        if (this.pc) { try { this.pc.close(); } catch(e){} this.pc = null; }
    },

    async endCall() {
        if (this.currentCallId) {
            await this.sendSignal(this.currentCallId, { type: 'call-end' });
            await this.deleteAllWebRTCSignals(this.currentCallId);
        }
        this.autoCleanupOnLoad();
    },

    showCallUI(state) {
        // إدارة الواجهات الرسومية العادية والطبقات للمكالمة في مشروعك الأصلي
        const overlay = document.getElementById('callOverlay') || document.getElementById('callUI');
        if (!overlay) return;
        overlay.style.display = (state === 'none' ? 'none' : 'flex');
    }
};

// ==================== 15. التنظيف التلقائي عند تحميل الصفحة ====================
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (typeof CallSystem !== 'undefined') {
                CallSystem.autoCleanupOnLoad();
            }
        }, 1500);
    });
}

// ==================== 16. التنظيف قبل إغلاق الصفحة ====================
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        if (CallSystem.isInCall) {
            CallSystem.endCall();
        }
    });
}

// ==================== 17. الدوال العامة للمشروع ====================
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

window.cleanupCallState = async () => {
    await CallSystem.autoCleanupOnLoad();
    console.log('🧹 تم استدعاء تصفير وتطهير الاتصالات والميزات بنجاح.');
};
