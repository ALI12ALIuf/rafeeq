// js/p2p.js - نظام اتصال P2P متكامل مع Firebase

class P2PCallSystem {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.currentFriendId = null;
        this.callActive = false;
        this.callTimeout = null;
        this.incomingCallListener = null;
        
        console.log('✅ نظام P2P جاهز');
        
        // بدء الاستماع للمكالمات الواردة
        this.listenForIncomingCalls();
    }

    // الاستماع للمكالمات الواردة
    listenForIncomingCalls() {
        if (!window.auth?.currentUser) return;
        
        const myId = window.auth.currentUser.uid;
        
        this.incomingCallListener = window.db.collection('calls')
            .where('to', '==', myId)
            .where('status', '==', 'calling')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const call = change.doc.data();
                        this.handleIncomingCall(call, change.doc.id);
                    }
                });
            });
    }

    // معالجة مكالمة واردة
    async handleIncomingCall(call, callId) {
        // اهتزاز إذا كان مدعوم
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500, 1000]);
        }
        
        // إشعار
        if (Notification.permission === 'granted') {
            new Notification('📞 مكالمة واردة', {
                body: call.type === 'video' ? 'مكالمة فيديو' : 'مكالمة صوتية',
                icon: '/icon.png'
            });
        }
        
        // جلب اسم المتصل
        const userDoc = await window.db.collection('users').doc(call.from).get();
        const callerName = userDoc.exists ? userDoc.data().name : 'شخص';
        
        const answer = confirm(`📞 مكالمة ${call.type === 'video' ? 'فيديو' : 'صوتية'} واردة من ${callerName}. هل تريد الرد؟`);
        
        if (answer) {
            // حذف إشارة المكالمة
            await window.db.collection('calls').doc(callId).delete();
            
            // بدء المكالمة
            if (call.type === 'video') {
                await this.startVideoCall(call.from, true);
            } else {
                await this.startVoiceCall(call.from, true);
            }
        } else {
            // رفض المكالمة
            await window.db.collection('calls').doc(callId).update({
                status: 'rejected'
            });
        }
    }

    // بدء مكالمة فيديو
    async startVideoCall(friendId, isAnswer = false) {
        this.currentFriendId = friendId;
        console.log('📹 بدء مكالمة فيديو مع:', friendId);
        
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

            // إعداد اتصال WebRTC
            await this.setupPeerConnection();
            
            // إضافة الوسائط المحلية
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // إظهار شاشة المكالمة
            document.getElementById('videoContainer').style.display = 'flex';
            
            if (!isAnswer) {
                // إنشاء عرض الاتصال
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                
                // إرسال العرض عبر Firebase
                await this.sendSignal({
                    type: 'offer',
                    offer: offer,
                    from: window.auth.currentUser.uid,
                    to: friendId
                });
            }
            
            this.callActive = true;
            
            // مهلة 30 ثانية
            this.callTimeout = setTimeout(() => {
                if (this.callActive && !this.peerConnection?.remoteDescription) {
                    this.endCall();
                    alert('⏰ لم يتم الرد على المكالمة');
                }
            }, 30000);
            
        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول للكاميرا');
        }
    }

    // بدء مكالمة صوتية
    async startVoiceCall(friendId, isAnswer = false) {
        this.currentFriendId = friendId;
        console.log('🎤 بدء مكالمة صوتية مع:', friendId);
        
        try {
            // طلب الميكروفون فقط
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });

            // إخفاء الفيديو المحلي
            const localVideo = document.getElementById('localVideo');
            if (localVideo) localVideo.style.display = 'none';

            // إعداد اتصال WebRTC
            await this.setupPeerConnection();
            
            // إضافة الوسائط المحلية
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // إظهار شاشة المكالمة
            document.getElementById('videoContainer').style.display = 'flex';
            
            if (!isAnswer) {
                // إنشاء عرض الاتصال
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                
                // إرسال العرض عبر Firebase
                await this.sendSignal({
                    type: 'offer',
                    offer: offer,
                    from: window.auth.currentUser.uid,
                    to: friendId
                });
            }
            
            this.callActive = true;
            
            // مهلة 30 ثانية
            this.callTimeout = setTimeout(() => {
                if (this.callActive && !this.peerConnection?.remoteDescription) {
                    this.endCall();
                    alert('⏰ لم يتم الرد على المكالمة');
                }
            }, 30000);
            
        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول للميكروفون');
        }
    }

    // إعداد اتصال WebRTC
    async setupPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(configuration);

        // استقبال الوسائط البعيدة
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = this.remoteStream;
            }
        };

        // مراقبة ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({
                    type: 'candidate',
                    candidate: event.candidate,
                    from: window.auth.currentUser.uid,
                    to: this.currentFriendId
                });
            }
        };

        // مراقبة حالة الاتصال
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('📡 حالة الاتصال:', this.peerConnection.iceConnectionState);
            
            if (this.peerConnection.iceConnectionState === 'connected') {
                console.log('✅ تم الاتصال بنجاح');
                if (this.callTimeout) {
                    clearTimeout(this.callTimeout);
                }
            } else if (this.peerConnection.iceConnectionState === 'disconnected') {
                console.log('❌ انقطع الاتصال');
                this.endCall();
            }
        };

        // الاستماع للإشارات
        this.listenForSignals();
    }

    // الاستماع للإشارات
    listenForSignals() {
        if (!window.auth?.currentUser) return;
        
        const myId = window.auth.currentUser.uid;
        
        window.db.collection('signals')
            .where('to', '==', myId)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const signal = change.doc.data();
                        await this.handleSignal(signal, change.doc.id);
                    }
                });
            });
    }

    // إرسال إشارة
    async sendSignal(signal) {
        await window.db.collection('signals').add({
            ...signal,
            timestamp: new Date()
        });
    }

    // معالجة الإشارات
    async handleSignal(signal, signalId) {
        try {
            if (signal.type === 'offer') {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
                
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                
                await this.sendSignal({
                    type: 'answer',
                    answer: answer,
                    from: window.auth.currentUser.uid,
                    to: signal.from
                });
                
            } else if (signal.type === 'answer') {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
                
            } else if (signal.type === 'candidate') {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
            
            // حذف الإشارة بعد معالجتها
            await window.db.collection('signals').doc(signalId).delete();
            
        } catch (error) {
            console.error('خطأ في معالجة الإشارة:', error);
        }
    }

    // إنهاء المكالمة
    endCall() {
        console.log('📞 إنهاء المكالمة');
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.callTimeout) {
            clearTimeout(this.callTimeout);
        }
        
        document.getElementById('videoContainer').style.display = 'none';
        document.getElementById('localVideo').style.display = 'block';
        
        this.callActive = false;
        this.remoteStream = null;
    }

    // كتم الميكروفون
    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                // تحديث الأيقونة
                const btn = document.querySelector('.call-controls button:nth-child(2) i');
                if (btn) {
                    btn.className = audioTrack.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
                }
            }
        }
    }

    // تشغيل/إيقاف الكاميرا
    toggleCamera() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                // تحديث الأيقونة
                const btn = document.querySelector('.call-controls button:nth-child(3) i');
                if (btn) {
                    btn.className = videoTrack.enabled ? 'fas fa-video' : 'fas fa-video-slash';
                }
            }
        }
    }
}
