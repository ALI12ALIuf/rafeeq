// ========== نظام WebRTC للدردشة المباشرة مع Firebase Signaling ==========
// اتصال P2P مشفر بالكامل - بدون حفظ أي بيانات في السيرفر
// يستخدم Firebase فقط للإشارات المؤقتة

class WebRTCManager {
    constructor() {
        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.localStream = null;
        this.currentCall = null;
        this.currentFriendId = null;
        this.pendingCandidates = new Map();
        this.isReady = true; // دائمًا جاهز
        
        console.log('✅ WebRTC Manager جاهز للاستخدام');
        
        // بدء الاستماع للإشارات فوراً
        if (window.auth?.currentUser) {
            this.startListeningForSignals();
        }
    }

    // ========== نظام الإشارات عبر Firebase ==========
    
    // بدء الاستماع للإشارات الواردة
    startListeningForSignals() {
        if (!window.auth?.currentUser) {
            console.log('⏳ انتظار تسجيل الدخول...');
            setTimeout(() => this.startListeningForSignals(), 1000);
            return;
        }
        
        const userId = window.auth.currentUser.uid;
        console.log('👂 بدء الاستماع للإشارات للمستخدم:', userId);
        
        // الاستماع للإشارات الواردة
        window.db.collection('signaling')
            .where('to', '==', userId)
            .where('status', '==', 'pending')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const signal = change.doc.data();
                        const signalId = change.doc.id;
                        
                        console.log('📩 إشارة واردة:', signal.type);
                        
                        // معالجة الإشارة حسب نوعها
                        switch(signal.type) {
                            case 'offer':
                                this.handleIncomingOffer(signal, signalId);
                                break;
                            case 'answer':
                                this.handleIncomingAnswer(signal, signalId);
                                break;
                            case 'candidate':
                                this.handleIncomingCandidate(signal, signalId);
                                break;
                            case 'end-call':
                                this.handleEndCall(signal.from);
                                break;
                        }
                        
                        // حذف الإشارة بعد معالجتها (تنظيف تلقائي)
                        setTimeout(() => {
                            window.db.collection('signaling').doc(signalId).delete()
                                .catch(() => {});
                        }, 5000);
                    }
                });
            }, (error) => {
                console.error('خطأ في الاستماع للإشارات:', error);
            });
    }

    // ========== إدارة المحادثات ==========
    
    // بدء محادثة مع صديق
    async startChat(friendId, friendName, friendAvatar) {
        console.log('🚀 بدء محادثة مع:', friendName);
        
        this.currentFriendId = friendId;
        
        // تحديث واجهة المستخدم
        document.getElementById('conversationName').textContent = friendName;
        document.getElementById('conversationAvatar').textContent = friendAvatar || '👤';
        
        // إظهار صفحة المحادثة
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'block';
        
        // مسح الرسائل السابقة
        document.getElementById('messagesContainer').innerHTML = '';
        
        // إنشاء اتصال WebRTC
        await this.createPeerConnection(friendId);
        
        // إنشاء قناة بيانات
        this.createDataChannel(friendId);
        
        // إرسال عرض الاتصال
        await this.sendOffer(friendId);
        
        // رسالة ترحيب
        this.displaySystemMessage('جاري الاتصال...');
    }

    // إنشاء اتصال WebRTC
    async createPeerConnection(friendId) {
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        const pc = new RTCPeerConnection(config);
        
        // معالجة ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendCandidate(friendId, event.candidate);
            }
        };

        // معالجة قنوات البيانات الواردة
        pc.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupDataChannel(channel, friendId);
        };

        // معالجة التيارات البعيدة (للمكالمات)
        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                this.displayRemoteVideo(event.streams[0]);
            }
        };

        // مراقبة حالة الاتصال
        pc.oniceconnectionstatechange = () => {
            console.log('📡 ICE state:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'connected') {
                this.displaySystemMessage('✅ تم الاتصال بنجاح');
            } else if (pc.iceConnectionState === 'disconnected') {
                this.displaySystemMessage('❌ تم قطع الاتصال');
            }
        };

        this.peerConnections.set(friendId, pc);
        return pc;
    }

    // إنشاء قناة بيانات
    createDataChannel(friendId) {
        const pc = this.peerConnections.get(friendId);
        if (!pc) return;

        const channel = pc.createDataChannel('chat', { 
            reliable: true,
            ordered: true 
        });
        
        this.setupDataChannel(channel, friendId);
        return channel;
    }

    // إعداد قناة البيانات
    setupDataChannel(channel, friendId) {
        channel.onopen = () => {
            console.log('✅ قناة البيانات مفتوحة');
            this.displaySystemMessage('✅ جاهز للإرسال');
        };

        channel.onclose = () => {
            console.log('❌ قناة البيانات مغلقة');
        };

        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleIncomingMessage(data);
            } catch (e) {
                console.error('خطأ في معالجة الرسالة:', e);
            }
        };

        this.dataChannels.set(friendId, channel);
    }

    // ========== إرسال الإشارات عبر Firebase ==========

    // إرسال عرض اتصال
    async sendOffer(friendId) {
        const pc = this.peerConnections.get(friendId);
        if (!pc) return;

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // حفظ العرض في Firebase
            const signalId = `${window.auth.currentUser.uid}_${friendId}_${Date.now()}`;
            
            await window.db.collection('signaling').doc(signalId).set({
                from: window.auth.currentUser.uid,
                to: friendId,
                type: 'offer',
                offer: {
                    type: offer.type,
                    sdp: offer.sdp
                },
                status: 'pending',
                timestamp: new Date()
            });

            console.log('📤 Offer sent to Firebase');

        } catch (error) {
            console.error('خطأ في إنشاء العرض:', error);
        }
    }

    // معالجة عرض وارد
    async handleIncomingOffer(signal, signalId) {
        if (!window.auth?.currentUser) return;

        console.log('📥 استلام offer من:', signal.from);
        
        const pc = await this.createPeerConnection(signal.from);
        
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // إرسال الإجابة عبر Firebase
            await window.db.collection('signaling').doc(signalId).set({
                from: window.auth.currentUser.uid,
                to: signal.from,
                type: 'answer',
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },
                status: 'answered',
                timestamp: new Date()
            }, { merge: true });

            console.log('📤 Answer sent to Firebase');

        } catch (error) {
            console.error('خطأ في معالجة العرض:', error);
        }
    }

    // معالجة إجابة واردة
    async handleIncomingAnswer(signal) {
        console.log('📥 استلام answer من:', signal.from);
        
        const pc = this.peerConnections.get(signal.from);
        if (!pc) return;

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
            console.log('✅ تم تأكيد الاتصال');
            
        } catch (error) {
            console.error('خطأ في معالجة الإجابة:', error);
        }
    }

    // إرسال ICE candidate
    async sendCandidate(friendId, candidate) {
        try {
            const signalId = `${window.auth.currentUser.uid}_${friendId}_cand_${Date.now()}`;
            
            await window.db.collection('signaling').doc(signalId).set({
                from: window.auth.currentUser.uid,
                to: friendId,
                type: 'candidate',
                candidate: {
                    candidate: candidate.candidate,
                    sdpMid: candidate.sdpMid,
                    sdpMLineIndex: candidate.sdpMLineIndex
                },
                timestamp: new Date()
            });
            
        } catch (error) {
            console.error('خطأ في إرسال candidate:', error);
        }
    }

    // معالجة ICE candidate وارد
    async handleIncomingCandidate(signal) {
        const pc = this.peerConnections.get(signal.from);
        
        if (pc && pc.remoteDescription) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                console.log('✅ تم إضافة ICE candidate');
            } catch (error) {
                console.error('خطأ في إضافة candidate:', error);
            }
        } else {
            // حفظ candidate لحين جهوزية الاتصال
            if (!this.pendingCandidates.has(signal.from)) {
                this.pendingCandidates.set(signal.from, []);
            }
            this.pendingCandidates.get(signal.from).push(signal.candidate);
            console.log('⏳ حفظ candidate مؤقتاً');
        }
    }

    // ========== إدارة الرسائل ==========

    // إرسال رسالة نصية
    sendTextMessage(text) {
        if (!this.currentFriendId) return false;

        const message = {
            type: 'text',
            text: text,
            sender: window.auth.currentUser.uid,
            timestamp: Date.now(),
            id: `msg_${Date.now()}_${Math.random()}`
        };

        const channel = this.dataChannels.get(this.currentFriendId);
        if (channel && channel.readyState === 'open') {
            channel.send(JSON.stringify(message));
            this.displayMessage(message, 'sent');
            return true;
        } else {
            this.displaySystemMessage('⏳ الاتصال غير جاهز بعد...');
            return false;
        }
    }

    // معالجة رسالة واردة
    handleIncomingMessage(message) {
        if (message.type === 'text') {
            this.displayMessage(message, 'received');
        }
    }

    // عرض الرسالة في الواجهة
    displayMessage(message, type) {
        const container = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageElement.innerHTML = `
            <div class="message-content">${this.escapeHtml(message.text)}</div>
            <div class="message-time">${time}</div>
        `;

        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }

    // عرض رسالة نظام
    displaySystemMessage(text) {
        const container = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = 'message system';
        
        messageElement.innerHTML = `
            <div class="system-content">${text}</div>
        `;

        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }

    // الهروب من HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== إدارة المكالمات ==========

    // بدء مكالمة فيديو
    async startVideoCall() {
        if (!this.currentFriendId) return;

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;

            const pc = this.peerConnections.get(this.currentFriendId);
            if (pc) {
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            }

            document.getElementById('videoContainer').style.display = 'flex';
            this.currentCall = { type: 'video', stream: this.localStream };
            
            this.displaySystemMessage('📹 بدأت مكالمة فيديو');

        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول إلى الكاميرا أو الميكروفون');
        }
    }

    // بدء مكالمة صوتية
    async startVoiceCall() {
        if (!this.currentFriendId) return;

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });

            const pc = this.peerConnections.get(this.currentFriendId);
            if (pc) {
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            }

            document.getElementById('videoContainer').style.display = 'flex';
            document.getElementById('localVideo').style.display = 'none';
            
            this.currentCall = { type: 'voice', stream: this.localStream };
            
            this.displaySystemMessage('🎤 بدأت مكالمة صوتية');

        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول إلى الميكروفون');
        }
    }

    // عرض الفيديو البعيد
    displayRemoteVideo(stream) {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = stream;
    }

    // إنهاء المكالمة
    endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        document.getElementById('videoContainer').style.display = 'none';
        document.getElementById('localVideo').style.display = 'block';
        
        if (this.currentCall) {
            this.displaySystemMessage('📞 انتهت المكالمة');
        }
        
        this.currentCall = null;
    }

    // معالجة إنهاء المكالمة
    handleEndCall(friendId) {
        if (this.currentCall) {
            this.endCall();
        }
    }

    // ========== إنهاء المحادثة ==========

    // إغلاق المحادثة
    closeConversation() {
        if (this.currentCall) {
            this.endCall();
        }

        if (this.currentFriendId) {
            const channel = this.dataChannels.get(this.currentFriendId);
            if (channel) channel.close();
            
            const pc = this.peerConnections.get(this.currentFriendId);
            if (pc) pc.close();
            
            this.dataChannels.delete(this.currentFriendId);
            this.peerConnections.delete(this.currentFriendId);
        }

        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        document.getElementById('messagesContainer').innerHTML = '';
        
        this.currentFriendId = null;
    }
}

// ========== المتغيرات العامة ==========

let webRTCManager = null;

// ========== دوال عامة للواجهة ==========

// فتح محادثة مع صديق
window.openChat = function(friendId) {
    // إذا ما كان فيه مدير، ننشئ واحد جديد
    if (!webRTCManager) {
        webRTCManager = new WebRTCManager();
    }

    // جلب بيانات الصديق
    window.db.collection('users').doc(friendId).get().then((doc) => {
        if (doc.exists) {
            const friend = doc.data();
            const avatarEmoji = window.getEmojiForUser ? 
                window.getEmojiForUser(friend) : '👤';
            webRTCManager.startChat(friendId, friend.name, avatarEmoji);
        }
    }).catch(error => {
        console.error('خطأ في جلب بيانات الصديق:', error);
        alert('حدث خطأ في فتح المحادثة');
    });
};

// إرسال رسالة
window.sendMessage = function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (text && webRTCManager) {
        if (webRTCManager.sendTextMessage(text)) {
            input.value = '';
        }
    }
};

// معالجة ضغط Enter
window.handleMessageKeyPress = function(event) {
    if (event.key === 'Enter') {
        window.sendMessage();
    }
};

// بدء مكالمة فيديو
window.toggleVideoCall = function() {
    if (!webRTCManager) {
        webRTCManager = new WebRTCManager();
    }
    
    const btn = document.getElementById('videoCallBtn');
    if (webRTCManager.currentCall?.type === 'video') {
        webRTCManager.endCall();
        btn.innerHTML = '<i class="fas fa-video"></i>';
    } else {
        webRTCManager.startVideoCall();
        btn.innerHTML = '<i class="fas fa-video-slash"></i>';
    }
};

// بدء مكالمة صوتية
window.toggleVoiceCall = function() {
    if (!webRTCManager) {
        webRTCManager = new WebRTCManager();
    }
    
    const btn = document.getElementById('voiceCallBtn');
    if (webRTCManager.currentCall?.type === 'voice') {
        webRTCManager.endCall();
        btn.innerHTML = '<i class="fas fa-phone"></i>';
    } else {
        webRTCManager.startVoiceCall();
        btn.innerHTML = '<i class="fas fa-phone-slash"></i>';
    }
};

// إنهاء المكالمة
window.endCall = function() {
    if (webRTCManager) {
        webRTCManager.endCall();
        document.getElementById('voiceCallBtn').innerHTML = '<i class="fas fa-phone"></i>';
        document.getElementById('videoCallBtn').innerHTML = '<i class="fas fa-video"></i>';
    }
};

// كتم/تشغيل الميكروفون
window.toggleMute = function() {
    if (webRTCManager?.localStream) {
        const audioTrack = webRTCManager.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.querySelector('.call-controls button:nth-child(2) i');
            btn.className = audioTrack.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
        }
    }
};

// تشغيل/إيقاف الكاميرا
window.toggleCamera = function() {
    if (webRTCManager?.localStream) {
        const videoTrack = webRTCManager.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.querySelector('.call-controls button:nth-child(3) i');
            btn.className = videoTrack.enabled ? 'fas fa-video' : 'fas fa-video-slash';
        }
    }
};

// إظهار قائمة المرفقات
window.showAttachmentMenu = function() {
    const menu = document.getElementById('attachmentMenu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
};

// إرسال صورة
window.sendImage = function() {
    alert('سيتم إضافة إرسال الصور قريباً');
    document.getElementById('attachmentMenu').style.display = 'none';
};

// إرسال ملف
window.sendFile = function() {
    alert('سيتم إضافة إرسال الملفات قريباً');
    document.getElementById('attachmentMenu').style.display = 'none';
};

// إرسال بصمة صوتية
window.sendVoiceNote = function() {
    alert('سيتم إضافة التسجيل الصوتي قريباً');
    document.getElementById('attachmentMenu').style.display = 'none';
};

// مشاركة الموقع
window.shareLocation = function() {
    alert('سيتم إضافة مشاركة الموقع قريباً');
    document.getElementById('attachmentMenu').style.display = 'none';
};

// إغلاق المحادثة
window.closeConversation = function() {
    if (webRTCManager) {
        webRTCManager.closeConversation();
    }
};

// تهيئة WebRTC بعد تسجيل الدخول
window.initWebRTC = function() {
    if (window.auth?.currentUser && !webRTCManager) {
        webRTCManager = new WebRTCManager();
        console.log('✅ WebRTC manager initialized');
    } else if (window.auth?.currentUser && webRTCManager) {
        console.log('ℹ️ WebRTC manager already exists');
    }
};

// محاولة تهيئة WebRTC تلقائياً
function autoInitWebRTC() {
    if (window.auth?.currentUser) {
        window.initWebRTC();
    } else {
        // انتظر تسجيل الدخول
        setTimeout(autoInitWebRTC, 2000);
    }
}

// بدء المحاولات التلقائية
setTimeout(autoInitWebRTC, 3000);

// إنشاء مجموعة signaling في Firebase
async function ensureSignalingCollection() {
    if (!window.db) return;
    
    try {
        // التحقق من وجود المجموعة
        const testDoc = await window.db.collection('signaling').doc('_config').get();
        
        if (!testDoc.exists) {
            await window.db.collection('signaling').doc('_config').set({
                created: new Date(),
                version: '1.0'
            });
            console.log('✅ Signaling collection created');
        } else {
            console.log('✅ Signaling collection ready');
        }
    } catch (error) {
        console.error('خطأ في تهيئة signaling:', error);
    }
}

// تهيئة المجموعة
if (window.db) {
    ensureSignalingCollection();
}

// محاولة تهيئة WebRTC عند تحميل الصفحة
window.addEventListener('load', () => {
    if (window.auth?.currentUser) {
        setTimeout(() => {
            window.initWebRTC();
        }, 2000);
    }
});

console.log('✅ WebRTC module loaded - جاهز للاستخدام');
