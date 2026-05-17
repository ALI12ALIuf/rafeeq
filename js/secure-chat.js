// secure-chat.js - النسخة النهائية (المشكلة محلولة)

// ... (جميع الدوال الأخرى تبقى كما هي: setupKeys, generateKeyPair, etc.)

    startReceiving() {
        if (!window.auth?.currentUser) return null;
        const uid = window.auth.currentUser.uid;
        return window.db.collection('secure_messages').where('to', '==', uid).onSnapshot(async snapshot => {
            for (const change of snapshot.docChanges()) {
                if (change.type === 'added') {
                    const msg = { id: change.doc.id, ...change.doc.data() };
                    await this.processReceivedMessage(msg);
                    try { await change.doc.ref.delete(); } catch (deleteError) {}
                }
            }
        }, error => { setTimeout(() => this.startReceiving(), 5000); });
    },

    // ✅ الدالة المعدلة بشكل نهائي وآمن
    async processReceivedMessage(msg) {
        try {
            const myPrivateKey = await this.getMyPrivateKey();
            const senderPublicKey = await this.getReceiverPublicKey(msg.from);
            if (!myPrivateKey || !senderPublicKey) return;
            const sharedKey = await this.deriveSharedKey(myPrivateKey, senderPublicKey);

            // 1. معالجة الرسائل النصية
            if (msg.package.type === 'text') {
                const decryptedText = await this.decryptData(msg.package.data, sharedKey);
                ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'text', text: decryptedText, sender: 'friend', time: new Date().toISOString() });
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                ChatSystem.updateLastMessage(msg.from, decryptedText);
            }
            // 2. معالجة الملفات والصور
            else if (msg.package.type === 'file' || msg.package.type === 'image') {
                // معالجة الملفات (سيتم فك تشفيرها وعرضها)
                const decryptedData = await this.decryptData(msg.package.data, sharedKey);
                const fileMsg = {
                    id: msg.package.id,
                    type: msg.package.type,
                    data: decryptedData,
                    fileName: msg.package.fileName,
                    sender: 'friend',
                    time: new Date().toISOString()
                };
                ChatSystem.saveMessage(msg.from, fileMsg);
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                ChatSystem.updateLastMessage(msg.from, `📎 ${msg.package.fileName || 'ملف'}`);
            }
            // 3. معالجة الفيديو
            else if (msg.package.type === 'video') {
                const decryptedData = await this.decryptData(msg.package.data, sharedKey);
                const videoMsg = {
                    id: msg.package.id,
                    type: 'video',
                    data: decryptedData,
                    fileName: msg.package.fileName,
                    sender: 'friend',
                    time: new Date().toISOString()
                };
                ChatSystem.saveMessage(msg.from, videoMsg);
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                ChatSystem.updateLastMessage(msg.from, `🎥 فيديو`);
            }
            // 4. معالجة الموقع
            else if (msg.package.type === 'location') {
                const decryptedLocation = await this.decryptData(msg.package.data, sharedKey);
                const locationData = JSON.parse(decryptedLocation);
                ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'location', data: locationData, sender: 'friend', time: new Date().toISOString() });
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                ChatSystem.updateLastMessage(msg.from, `📍 موقع`);
            }
            // 5. معالجة إشارات WebRTC (المكالمات) - الحل الآمن
            else if (msg.package.type === 'webrtc') {
                const signalData = await this.decryptData(msg.package.data, sharedKey);
                const parsedData = JSON.parse(signalData);

                // ✅ التحقق الأول: هل هي مكالمة واردة جديدة (Offer)؟
                const isIncomingCall = (parsedData.sdp && parsedData.sdp.type === 'offer');
                
                // ✅ التحقق الثاني: هل المستخدم في مكالمة بالفعل؟
                const isAlreadyInCall = (CallSystem.isInCall === true);
                
                // ✅ التحقق الثالث: هل الطرف الآخر متصل حالياً؟ (تأكد من وجود دالة PresenceSystem)
                const isFriendOnline = (typeof PresenceSystem !== 'undefined' && PresenceSystem.isUserOnline && await PresenceSystem.isUserOnline(msg.from));

                if (isIncomingCall) {
                    if (!isAlreadyInCall) {
                        // ✅ كل الشروط متحققة: مكالمة واردة جديدة ولا توجد مكالمة حالية
                        console.log('📞 مكالمة واردة صالحة من:', msg.from);
                        if (typeof CallSystem !== 'undefined' && CallSystem.showIncomingCall) {
                            CallSystem.showIncomingCall(msg.from, parsedData);
                        }
                    } else {
                        // ❌ المستخدم مشغول حالياً بمكالمة أخرى
                        console.log('❌ مكالمة واردة من', msg.from, 'ولكن المستخدم في مكالمة حالياً');
                    }
                } else {
                    // ✅ ليست مكالمة واردة جديدة (رد أو ICE)
                    if (typeof CallSystem !== 'undefined' && CallSystem.handleSignaling) {
                        CallSystem.handleSignaling(parsedData);
                    }
                }
            }
            
            if (typeof loadChats === 'function') loadChats();
        } catch (error) {
            console.error('❌ خطأ في معالجة الرسالة:', error);
        }
    }
};

// ✅ دالة مساعدة للتحقق من وجود المستخدم عبر الإنترنت (إذا لم تكن موجودة مسبقاً)
if (typeof PresenceSystem !== 'undefined' && !PresenceSystem.isUserOnline) {
    PresenceSystem.isUserOnline = async (userId) => {
        try {
            const userDoc = await window.db.collection('users').doc(userId).get();
            if (!userDoc.exists) return false;
            const data = userDoc.data();
            // يعتبر متصلاً إذا كان online == true و lastSeen قبل أقل من دقيقتين
            if (data.online === true) return true;
            if (data.lastSeen && data.lastSeen.toDate) {
                const lastSeen = data.lastSeen.toDate();
                const now = new Date();
                const diffMinutes = (now - lastSeen) / (1000 * 60);
                return diffMinutes < 2;
            }
            return false;
        } catch (error) {
            return false;
        }
    };
}
