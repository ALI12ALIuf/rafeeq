// ========== chat-system.js ==========
// نظام الدردشة E2EE + نظام الحضور Presence

const PresenceSystem = {
    listeners: {}, heartbeatInterval: null,
    async setOnline() { if (!window.auth?.currentUser) return; try { await window.db.collection('users').doc(window.auth.currentUser.uid).update({ online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); this.startHeartbeat(); } catch (e) {} },
    async setOffline() { if (!window.auth?.currentUser) return; try { await window.db.collection('users').doc(window.auth.currentUser.uid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); this.stopHeartbeat(); } catch (e) {} },
    startHeartbeat() { this.stopHeartbeat(); this.heartbeatInterval = setInterval(() => { if (window.auth?.currentUser) window.db.collection('users').doc(window.auth.currentUser.uid).update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {}); }, 30000); },
    stopHeartbeat() { if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; } },
    watchFriend(friendId) { if (!friendId) return; if (this.listeners[friendId]) this.listeners[friendId](); this.listeners[friendId] = window.db.collection('users').doc(friendId).onSnapshot(doc => { if (doc.exists) ChatSystem.updateFriendStatus(friendId, doc.data().online === true, doc.data()); else ChatSystem.updateFriendStatus(friendId, false); }, () => {}); },
    stopAll() { Object.values(this.listeners).forEach(unsub => { if (typeof unsub === 'function') unsub(); }); this.listeners = {}; this.stopHeartbeat(); }
};

const ChatSystem = {
    currentChat: null, messages: {}, friendOnline: false,
    friendInConversation: false,
    _pendingConversationStatus: {},
    
    featuresEnabled: false,
    featureRequestPending: false,
    featureRequestReceived: false,
    featureBlinkInterval: null,
    
    // ✅ متغيرات مراقبة نبضات القلب
    heartbeatTimer: null,
    HEARTBEAT_TIMEOUT_NORMAL: 10000,     // 10 ثواني عادي
    HEARTBEAT_TIMEOUT_SELECTING: 60000,  // 60 ثانية أثناء اختيار ملف
    currentHeartbeatTimeout: 10000,
    
    init() { 
        this.loadAllChats(); 
        this.setupPageFocusListener();
        this.setupFeatureButton();
        this.setupBeforeUnloadListener();
    },
    
    // ✅ بدء مراقبة نبضات القلب
    startHeartbeatWatcher() {
        if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = setTimeout(() => {
            console.log('💔 انقطاع نبضات الطرف الآخر لأكثر من ' + (this.currentHeartbeatTimeout / 1000) + ' ثانية - خروج نهائي');
            if (this.featuresEnabled && this.currentChat) {
                console.log('🔴 إلغاء تفعيل الميزات بسبب انقطاع النبضات');
                this.featuresEnabled = false;
                this.featureRequestPending = false;
                this.featureRequestReceived = false;
                
                if (this.featureBlinkInterval) {
                    clearInterval(this.featureBlinkInterval);
                    this.featureBlinkInterval = null;
                }
                
                const btn = document.getElementById('enableFeaturesBtn');
                if (btn) {
                    btn.style.background = '#f44336';
                    btn.title = 'تفعيل الميزات';
                }
                
                this.updateAllButtons();
            }
        }, this.currentHeartbeatTimeout);
    },
    
    // ✅ إعادة تعيين مراقبة النبضات (عند استلام نبضة جديدة)
    resetHeartbeatWatcher() {
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.startHeartbeatWatcher();
        }
    },
    
    // ✅ تمديد مهلة النبضات (أثناء اختيار ملف)
    extendHeartbeatTimeout() {
        console.log('⏰ تمديد مهلة النبضات إلى 60 ثانية (الطرف الآخر يختار ملفاً)');
        this.currentHeartbeatTimeout = this.HEARTBEAT_TIMEOUT_SELECTING;
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.startHeartbeatWatcher();
        }
    },
    
    // ✅ إعادة المهلة إلى الوضع الطبيعي
    resetHeartbeatToNormal() {
        console.log('⏰ إعادة مهلة النبضات إلى 10 ثواني');
        this.currentHeartbeatTimeout = this.HEARTBEAT_TIMEOUT_NORMAL;
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.startHeartbeatWatcher();
        }
    },
    
    // ✅ إيقاف مراقبة النبضات (عند إغلاق القناة)
    stopHeartbeatWatcher() {
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    },
    
    setupBeforeUnloadListener() {
        window.addEventListener('beforeunload', () => {
            if (this.currentChat && this.featuresEnabled) {
                console.log('🚪 الصفحة تغلق - إرسال إشارة إلغاء إلى:', this.currentChat);
                this.sendFeatureCancelBeforeUnload(this.currentChat);
            }
        });
    },
    
    async sendFeatureCancelBeforeUnload(chatId) {
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(chatId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ 
                type: 'feature_cancel',
                timestamp: Date.now()
            }), sharedKey);
            
            const messageData = {
                to: chatId,
                from: window.auth?.currentUser?.uid,
                package: { 
                    id: Date.now().toString(), 
                    type: 'feature_cancel', 
                    data: encrypted, 
                    timestamp: Date.now() 
                },
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + SecureChatSystem.MESSAGE_EXPIRY_HOURS * 3600000))
            };
            
            await window.db.collection('secure_messages').add(messageData);
            console.log('✅ تم إرسال إشارة الإلغاء قبل إغلاق الصفحة');
        } catch(e) {
            console.error('❌ فشل إرسال إشارة الإلغاء قبل الإغلاق:', e);
        }
    },
    
    setupFeatureButton() {
        setTimeout(() => {
            let btn = document.getElementById('enableFeaturesBtn');
            if (!btn) {
                const container = document.querySelector('.chat-actions, .message-input-container, .chat-footer, #conversationPage');
                if (container) {
                    btn = document.createElement('button');
                    btn.id = 'enableFeaturesBtn';
                    btn.innerHTML = '🔓';
                    btn.title = 'تفعيل الميزات (اتصال، صور، ملفات)';
                    btn.style.cssText = `
                        width: 45px;
                        height: 45px;
                        border-radius: 50%;
                        background: #f44336;
                        border: none;
                        cursor: pointer;
                        margin: 0 5px;
                        font-size: 1.2rem;
                        transition: all 0.3s ease;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    `;
                    btn.onclick = () => {
                        console.log('🔘 تم الضغط على الزر');
                        console.log('featureRequestReceived:', this.featureRequestReceived);
                        console.log('featureRequestPending:', this.featureRequestPending);
                        console.log('featuresEnabled:', this.featuresEnabled);
                        
                        if (this.featureRequestReceived) {
                            console.log('✅ قبول الطلب');
                            this.acceptFeatureRequest();
                        } else if (this.featuresEnabled) {
                            console.log('⚠️ الميزات مفعلة بالفعل');
                            alert('الميزات مفعلة بالفعل');
                        } else if (this.featureRequestPending) {
                            console.log('⏳ طلب قيد الانتظار');
                            alert('تم إرسال طلب سابق، انتظر رد الطرف الآخر');
                        } else {
                            console.log('📨 إرسال طلب جديد');
                            this.requestEnableFeatures();
                        }
                    };
                    container.appendChild(btn);
                    console.log('✅ تم إضافة زر التفعيل');
                } else {
                    console.log('⚠️ لم يتم العثور على حاوية للزر');
                }
            }
        }, 1000);
    },
    
    startFeatureBlink() {
        if (this.featureBlinkInterval) clearInterval(this.featureBlinkInterval);
        
        const btn = document.getElementById('enableFeaturesBtn');
        if (!btn) return;
        
        let blinkCount = 0;
        this.featureBlinkInterval = setInterval(() => {
            if (!this.featureRequestPending && !this.featureRequestReceived) {
                clearInterval(this.featureBlinkInterval);
                btn.style.background = '#f44336';
                btn.style.transform = 'scale(1)';
                return;
            }
            
            blinkCount++;
            if (blinkCount % 2 === 0) {
                btn.style.background = '#2196F3';
                btn.style.transform = 'scale(1.1)';
            } else {
                btn.style.background = '#4CAF50';
                btn.style.transform = 'scale(1)';
            }
            
            if (blinkCount > 30) {
                clearInterval(this.featureBlinkInterval);
                this.featureRequestPending = false;
                this.featureRequestReceived = false;
                btn.style.background = '#f44336';
                btn.style.transform = 'scale(1)';
            }
        }, 500);
    },
    
    async requestEnableFeatures() {
        if (!this.currentChat) {
            alert('الرجاء اختيار محادثة أولاً');
            return;
        }
        if (this.featuresEnabled) {
            alert('الميزات مفعلة بالفعل');
            return;
        }
        if (this.featureRequestPending) {
            alert('تم إرسال طلب سابق، انتظر رد الطرف الآخر');
            return;
        }
        
        this.featureRequestPending = true;
        this.startFeatureBlink();
        
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ 
                type: 'feature_request',
                action: 'enable',
                timestamp: Date.now()
            }), sharedKey);
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: Date.now().toString(), 
                type: 'feature_request', 
                data: encrypted, 
                timestamp: Date.now() 
            });
            console.log('📨 تم إرسال طلب تفعيل الميزات إلى الطرف الآخر');
        } catch(e) {
            this.featureRequestPending = false;
            this.startFeatureBlink();
            console.log('❌ فشل إرسال الطلب');
        }
    },
    
    async handleFeatureRequest(fromId) {
        console.log('🔔 handleFeatureRequest - استلام طلب من:', fromId);
        
        if (this.featuresEnabled) {
            console.log('الميزات مفعلة بالفعل، قبول تلقائي');
            await this.acceptFeatureRequest();
            return;
        }
        
        this.featureRequestReceived = true;
        this.startFeatureBlink();
        console.log('📞 شخص يريد تفعيل الميزات - اضغط على الدائرة الحمراء');
        console.log('✅ تم تفعيل وضع الاستقبال');
    },
    
    async acceptFeatureRequest() {
        console.log('🔍 acceptFeatureRequest - بدء التنفيذ');
        
        if (!this.featureRequestReceived && !this.featureRequestPending) {
            console.log('⚠️ لا يوجد طلب معلق');
            return;
        }
        
        this.featuresEnabled = true;
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        
        console.log('✅ featuresEnabled =', this.featuresEnabled);
        
        if (this.featureBlinkInterval) {
            clearInterval(this.featureBlinkInterval);
            this.featureBlinkInterval = null;
        }
        
        const btn = document.getElementById('enableFeaturesBtn');
        if (btn) {
            btn.style.background = '#4CAF50';
            btn.style.transform = 'scale(1)';
            btn.title = 'الميزات مفعلة ✅';
            console.log('✅ تم تغيير لون الزر إلى الأخضر');
        } else {
            console.log('⚠️ لم يتم العثور على الزر');
        }
        
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ 
                type: 'feature_response',
                action: 'accepted',
                timestamp: Date.now()
            }), sharedKey);
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: Date.now().toString(), 
                type: 'feature_response', 
                data: encrypted, 
                timestamp: Date.now() 
            });
            console.log('✅ تم إرسال قبول التفعيل');
        } catch(e) {
            console.error('❌ خطأ في إرسال القبول:', e);
        }
        
        this.updateAllButtons();
        console.log('✅ تم تفعيل الميزات! يمكنك الآن استخدام الاتصال وإرسال الملفات');
        console.log('✅ acceptFeatureRequest - انتهى التنفيذ');
    },
    
    async rejectFeatureRequest() {
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        
        if (this.featureBlinkInterval) {
            clearInterval(this.featureBlinkInterval);
        }
        
        const btn = document.getElementById('enableFeaturesBtn');
        if (btn) {
            btn.style.background = '#f44336';
        }
        
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ 
                type: 'feature_response',
                action: 'rejected',
                timestamp: Date.now()
            }), sharedKey);
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: Date.now().toString(), 
                type: 'feature_response', 
                data: encrypted, 
                timestamp: Date.now() 
            });
            console.log('❌ تم رفض الطلب');
        } catch(e) {}
    },
    
    handleFeatureResponse(fromId, action) {
        console.log('📨 handleFeatureResponse - from:', fromId, 'action:', action);
        
        if (action === 'accepted') {
            this.featuresEnabled = true;
            this.featureRequestPending = false;
            this.featureRequestReceived = false;
            
            if (this.featureBlinkInterval) {
                clearInterval(this.featureBlinkInterval);
            }
            
            const btn = document.getElementById('enableFeaturesBtn');
            if (btn) {
                btn.style.background = '#4CAF50';
                btn.title = 'الميزات مفعلة ✅';
            }
            
            this.updateAllButtons();
            console.log('✅ تم تفعيل الميزات!');
        } else if (action === 'rejected') {
            this.featureRequestPending = false;
            this.featureRequestReceived = false;
            
            if (this.featureBlinkInterval) {
                clearInterval(this.featureBlinkInterval);
            }
            
            const btn = document.getElementById('enableFeaturesBtn');
            if (btn) {
                btn.style.background = '#f44336';
            }
            console.log('❌ تم رفض طلب تفعيل الميزات');
        }
    },
    
    async sendFeatureCancelImmediately(chatId) {
        console.log('📤 sendFeatureCancelImmediately - إرسال إلغاء إلى:', chatId);
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(chatId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ 
                type: 'feature_cancel',
                timestamp: Date.now()
            }), sharedKey);
            await SecureChatSystem.sendToServer(chatId, { 
                id: Date.now().toString(), 
                type: 'feature_cancel', 
                data: encrypted, 
                timestamp: Date.now() 
            });
            console.log('✅ تم إرسال إشارة الإلغاء بنجاح إلى:', chatId);
        } catch(e) {
            console.error('❌ خطأ في إرسال الإلغاء:', e);
        }
    },
    
    resetFeatures() {
        console.log('🔄 resetFeatures - إعادة تعيين الميزات');
        
        const chatId = this.currentChat;
        
        this.featuresEnabled = false;
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        
        if (this.featureBlinkInterval) {
            clearInterval(this.featureBlinkInterval);
        }
        
        const btn = document.getElementById('enableFeaturesBtn');
        if (btn) {
            btn.style.background = '#f44336';
            btn.title = 'تفعيل الميزات';
        }
        
        if (chatId) {
            console.log('📤 إرسال إشارة إلغاء فوراً إلى:', chatId);
            this.sendFeatureCancelImmediately(chatId);
        }
        
        this.updateAllButtons();
    },
    
    async sendFeatureCancelWithRetry(retryCount = 0) {
        const maxRetries = 3;
        console.log(`📤 sendFeatureCancel - محاولة ${retryCount + 1}/${maxRetries + 1} إلى:`, this.currentChat);
        
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!myPrivateKey || !receiverPublicKey) {
                if (retryCount < maxRetries) {
                    setTimeout(() => this.sendFeatureCancelWithRetry(retryCount + 1), 500);
                }
                return;
            }
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ 
                type: 'feature_cancel',
                timestamp: Date.now()
            }), sharedKey);
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: Date.now().toString(), 
                type: 'feature_cancel', 
                data: encrypted, 
                timestamp: Date.now() 
            });
            console.log('✅ تم إرسال إشارة الإلغاء بنجاح');
        } catch(e) {
            console.error('❌ خطأ في إرسال الإلغاء:', e);
            if (retryCount < maxRetries) {
                setTimeout(() => this.sendFeatureCancelWithRetry(retryCount + 1), 500);
            }
        }
    },
    
    handleFeatureCancel() {
        console.log('🔓 handleFeatureCancel - تم استلام إلغاء من الطرف الآخر');
        console.log('featuresEnabled قبيل الإلغاء:', this.featuresEnabled);
        
        this.featuresEnabled = false;
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        
        console.log('✅ featuresEnabled بعد الإلغاء:', this.featuresEnabled);
        
        if (this.featureBlinkInterval) {
            clearInterval(this.featureBlinkInterval);
            this.featureBlinkInterval = null;
        }
        
        const btn = document.getElementById('enableFeaturesBtn');
        if (btn) {
            btn.style.background = '#f44336';
            btn.title = 'تفعيل الميزات';
            console.log('✅ تم تغيير لون الزر إلى الأحمر');
        } else {
            console.log('⚠️ لم يتم العثور على الزر');
        }
        
        this.updateAllButtons();
        console.log('⚠️ الطرف الآخر خرج من المحادثة، تم إلغاء تفعيل الميزات');
        console.log('✅ handleFeatureCancel - انتهى, featuresEnabled =', this.featuresEnabled);
    },
    
    updateAllButtons() {
        const canUse = (this.friendInConversation && this.featuresEnabled);
        
        const btns = document.querySelectorAll('#attachmentMenu button[data-dc]');
        btns.forEach(btn => { 
            if (canUse) { 
                btn.classList.remove('locked'); 
                btn.title = ''; 
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            } else { 
                btn.classList.add('locked'); 
                btn.title = this.featuresEnabled ? 'غير متاح - الطرف الآخر ليس في المحادثة' : 'غير متاح - الميزات غير مفعلة';
                btn.style.opacity = '0.5';
                btn.style.pointerEvents = 'none';
            } 
        });
        
        const audioCallBtn = document.querySelector('[onclick="startAudioCall()"]') || 
                             document.querySelector('.audio-call-btn') ||
                             document.querySelector('#audioCallBtn') ||
                             document.querySelector('button[data-call="audio"]');
        
        const videoCallBtn = document.querySelector('[onclick="startVideoCall()"]') || 
                             document.querySelector('.video-call-btn') ||
                             document.querySelector('#videoCallBtn') ||
                             document.querySelector('button[data-call="video"]');
        
        if (audioCallBtn) {
            if (canUse) {
                audioCallBtn.style.opacity = '1';
                audioCallBtn.style.pointerEvents = 'auto';
                audioCallBtn.title = 'مكالمة صوتية';
            } else {
                audioCallBtn.style.opacity = '0.5';
                audioCallBtn.style.pointerEvents = 'none';
                audioCallBtn.title = this.featuresEnabled ? 'غير متاح - الطرف الآخر ليس في المحادثة' : 'غير متاح - الميزات غير مفعلة';
            }
        }
        
        if (videoCallBtn) {
            if (canUse) {
                videoCallBtn.style.opacity = '1';
                videoCallBtn.style.pointerEvents = 'auto';
                videoCallBtn.title = 'مكالمة فيديو';
            } else {
                videoCallBtn.style.opacity = '0.5';
                videoCallBtn.style.pointerEvents = 'none';
                videoCallBtn.title = this.featuresEnabled ? 'غير متاح - الطرف الآخر ليس في المحادثة' : 'غير متاح - الميزات غير مفعلة';
            }
        }
        
        console.log(`🎛️ تحديث الأزرار: friendInConversation=${this.friendInConversation}, featuresEnabled=${this.featuresEnabled}, canUse=${canUse}`);
    },
    
    setupPageFocusListener() {
        window.addEventListener('focus', () => {
            if (this.currentChat && this.friendOnline) {
                console.log('👁️ الصفحة في المقدمة - تحديث حالة المحادثة');
                this.sendConversationStatus(true);
                this.requestConversationStatus();
            }
        });
    },
    
    async requestConversationStatus() {
        if (!this.currentChat) return;
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ 
                type: 'conversation_status_request',
                timestamp: Date.now()
            }), sharedKey);
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: Date.now().toString(), 
                type: 'conversation_status_request', 
                data: encrypted, 
                timestamp: Date.now() 
            });
            console.log('📤 تم إرسال طلب حالة المحادثة إلى:', this.currentChat);
        } catch(e) {
            console.error('خطأ في طلب حالة المحادثة:', e);
        }
    },
    
    loadAllChats() { 
        for (let i = 0; i < localStorage.length; i++) { 
            const k = localStorage.key(i); 
            if (k && k.startsWith('chat_')) { 
                const fid = k.replace('chat_', ''); 
                try { this.messages[fid] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { this.messages[fid] = []; } 
            } 
        } 
    },
    
    showProgressBar(message, percent) {
        let bar = document.getElementById('progressBar');
        if (!bar) {
            bar = document.createElement('div'); bar.id = 'progressBar';
            bar.style.cssText = `
                position: fixed;
                top: 70px;
                left: 0;
                right: 0;
                height: 22px;
                background: rgba(0,0,0,0.3);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            bar.innerHTML = `
                <div id="progressFill" style="
                    background: linear-gradient(90deg, #4CAF50, #8BC34A);
                    height: 100%;
                    width: 0%;
                    position: absolute;
                    left: 0;
                    top: 0;
                    transition: width 0.3s;
                    border-radius: 0 2px 2px 0;
                "></div>
                <span id="progressPercent" style="
                    position: relative;
                    z-index: 2;
                    font-size: 12px;
                    font-weight: bold;
                    color: white;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                ">0%</span>
            `;
            document.body.appendChild(bar);
        }
    },
    
    updateProgressBar(percent, message) {
        const fill = document.getElementById('progressFill');
        const perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = Math.min(percent, 100) + '%';
        if (perc) perc.textContent = Math.round(percent) + '%';
    },
    
    hideProgressBar() { const bar = document.getElementById('progressBar'); if (bar) bar.remove(); },
    
    async sendConversationStatus(isOpen) {
        if (!this.currentChat) return;
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ 
                type: 'conversation_status', 
                isOpen: isOpen,
                timestamp: Date.now()
            }), sharedKey);
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: Date.now().toString(), 
                type: 'conversation_status', 
                data: encrypted, 
                timestamp: Date.now() 
            });
            console.log(`📬 تم إرسال حالة المحادثة: ${isOpen ? 'مفتوحة' : 'مغلقة'}`);
        } catch(e) {
            console.error('خطأ في إرسال حالة المحادثة:', e);
        }
    },
    
    updateFriendConversationStatus(friendId, isInConversation) {
        console.log(`👥 استلام تحديث حالة المحادثة من: ${friendId}, في المحادثة: ${isInConversation}`);
        console.log('currentChat الحالي:', this.currentChat);
        
        if (this.currentChat === friendId) {
            this.friendInConversation = isInConversation;
            console.log(`✅ تحديث friendInConversation إلى: ${isInConversation}`);
            
            if (!isInConversation) {
                console.log('⚠️ الطرف الآخر خرج من المحادثة - إلغاء تفعيل الميزات');
                this.featuresEnabled = false;
                this.featureRequestPending = false;
                this.featureRequestReceived = false;
                
                if (this.featureBlinkInterval) {
                    clearInterval(this.featureBlinkInterval);
                    this.featureBlinkInterval = null;
                }
                
                const btn = document.getElementById('enableFeaturesBtn');
                if (btn) {
                    btn.style.background = '#f44336';
                    btn.title = 'تفعيل الميزات';
                    console.log('✅ تم تغيير لون الزر إلى الأحمر');
                }
                
                this.updateAllButtons();
                console.log('⚠️ الطرف الآخر خرج من المحادثة، تم إلغاء تفعيل الميزات');
            }
        } 
        else {
            this._pendingConversationStatus[friendId] = isInConversation;
            console.log(`💾 تم تخزين حالة المحادثة لـ ${friendId}: ${isInConversation ? 'مفتوحة' : 'مغلقة'}`);
            
            if (!isInConversation && this.featuresEnabled) {
                console.log(`⚠️ المستخدم ${friendId} خرج من المحادثة - إلغاء تفعيل الميزات`);
                this.featuresEnabled = false;
                this.featureRequestPending = false;
                this.featureRequestReceived = false;
                
                if (this.featureBlinkInterval) {
                    clearInterval(this.featureBlinkInterval);
                }
                
                const btn = document.getElementById('enableFeaturesBtn');
                if (btn) {
                    btn.style.background = '#f44336';
                    btn.title = 'تفعيل الميزات';
                }
                
                this.updateAllButtons();
                console.log(`⚠️ ${friendId} خرج من المحادثة، تم إلغاء تفعيل الميزات`);
            }
        }
        
        this.updateAllButtons();
    },
    
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId;
        
        if (this._pendingConversationStatus && this._pendingConversationStatus[friendId] !== undefined) {
            this.friendInConversation = this._pendingConversationStatus[friendId];
            console.log(`📂 تم استرجاع حالة المحادثة لـ ${friendId}: ${this.friendInConversation ? 'مفتوحة' : 'مغلقة'}`);
            delete this._pendingConversationStatus[friendId];
        } else {
            this.friendInConversation = false;
        }
        
        this.resetFeatures();
        document.body.classList.add('conversation-open');
        const nameEl = document.getElementById('conversationName'), avatarEl = document.getElementById('conversationAvatar');
        if (nameEl) nameEl.textContent = friendName;
        if (avatarEl) avatarEl.textContent = friendAvatar || '👤';
        document.querySelector('.chat-page').style.display = 'none'; 
        document.getElementById('conversationPage').style.display = 'flex';
        this.displayMessages(friendId);
        PresenceSystem.watchFriend(friendId);
        
        // ✅ إعادة تعيين مهلة النبضات عند فتح المحادثة
        this.currentHeartbeatTimeout = this.HEARTBEAT_TIMEOUT_NORMAL;
        
        setTimeout(() => {
            this.sendConversationStatus(true);
        }, 500);
        
        setTimeout(() => {
            this.requestConversationStatus();
        }, 1000);
        
        setTimeout(() => { 
            if (this.friendOnline) {
                CallSystem.ensureDataChannelOnly(friendId).catch(() => {});
            }
        }, 500);
        
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
        
        setTimeout(() => this.setupFeatureButton(), 500);
    },
    
    // ✅ دالة updateFriendStatus المعدلة
    updateFriendStatus(friendId, isOnline, userData = null) {
        if (this.currentChat !== friendId) return;
        
        // ✅ منع إطفاء الميزات إذا كان الطرف الآخر يختار ملفاً مؤقتاً
        if (!isOnline && this.featuresEnabled && this.currentChat === friendId) {
            console.log('⚠️ تجاهل إطفاء الميزات: قد يكون الطرف الآخر يختار ملفاً');
            this.friendOnline = isOnline;
            const statusEl = document.getElementById('conversationStatus');
            if (statusEl) {
                statusEl.innerHTML = '🟢 متصل (قد يختار ملفاً)';
                statusEl.className = 'conversation-status online';
            }
            return;
        }
        
        this.friendOnline = isOnline;
        
        // الباقي كما هو لإطفاء الميزات في الحالات الحقيقية
        if (!isOnline && this.featuresEnabled) {
            console.log('🔴 المستخدم غير متصل - إلغاء تفعيل الميزات');
            this.featuresEnabled = false;
            this.featureRequestPending = false;
            this.featureRequestReceived = false;
            
            if (this.featureBlinkInterval) {
                clearInterval(this.featureBlinkInterval);
                this.featureBlinkInterval = null;
            }
            
            const btn = document.getElementById('enableFeaturesBtn');
            if (btn) {
                btn.style.background = '#f44336';
                btn.title = 'تفعيل الميزات';
                console.log('✅ تم تغيير لون الزر إلى الأحمر (المستخدم غير متصل)');
            }
            
            this.updateAllButtons();
        }
        
        // ✅ إذا عاد الطرف الآخر متصلاً، أعد تعيين مهلة النبضات
        if (isOnline && this.heartbeatTimer) {
            this.resetHeartbeatWatcher();
        }
        
        if (!userData && window.auth?.currentUser) {
            window.db.collection('users').doc(friendId).get().then(doc => {
                if (doc.exists) this.updateFriendStatus(friendId, isOnline, doc.data());
            }).catch(() => {});
            return;
        }
        
        const statusEl = document.getElementById('conversationStatus');
        if (!statusEl) return;
        
        let statusHtml = '';
        
        if (isOnline) {
            statusHtml = '🟢 متصل';
        } else {
            statusHtml = '🔴 غير متصل';
        }
        
        statusEl.innerHTML = statusHtml;
        statusEl.className = `conversation-status ${isOnline ? 'online' : 'offline'}`;
        
        this.updateAllButtons();
    },
    
    displayMessages(friendId) { const c = document.getElementById('messagesContainer'); if (!c) return; c.innerHTML = ''; (this.messages[friendId] || []).forEach(m => this.displayMessage(m)); },
    
    displayMessage(msg) {
        const c = document.getElementById('messagesContainer'); 
        if (!c) return;
        const div = document.createElement('div'); 
        div.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`; 
        div.id = `msg-${msg.id}`;
        const time = new Date(msg.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        let statusHtml = ''; 
        if (msg.sender === 'me') { 
            let icon = '✓', cls = 'sent'; 
            if (msg.status === 'delivered') { 
                icon = '✓✓'; cls = 'delivered'; 
            } else if (msg.status === 'read') { 
                icon = '✓✓'; cls = 'read'; 
            } 
            statusHtml = `<span class="message-status ${cls}">${icon}</span>`;
        }
        
        if (msg.type === 'text') {
            div.innerHTML = `<div class="message-content">${this.escapeHtml(msg.text)}</div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        } 
        else if (msg.type === 'image') {
            let imageSrc = msg.data;
            if (imageSrc && typeof imageSrc === 'string') {
                if (!imageSrc.startsWith('data:image') && !imageSrc.startsWith('http')) {
                    imageSrc = 'data:image/jpeg;base64,' + imageSrc;
                }
            }
            div.innerHTML = `<img src="${imageSrc}" class="message-image" onclick="window.openImage('${imageSrc}')" loading="lazy" style="max-width:100%;border-radius:12px;max-height:300px;cursor:pointer;"><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        } 
        else if (msg.type === 'voice') {
            let audioSrc = msg.data;
            if (audioSrc && typeof audioSrc === 'string' && !audioSrc.startsWith('data:audio')) {
                audioSrc = 'data:audio/webm;base64,' + audioSrc;
            }
            div.innerHTML = `<audio controls src="${audioSrc}" class="message-audio" preload="metadata" style="width:200px;"></audio><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        } 
        else if (msg.type === 'video') {
            let videoSrc = msg.data;
            if (videoSrc && typeof videoSrc === 'string') {
                if (!videoSrc.startsWith('data:video') && !videoSrc.startsWith('http')) {
                    videoSrc = 'data:video/mp4;base64,' + videoSrc;
                }
            }
            div.innerHTML = `<div style="position:relative;max-width:280px;border-radius:12px;overflow:hidden;background:#000;"><video controls preload="metadata" playsinline style="width:100%;max-height:250px;display:block;"><source src="${videoSrc}" type="video/mp4"></video></div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        } 
        else if (msg.type === 'file') {
            div.innerHTML = `<div class="message-content" onclick="window.openFile('${msg.data}', '${msg.fileName || 'ملف'}')" style="cursor:pointer;">📎 ${msg.fileName || 'ملف'}</div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        }
        
        c.appendChild(div); 
        c.scrollTop = c.scrollHeight;
    },
    
    async sendMessage(text) { 
        if (!this.currentChat || !text.trim()) return false; 
        const mid = Date.now().toString(); 
        try { 
            const pr = await SecureChatSystem.getMyPrivateKey(), pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); 
            if (!pr || !pu) return false;
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu), enc = await SecureChatSystem.encryptData(text.trim(), sk); 
            await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'text', data: enc, timestamp: Date.now() }); 
            this.saveMessage(this.currentChat, { id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            this.displayMessage({ id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            return true; 
        } catch (e) { return false; } 
    },
    
    async sendFileWithRetry(file, type, maxRetries = 3) {
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return false;
        }
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.showProgressBar(`جاري إرسال ${type === 'video' ? 'الفيديو' : type === 'image' ? 'الصورة' : 'الملف'}...`, 0);
                const success = await CallSystem.sendFileDirect(file, type);
                if (success) { this.hideProgressBar(); return true; }
                if (attempt < maxRetries) { this.updateProgressBar(0, `إعادة المحاولة ${attempt + 1}...`); await new Promise(r => setTimeout(r, 2000 * attempt)); }
            } catch (error) {}
        }
        this.hideProgressBar(); return false;
    },
    
    async _ensureChannelReady() {
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'الطرف الآخر ليس في المحادثة حالياً' : 'الميزات غير مفعلة');
            return false;
        }
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
            return true;
        }
        
        try {
            const success = await CallSystem.ensureDataChannelOnly(this.currentChat);
            
            if (success) {
                await new Promise(r => setTimeout(r, 1000));
                return true;
            }
            
            alert('تعذر فتح قناة الاتصال لإرسال الملفات');
            return false;
        } catch (e) {
            alert('فشل الاتصال. حاول مرة أخرى.');
            return false;
        }
    },
    
    // ✅ دوال الإرسال (مع إشارة file_selection_start)
    
    async sendImage(file) { 
        if (!this.currentChat) return;
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return;
        }
        
        // ✅ إرسال إشارة "سأختار ملف" لمنع قطع الاتصال
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
            CallSystem.dc.send(JSON.stringify({ type: 'file_selection_start', timestamp: Date.now() }));
        }
        
        // ✅ إعطاء وقت قصير قبل فتح مستكشف الملفات
        await new Promise(r => setTimeout(r, 200));
        
        if (!(await this._ensureChannelReady())) return;
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            const success = await this.sendFileWithRetry(file, 'image');
            if (success) {
                const comp = await SecureChatSystem.compressImage(file); 
                const b64 = await SecureChatSystem.fileToBase64(comp); 
                const msgId = Date.now().toString();
                this.saveMessage(this.currentChat, { id: msgId, type: 'image', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                this.displayMessage({ id: msgId, type: 'image', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            } else alert('فشل إرسال الصورة');
        }
    },
    
    async sendVideoFile(file) { 
        if (!this.currentChat) return;
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return;
        }
        
        // ✅ إرسال إشارة "سأختار ملف" لمنع قطع الاتصال
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
            CallSystem.dc.send(JSON.stringify({ type: 'file_selection_start', timestamp: Date.now() }));
        }
        
        // ✅ إعطاء وقت قصير قبل فتح مستكشف الملفات
        await new Promise(r => setTimeout(r, 200));
        
        try {
            await SecureChatSystem.validateVideo(file);
        } catch (error) {
            alert(error.message);
            return;
        }
        
        if (!(await this._ensureChannelReady())) return;
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            console.log(`🎬 إرسال فيديو مباشر: ${file.name} | ${(file.size/1024/1024).toFixed(1)}MB`);
            const success = await this.sendFileWithRetry(file, 'video');
            if (success) {
                try {
                    const b64 = await SecureChatSystem.fileToBase64(file); 
                    const msgId = Date.now().toString();
                    
                    this.displayMessage({ id: msgId, type: 'video', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                    
                    this.saveMessage(this.currentChat, { id: msgId, type: 'video', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                    
                } catch (error) { alert('فشل معالجة الفيديو'); }
            } else alert('فشل إرسال الفيديو');
        }
    },
    
    async sendFile(file) { 
        if (!this.currentChat) return;
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return;
        }
        
        // ✅ إرسال إشارة "سأختار ملف" لمنع قطع الاتصال
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
            CallSystem.dc.send(JSON.stringify({ type: 'file_selection_start', timestamp: Date.now() }));
        }
        
        // ✅ إعطاء وقت قصير قبل فتح مستكشف الملفات
        await new Promise(r => setTimeout(r, 200));
        
        if (!(await this._ensureChannelReady())) return;
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            const success = await this.sendFileWithRetry(file, 'file');
            if (success) {
                const b64 = await SecureChatSystem.fileToBase64(file); 
                const msgId = Date.now().toString();
                this.saveMessage(this.currentChat, { id: msgId, type: 'file', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                this.displayMessage({ id: msgId, type: 'file', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            } else alert('فشل إرسال الملف');
        }
    },
    
    async sendVoiceNote(audioBlob) { 
        if (!this.currentChat) return;
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return;
        }
        
        // ✅ إرسال إشارة "سأختار ملف" لمنع قطع الاتصال
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
            CallSystem.dc.send(JSON.stringify({ type: 'file_selection_start', timestamp: Date.now() }));
        }
        
        // ✅ إعطاء وقت قصير قبل فتح مستكشف الملفات
        await new Promise(r => setTimeout(r, 200));
        
        if (!(await this._ensureChannelReady())) return;
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            const success = await this.sendFileWithRetry(audioBlob, 'voice');
            if (success) {
                const b64 = await SecureChatSystem.fileToBase64(audioBlob); 
                const msgId = Date.now().toString();
                this.saveMessage(this.currentChat, { id: msgId, type: 'voice', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                this.displayMessage({ id: msgId, type: 'voice', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            } else alert('فشل إرسال البصمة الصوتية');
        }
    },
    
    async shareLocationDirect() { 
        if (!this.currentChat) return; 
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن المشاركة - الطرف الآخر ليس في المحادثة' : 'لا يمكن المشاركة - الميزات غير مفعلة');
            return;
        }
        if (!(await this._ensureChannelReady())) return;
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            if (!navigator.geolocation) { alert('المتصفح لا يدعم تحديد الموقع'); return; }
            navigator.geolocation.getCurrentPosition(p => { 
                const locMsg = `📍 موقعي: https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`; 
                CallSystem.dc.send(JSON.stringify({ type: 'location', data: locMsg, id: Date.now().toString() })); 
                const msgId = Date.now().toString();
                this.saveMessage(this.currentChat, { id: msgId, type: 'text', text: locMsg, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                this.displayMessage({ id: msgId, type: 'text', text: locMsg, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            }, () => alert('فشل تحديد الموقع'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        }
    },
    
    saveMessage(friendId, message) { 
        const key = `chat_${friendId}`; 
        let h = []; 
        try { h = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { h = []; }
        h.push(message); 
        let serialized = JSON.stringify(h);
        while (serialized.length > 4000000) {
            let removed = false;
            for (let i = 0; i < h.length; i++) {
                if (h[i].type === 'video' || h[i].type === 'image' || h[i].type === 'file') { h.splice(i, 1); removed = true; break; }
            }
            if (!removed) h.splice(0, 1);
            serialized = JSON.stringify(h);
        }
        try { localStorage.setItem(key, JSON.stringify(h)); } catch (e) {
            h = h.slice(Math.floor(h.length * 0.2));
            try { localStorage.setItem(key, JSON.stringify(h)); } catch (e2) { h = h.slice(-10); try { localStorage.setItem(key, JSON.stringify(h)); } catch (e3) {} }
        }
        this.messages[friendId] = h; 
    },
    
    updateLastMessage(friendId, lastMessage) { 
        document.querySelectorAll('.chat-item').forEach(item => { 
            if (item.getAttribute('onclick')?.includes(friendId)) { 
                const lm = item.querySelector('.last-message'), tm = item.querySelector('.chat-time'); 
                if (lm) lm.textContent = lastMessage; 
                if (tm) tm.textContent = 'الآن'; 
            } 
        }); 
    },
    
    closeChat() {
        console.log('🔴 closeChat - بدء إغلاق المحادثة');
        console.log('currentChat:', this.currentChat);
        console.log('featuresEnabled قبيل الإغلاق:', this.featuresEnabled);
        
        const chatId = this.currentChat;
        
        if (chatId) {
            console.log('📤 إرسال إشارة إلغاء إلى:', chatId);
            this.sendFeatureCancelImmediately(chatId);
            this.sendConversationStatus(false);
        }
        
        this.featuresEnabled = false;
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        
        if (this.featureBlinkInterval) {
            clearInterval(this.featureBlinkInterval);
            this.featureBlinkInterval = null;
        }
        
        const btn = document.getElementById('enableFeaturesBtn');
        if (btn) {
            btn.style.background = '#f44336';
            btn.title = 'تفعيل الميزات';
        }
        
        this.updateAllButtons();
        
        // ✅ إيقاف مراقبة نبضات القلب عند إغلاق المحادثة
        this.stopHeartbeatWatcher();
        
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        PresenceSystem.stopAll();
        if (!CallSystem.isInCall) CallSystem.cleanupConnections();
        this.currentChat = null;
        this.friendOnline = false;
        this.friendInConversation = false;
        
        console.log('✅ closeChat - انتهى');
    },
    
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
};

ChatSystem.init();
