// ========== نظام P2P والاتصال المباشر ==========

class P2PManager {
    constructor() {
        this.currentUserId = null;
        this.activeConnections = new Map(); // peerId -> RTCPeerConnection
        this.dataChannels = new Map(); // peerId -> RTCDataChannel
        this.messageHandlers = new Map(); // peerId -> handler
        this.reconnectAttempts = new Map(); // peerId -> attempts
    }

    // تهيئة المدير
    init(userId) {
        this.currentUserId = userId;
        
        // استماع للإشارات الواردة
        window.signaling.on('offer', this.handleOffer.bind(this));
        window.signaling.on('answer', this.handleAnswer.bind(this));
        window.signaling.on('ice-candidate', this.handleIceCandidate.bind(this));
    }

    // بدء اتصال مع مستخدم آخر
    async startConnection(peerId, onMessage) {
        if (this.activeConnections.has(peerId)) {
            console.log('Connection already exists:', peerId);
            return this.activeConnections.get(peerId);
        }

        this.messageHandlers.set(peerId, onMessage);

        // إنشاء اتصال جديد
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        });

        // إنشاء قناة بيانات
        const dataChannel = peerConnection.createDataChannel('chat', {
            ordered: true,
            maxRetransmits: 3
        });

        this.setupDataChannel(dataChannel, peerId);
        this.setupPeerConnection(peerConnection, peerId);

        // إنشاء عرض (offer)
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // إرسال العرض عبر نظام الإشارات
        await window.signaling.sendConnectionRequest(peerId, {
            sdp: offer.sdp,
            type: offer.type
        });

        this.activeConnections.set(peerId, peerConnection);
        this.dataChannels.set(peerId, dataChannel);

        return peerConnection;
    }

    // معالجة عرض واردة
    async handleOffer(fromId, offerData) {
        console.log('📞 Handling offer from:', fromId);

        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        peerConnection.ondatachannel = (event) => {
            const dataChannel = event.channel;
            this.setupDataChannel(dataChannel, fromId);
            this.dataChannels.set(fromId, dataChannel);
        };

        this.setupPeerConnection(peerConnection, fromId);

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offerData));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        await window.signaling.sendConnectionAnswer(fromId, {
            sdp: answer.sdp,
            type: answer.type
        });

        this.activeConnections.set(fromId, peerConnection);
    }

    // معالجة الرد على العرض
    async handleAnswer(fromId, answerData) {
        const peerConnection = this.activeConnections.get(fromId);
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answerData));
            console.log('✅ Connection established with:', fromId);
            
            // إشعار بأن الاتصال جاهز
            const handler = this.messageHandlers.get(fromId);
            if (handler && handler.onReady) {
                handler.onReady();
            }
        }
    }

    // معالجة مرشحات ICE
    async handleIceCandidate(fromId, candidateData) {
        const peerConnection = this.activeConnections.get(fromId);
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        }
    }

    // إعداد قناة البيانات
    setupDataChannel(dataChannel, peerId) {
        dataChannel.onopen = () => {
            console.log('🔓 Data channel opened with:', peerId);
            this.reconnectAttempts.delete(peerId);
            
            const handler = this.messageHandlers.get(peerId);
            if (handler && handler.onOpen) {
                handler.onOpen();
            }
        };

        dataChannel.onclose = () => {
            console.log('🔒 Data channel closed with:', peerId);
            
            // محاولة إعادة الاتصال
            this.attemptReconnection(peerId);
        };

        dataChannel.onerror = (error) => {
            console.error('Data channel error:', error);
        };

        dataChannel.onmessage = async (event) => {
            const handler = this.messageHandlers.get(peerId);
            if (handler && handler.onMessage) {
                await handler.onMessage(event.data);
            }
        };
    }

    // إعداد اتصال الـ PeerConnection
    setupPeerConnection(peerConnection, peerId) {
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                window.signaling.sendIceCandidate(peerId, event.candidate);
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log(`ICE state for ${peerId}: ${peerConnection.iceConnectionState}`);
            
            if (peerConnection.iceConnectionState === 'failed') {
                this.attemptReconnection(peerId);
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log(`Connection state for ${peerId}: ${peerConnection.connectionState}`);
        };
    }

    // إرسال رسالة عبر الاتصال المباشر
    async sendMessage(peerId, message) {
        const dataChannel = this.dataChannels.get(peerId);
        
        if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(message);
            return true;
        }
        
        console.warn('Cannot send message, channel not open');
        return false;
    }

    // محاولة إعادة الاتصال
    async attemptReconnection(peerId) {
        const attempts = this.reconnectAttempts.get(peerId) || 0;
        
        if (attempts >= 5) {
            console.error('Max reconnection attempts reached for:', peerId);
            return;
        }

        this.reconnectAttempts.set(peerId, attempts + 1);
        
        setTimeout(async () => {
            console.log(`Attempting reconnection ${attempts + 1} for:`, peerId);
            
            // إغلاق الاتصال القديم
            const oldConnection = this.activeConnections.get(peerId);
            if (oldConnection) {
                oldConnection.close();
            }
            
            // إعادة الاتصال
            const handler = this.messageHandlers.get(peerId);
            if (handler) {
                await this.startConnection(peerId, handler);
            }
        }, 2000 * attempts);
    }

    // إغلاق الاتصال
    closeConnection(peerId) {
        const peerConnection = this.activeConnections.get(peerId);
        if (peerConnection) {
            peerConnection.close();
            this.activeConnections.delete(peerId);
            this.dataChannels.delete(peerId);
            console.log('Connection closed with:', peerId);
        }
    }

    // التحقق من حالة الاتصال
    isConnected(peerId) {
        const dataChannel = this.dataChannels.get(peerId);
        return dataChannel && dataChannel.readyState === 'open';
    }
}

// إنشاء نسخة عامة
window.p2pManager = new P2PManager();
console.log('✅ P2P manager initialized');
