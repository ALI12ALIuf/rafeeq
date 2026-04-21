// ========== نظام الإشارات (Signaling) ==========

class SignalingSystem {
    constructor() {
        this.currentUserId = null;
        this.pendingSignals = new Map();
        this.listeners = new Map();
    }

    // تهيئة النظام
    init(userId) {
        this.currentUserId = userId;
        this.listenForSignals();
    }

    // إرسال إشارة لمستخدم معين
    async sendSignal(receiverId, signalType, signalData) {
        if (!this.currentUserId) {
            console.error('No user ID set');
            return false;
        }

        const signalId = `${Date.now()}_${Math.random()}`;
        
        try {
            await window.db.collection('signals').doc(signalId).set({
                from: this.currentUserId,
                to: receiverId,
                type: signalType,  // 'offer', 'answer', 'ice-candidate'
                data: signalData,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                expires: new Date(Date.now() + 2 * 60 * 1000) // تنتهي بعد دقيقتين
            });
            
            console.log(`📡 Signal sent: ${signalType} to ${receiverId}`);
            return true;
        } catch (error) {
            console.error('Error sending signal:', error);
            return false;
        }
    }

    // الاستماع للإشارات الواردة
    listenForSignals() {
        if (!this.currentUserId) return;

        window.db.collection('signals')
            .where('to', '==', this.currentUserId)
            .where('expires', '>', new Date())
            .onSnapshot(async (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const signal = change.doc.data();
                        console.log(`📡 Signal received: ${signal.type} from ${signal.from}`);
                        
                        // معالجة الإشارة
                        await this.handleSignal(signal);
                        
                        // حذف الإشارة بعد معالجتها
                        setTimeout(async () => {
                            await change.doc.ref.delete();
                        }, 1000);
                    }
                });
            }, (error) => {
                console.error('Signal listener error:', error);
            });
    }

    // معالجة الإشارة الواردة
    async handleSignal(signal) {
        const handler = this.listeners.get(signal.type);
        if (handler) {
            await handler(signal.from, signal.data);
        } else {
            console.warn(`No handler for signal type: ${signal.type}`);
        }
    }

    // تسجيل معالج للإشارات
    on(signalType, handler) {
        this.listeners.set(signalType, handler);
    }

    // إرسال طلب اتصال
    async sendConnectionRequest(receiverId, offer) {
        return this.sendSignal(receiverId, 'offer', {
            offer: offer,
            senderPublicKey: await window.cryptoSystem.exportPublicKey(
                window.cryptoSystem.keyPairs.get(this.currentUserId).publicKey
            )
        });
    }

    // الرد على طلب اتصال
    async sendConnectionAnswer(receiverId, answer) {
        return this.sendSignal(receiverId, 'answer', {
            answer: answer
        });
    }

    // إرسال مرشح ICE
    async sendIceCandidate(receiverId, candidate) {
        return this.sendSignal(receiverId, 'ice-candidate', {
            candidate: candidate
        });
    }

    // تنظيف الإشارات القديمة
    async cleanupOldSignals() {
        const cutoff = new Date(Date.now() - 5 * 60 * 1000);
        const oldSignals = await window.db.collection('signals')
            .where('expires', '<', cutoff)
            .get();
        
        oldSignals.forEach(async (doc) => {
            await doc.ref.delete();
        });
    }
}

// إنشاء نسخة عامة
window.signaling = new SignalingSystem();
console.log('✅ Signaling system initialized');
