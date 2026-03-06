// ========== نظام اتصال P2P مبسط ==========

class P2PCallSystem {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.currentFriendId = null;
        this.callActive = false;
    }

    // بدء مكالمة فيديو
    async startVideoCall(friendId) {
        this.currentFriendId = friendId;
        
        try {
            // طلب الكاميرا والميكروفون
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            // عرض الفيديو المحلي
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
                localVideo.style.display = 'block';
            }

            // إنشاء اتصال
            await this.createConnection();
            
            // إظهار شاشة المكالمة
            document.getElementById('videoContainer').style.display = 'flex';
            this.callActive = true;
            
        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول للكاميرا');
        }
    }

    // بدء مكالمة صوتية
    async startVoiceCall(friendId) {
        this.currentFriendId = friendId;
        
        try {
            // طلب الميكروفون فقط
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });

            // إخفاء الفيديو المحلي
            const localVideo = document.getElementById('localVideo');
            if (localVideo) localVideo.style.display = 'none';

            // إنشاء اتصال
            await this.createConnection();
            
            // إظهار شاشة المكالمة
            document.getElementById('videoContainer').style.display = 'flex';
            this.callActive = true;
            
        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول للميكروفون');
        }
    }

    // إنشاء اتصال WebRTC
    async createConnection() {
        // إعداد STUN servers (مجانية)
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(configuration);

        // إضافة الوسائط المحلية
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });

        // استقبال الوسائط البعيدة
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = this.remoteStream;
            }
        };

        // مراقبة حالة الاتصال
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('📡 حالة الاتصال:', this.peerConnection.iceConnectionState);
            
            if (this.peerConnection.iceConnectionState === 'connected') {
                console.log('✅ تم الاتصال بنجاح');
            } else if (this.peerConnection.iceConnectionState === 'disconnected') {
                console.log('❌ انقطع الاتصال');
                this.endCall();
            }
        };

        // مراقبة ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        // إنشاء عرض الاتصال
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        // إرسال العرض
        await this.sendSignal({
            type: 'offer',
            offer: offer
        });

        // الاستماع للإشارات
        this.listenForSignals();
    }

    // إرسال إشارة عبر Firebase
    async sendSignal(signal) {
        if (!this.currentFriendId) return;

        await window.db.collection('calls').add({
            from: window.auth.currentUser.uid,
            to: this.currentFriendId,
            signal: signal,
            timestamp: new Date()
        });
    }

    // الاستماع للإشارات
    listenForSignals() {
        if (!this.currentFriendId) return;

        window.db.collection('calls')
            .where('to', '==', window.auth.currentUser.uid)
            .where('from', '==', this.currentFriendId)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        await this.handleSignal(data.signal, change.doc.id);
                    }
                });
            });
    }

    // معالجة الإشارات
    async handleSignal(signal, signalId) {
        try {
            if (signal.type === 'offer') {
                await this.handleOffer(signal.offer);
            } else if (signal.type === 'answer') {
                await this.handleAnswer(signal.answer);
            } else if (signal.type === 'candidate') {
                await this.handleCandidate(signal.candidate);
            }
            
            // حذف الإشارة بعد معالجتها
            await window.db.collection('calls').doc(signalId).delete();
            
        } catch (error) {
            console.error('خطأ في معالجة الإشارة:', error);
        }
    }

    // معالجة عرض وارد
    async handleOffer(offer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        
        await this.sendSignal({
            type: 'answer',
            answer: answer
        });
    }

    // معالجة إجابة
    async handleAnswer(answer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    // معالجة ICE candidate
    async handleCandidate(candidate) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    // إنهاء المكالمة
    endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        document.getElementById('videoContainer').style.display = 'none';
        document.getElementById('localVideo').style.display = 'block';
        
        this.remoteStream = null;
        this.callActive = false;
        this.currentFriendId = null;
    }

    // كتم/تشغيل الميكروفون
    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
            }
        }
    }

    // تشغيل/إيقاف الكاميرا
    toggleCamera() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
            }
        }
    }
}

// تهيئة النظام
const p2pCall = new P2PCallSystem();

// دوال عامة
window.startVideoCall = function() {
    if (ChatSystem.currentChat) {
        p2pCall.startVideoCall(ChatSystem.currentChat);
    } else {
        alert('لا توجد محادثة مفتوحة');
    }
};

window.startVoiceCall = function() {
    if (ChatSystem.currentChat) {
        p2pCall.startVoiceCall(ChatSystem.currentChat);
    } else {
        alert('لا توجد محادثة مفتوحة');
    }
};

window.endCall = function() {
    p2pCall.endCall();
};

window.toggleMute = function() {
    p2pCall.toggleMute();
};

window.toggleCamera = function() {
    p2pCall.toggleCamera();
};
