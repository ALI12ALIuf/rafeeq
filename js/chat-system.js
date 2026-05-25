// ========== chat-system.js ==========
// نظام الدردشة E2EE + نظام الحضور Presence

// ==================== القسم 1: تعريف PresenceSystem ====================
const PresenceSystem = {
    listeners: {}, heartbeatInterval: null,
    async setOnline() { if (!window.auth?.currentUser) return; try { await window.db.collection('users').doc(window.auth.currentUser.uid).update({ online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); this.startHeartbeat(); } catch (e) {} },
    async setOffline() { if (!window.auth?.currentUser) return; try { await window.db.collection('users').doc(window.auth.currentUser.uid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); this.stopHeartbeat(); } catch (e) {} },
    startHeartbeat() { this.stopHeartbeat(); this.heartbeatInterval = setInterval(() => { if (window.auth?.currentUser) window.db.collection('users').doc(window.auth.currentUser.uid).update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {}); }, 30000); },
    stopHeartbeat() { if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; } },
    watchFriend(friendId) { if (!friendId) return; if (this.listeners[friendId]) this.listeners[friendId](); this.listeners[friendId] = window.db.collection('users').doc(friendId).onSnapshot(doc => { if (doc.exists) ChatSystem.updateFriendStatus(friendId, doc.data().online === true, doc.data()); else ChatSystem.updateFriendStatus(friendId, false); }, () => {}); },
    stopAll() { Object.values(this.listeners).forEach(unsub => { if (typeof unsub === 'function') unsub(); }); this.listeners = {}; this.stopHeartbeat(); }
};

// ==================== القسم 2: تعريف ChatSystem ====================
const ChatSystem = {
    currentChat: null, messages: {}, friendOnline: false,
    friendInConversation: false,
    _pendingConversationStatus: {},
    
    featuresEnabled: false,
    featureRequestPending: false,
    featureRequestReceived: false,
    featureBlinkInterval: null,
    
    // ✅ متغيرات المؤقت 120 ثانية
    offlineStartTime: null,
    offlineTimer: null,
    offlineCountdownInterval: null,

    // ==================== القسم 3: init ====================
init() { 
    this.loadAllChats(); 
    this.setupPageFocusListener();
    this.setupFeatureButton();
    this.setupBeforeUnloadListener();
    
    // ✅ تنظيف الملفات والوسائط عند تحميل الصفحة
    this.cleanMediaMessagesOnLoad();
},

// ==================== القسم 3.5: cleanMediaMessagesOnLoad ====================
cleanMediaMessagesOnLoad() {
    // تنظيف جميع المحادثات من الملفات والوسائط (صور، فيديو، بصمات، ملفات)
    // بحيث يبقى فقط النصوص
    for (const friendId in this.messages) {
        const messages = this.messages[friendId] || [];
        const filteredMessages = messages.filter(msg => msg.type === 'text');
        if (filteredMessages.length !== messages.length) {
            this.messages[friendId] = filteredMessages;
            const key = `chat_${friendId}`;
            localStorage.setItem(key, JSON.stringify(filteredMessages));
            console.log(`✅ تم تنظيف الوسائط من محادثة ${friendId}`);
        }
    }
    console.log('🧹 تم تنظيف جميع الملفات والوسائط من localStorage');
},
    
    
    // ==================== القسم 4: setupBeforeUnloadListener و sendFeatureCancelBeforeUnload ====================
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
    
    // ==================== القسم 5: setupFeatureButton ====================
setupFeatureButton() {
    setTimeout(() => {
        // ✅ إزالة أي أزرار قديمة
        const oldBtn = document.getElementById('enableFeaturesBtn');
        if (oldBtn) oldBtn.remove();
        
        const oldContainer = document.getElementById('featureToggleContainer');
        if (oldContainer) oldContainer.remove();
        
        const container = document.querySelector('.chat-actions, .message-input-container, .chat-footer, #conversationPage');
        if (!container) {
            console.log('⚠️ لم يتم العثور على حاوية للزر');
            return;
        }
        
        // ✅ إضافة الأنماط
        if (!document.getElementById('featureToggleStyles')) {
            const style = document.createElement('style');
            style.id = 'featureToggleStyles';
            style.textContent = `
                .feature-toggle-container {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    margin: 0 5px;
                    direction: ltr;
                }
                .feature-toggle-label {
                    font-size: 0.7rem;
                    color: #888;
                }
                .feature-switch {
                    position: relative;
                    display: inline-block;
                    width: 52px;
                    height: 26px;
                }
                .feature-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                .feature-slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: #f44336;
                    transition: 0.3s;
                    border-radius: 26px;
                }
                .feature-slider:before {
                    position: absolute;
                    content: "";
                    height: 20px;
                    width: 20px;
                    left: 3px;
                    bottom: 3px;
                    background-color: white;
                    transition: 0.3s;
                    border-radius: 50%;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                }
                input:checked + .feature-slider {
                    background-color: #4CAF50;
                }
                input:checked + .feature-slider:before {
                    transform: translateX(26px);
                }
                /* تأثير الرمش */
                @keyframes featureBlink {
                    0% { background-color: #f44336; }
                    50% { background-color: #2196F3; }
                    100% { background-color: #f44336; }
                }
                .feature-switch.blinking .feature-slider {
                    animation: featureBlink 0.8s ease-in-out infinite;
                }
            `;
            document.head.appendChild(style);
        }
        
        // ✅ إنشاء حاوية الزر
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'feature-toggle-container';
        toggleContainer.id = 'featureToggleContainer';
        
        toggleContainer.innerHTML = `
            <span class="feature-toggle-label" style="color: #f44336;">○</span>
            <label class="feature-switch" id="featureSwitchLabel">
                <input type="checkbox" id="featureToggleInput">
                <span class="feature-slider" id="featureToggleSlider"></span>
            </label>
            <span class="feature-toggle-label" style="color: #4CAF50;">●</span>
        `;
        
        container.appendChild(toggleContainer);
        
        const toggleInput = document.getElementById('featureToggleInput');
        
        if (!toggleInput) return;
        
        // ✅ حفظ المراجع
        window.featureToggleInput = toggleInput;
        
        // ✅ معالج الضغط (مع دعم الإيقاف)
        toggleInput.onclick = (e) => {
            console.log('🔘 تم الضغط على زر التفعيل');
            
            // ✅ إذا كانت الميزات مفعلة، قم بإلغائها
            if (this.featuresEnabled) {
                console.log('⚠️ الميزات مفعلة، جاري إلغاء التفعيل');
                this.disableFeatures();
                return;
            }
            
            if (this.featureRequestReceived) {
                this.acceptFeatureRequest();
            } else if (this.featureRequestPending) {
                alert('تم إرسال طلب سابق، انتظر رد الطرف الآخر');
            } else {
                this.requestEnableFeatures();
            }
        };
        
        // ✅ إذا كانت الميزات مفعلة مسبقاً
        if (this.featuresEnabled && toggleInput) {
            toggleInput.checked = true;
        }
        
        console.log('✅ تم إضافة زر التفعيل');
    }, 1000);
},
    
    // ==================== القسم 6: startFeatureBlink ====================
startFeatureBlink() {
    if (this.featureBlinkInterval) clearInterval(this.featureBlinkInterval);
    
    const switchLabel = document.getElementById('featureSwitchLabel');
    if (!switchLabel) return;
    
    switchLabel.classList.add('blinking');
    
    let blinkCount = 0;
    this.featureBlinkInterval = setInterval(() => {
        if (!this.featureRequestPending && !this.featureRequestReceived) {
            clearInterval(this.featureBlinkInterval);
            switchLabel.classList.remove('blinking');
            return;
        }
        
        blinkCount++;
        if (blinkCount > 30) {
            clearInterval(this.featureBlinkInterval);
            this.featureRequestPending = false;
            this.featureRequestReceived = false;
            switchLabel.classList.remove('blinking');
        }
    }, 500);
},
    
    // ==================== القسم 7: requestEnableFeatures ====================
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
    
    // ==================== القسم 8: handleFeatureRequest ====================
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
    
    // ==================== القسم 9: acceptFeatureRequest ====================
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
    
    // ✅ تحديث زر التفعيل
    const toggleInput = document.getElementById('featureToggleInput');
    const switchLabel = document.getElementById('featureSwitchLabel');
    
    if (toggleInput) {
        toggleInput.checked = true;
    }
    if (switchLabel) {
        switchLabel.classList.remove('blinking');
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
    console.log('✅ تم تفعيل الميزات!');
    console.log('✅ acceptFeatureRequest - انتهى التنفيذ');
},
    
    // ==================== القسم 10: handleFeatureResponse ====================
handleFeatureResponse(fromId, action) {
    console.log('📨 handleFeatureResponse - from:', fromId, 'action:', action);
    
    if (action === 'accepted') {
        this.featuresEnabled = true;
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        
        if (this.featureBlinkInterval) {
            clearInterval(this.featureBlinkInterval);
            this.featureBlinkInterval = null;
        }
        
        // ✅ تحديث زر التفعيل المنزلق (Toggle Switch)
        const toggleInput = document.getElementById('featureToggleInput');
        const switchLabel = document.getElementById('featureSwitchLabel');
        
        if (toggleInput) {
            toggleInput.checked = true;
            console.log('✅ تم تفعيل زر التفعيل (ON)');
        }
        if (switchLabel) {
            switchLabel.classList.remove('blinking');
            console.log('✅ تم إيقاف الرمش');
        }
        
        // ✅ للتوافق مع الزر القديم (إذا وجد)
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
            this.featureBlinkInterval = null;
        }
        
        // ✅ تحديث زر التفعيل المنزلق (إلغاء)
        const toggleInput = document.getElementById('featureToggleInput');
        const switchLabel = document.getElementById('featureSwitchLabel');
        
        if (toggleInput) {
            toggleInput.checked = false;
            console.log('✅ تم إلغاء تفعيل الزر (OFF)');
        }
        if (switchLabel) {
            switchLabel.classList.remove('blinking');
            console.log('✅ تم إيقاف الرمش');
        }
        
        // ✅ للتوافق مع الزر القديم
        const btn = document.getElementById('enableFeaturesBtn');
        if (btn) {
            btn.style.background = '#f44336';
        }
        console.log('❌ تم رفض طلب تفعيل الميزات');
        
    // ✅✅✅ إضافة معالجة إشارة الإيقاف من الطرف الآخر
    } else if (action === 'disable') {
        console.log('🔴 استلام إشارة إيقاف من الطرف الآخر');
        
        this.featuresEnabled = false;
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        
        if (this.featureBlinkInterval) {
            clearInterval(this.featureBlinkInterval);
            this.featureBlinkInterval = null;
        }
        
        // ✅ تحديث زر التفعيل إلى اللون الأحمر
        const toggleInput = document.getElementById('featureToggleInput');
        const switchLabel = document.getElementById('featureSwitchLabel');
        
        if (toggleInput) {
            toggleInput.checked = false;
            console.log('✅ تم إلغاء تفعيل الزر (OFF)');
        }
        if (switchLabel) {
            switchLabel.classList.remove('blinking');
            console.log('✅ تم إيقاف الرمش');
        }
        
        // ✅ للتوافق مع الزر القديم
        const btn = document.getElementById('enableFeaturesBtn');
        if (btn) {
            btn.style.background = '#f44336';
            btn.title = 'تفعيل الميزات';
        }
        
        // ✅ إغلاق Data Channel
        if (CallSystem.dc) {
            try { CallSystem.dc.close(); } catch(e) {}
            CallSystem.dc = null;
        }
        if (CallSystem.pc) {
            try { CallSystem.pc.close(); } catch(e) {}
            CallSystem.pc = null;
        }
        
        this.updateAllButtons();
        console.log('✅ تم إلغاء تفعيل الميزات بناءً على طلب الطرف الآخر');
    }
},

    // ==================== القسم 10.1: disableFeatures ====================
async disableFeatures() {
    console.log('🔴 disableFeatures - إلغاء تفعيل الميزات');
    
    this.featuresEnabled = false;
    this.featureRequestPending = false;
    this.featureRequestReceived = false;
    
    if (this.featureBlinkInterval) {
        clearInterval(this.featureBlinkInterval);
        this.featureBlinkInterval = null;
    }
    
    // ✅ تحديث زر التفعيل إلى اللون الأحمر
    const toggleInput = document.getElementById('featureToggleInput');
    const switchLabel = document.getElementById('featureSwitchLabel');
    
    if (toggleInput) {
        toggleInput.checked = false;
    }
    if (switchLabel) {
        switchLabel.classList.remove('blinking');
    }
    
    // ✅ إرسال إشارة إلغاء إلى الطرف الآخر
    if (this.currentChat) {
        await this.sendFeatureCancelImmediately(this.currentChat);
    }
    
    // ✅ إغلاق Data Channel
    if (CallSystem.dc) {
        try { CallSystem.dc.close(); } catch(e) {}
        CallSystem.dc = null;
    }
    if (CallSystem.pc) {
        try { CallSystem.pc.close(); } catch(e) {}
        CallSystem.pc = null;
    }
    
    this.updateAllButtons();
    console.log('✅ تم إلغاء تفعيل الميزات');
},
    
    
    // ==================== القسم 11: sendFeatureCancelImmediately ====================
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
    
    // ==================== القسم 12: resetFeatures ====================
resetFeatures() {
    console.log('🔄 resetFeatures - إعادة تعيين الميزات');
    
    const chatId = this.currentChat;
    
    this.featuresEnabled = false;
    this.featureRequestPending = false;
    this.featureRequestReceived = false;
    
    if (this.featureBlinkInterval) {
        clearInterval(this.featureBlinkInterval);
    }
    
    // ✅ تحديث زر التفعيل
    const toggleInput = document.getElementById('featureToggleInput');
    const switchLabel = document.getElementById('featureSwitchLabel');
    
    if (toggleInput) {
        toggleInput.checked = false;
    }
    if (switchLabel) {
        switchLabel.classList.remove('blinking');
    }
    
    if (chatId) {
        console.log('📤 إرسال إشارة إلغاء فوراً إلى:', chatId);
        this.sendFeatureCancelImmediately(chatId);
    }
    
    this.updateAllButtons();
},
    
    // ==================== القسم 13: handleFeatureCancel ====================
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
    
    // ✅ تحديث زر التفعيل
    const toggleInput = document.getElementById('featureToggleInput');
    const switchLabel = document.getElementById('featureSwitchLabel');
    
    if (toggleInput) {
        toggleInput.checked = false;
    }
    if (switchLabel) {
        switchLabel.classList.remove('blinking');
    }
    
    this.updateAllButtons();
    console.log('⚠️ الطرف الآخر خرج من المحادثة، تم إلغاء تفعيل الميزات');
    console.log('✅ handleFeatureCancel - انتهى, featuresEnabled =', this.featuresEnabled);
},
    
    // ==================== القسم 14: updateAllButtons ====================
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
    
    // ==================== القسم 15: setupPageFocusListener ====================
setupPageFocusListener() {
    window.addEventListener('focus', () => {
        if (this.currentChat && this.friendOnline && this.featuresEnabled) { // ✅ تم إضافة this.featuresEnabled
            console.log('👁️ الصفحة في المقدمة - تحديث حالة المحادثة');
            this.sendConversationStatus(true);
            this.requestConversationStatus();
        }
    });
},
    
    // ==================== القسم 16: requestConversationStatus ====================
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
    
    // ==================== القسم 17: loadAllChats ====================
    loadAllChats() { 
        for (let i = 0; i < localStorage.length; i++) { 
            const k = localStorage.key(i); 
            if (k && k.startsWith('chat_')) { 
                const fid = k.replace('chat_', ''); 
                try { this.messages[fid] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { this.messages[fid] = []; } 
            } 
        } 
    },
    
    // ==================== القسم 18: showProgressBar ====================
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
    
    // ==================== القسم 19: updateProgressBar ====================
    updateProgressBar(percent, message) {
        const fill = document.getElementById('progressFill');
        const perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = Math.min(percent, 100) + '%';
        if (perc) perc.textContent = Math.round(percent) + '%';
    },
    
    // ==================== القسم 20: hideProgressBar ====================
    hideProgressBar() { const bar = document.getElementById('progressBar'); if (bar) bar.remove(); },
    
    // ==================== القسم 21: sendConversationStatus ====================
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
    
    // ==================== القسم 22: updateFriendConversationStatus ====================
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

   // ==================== القسم 23: openChat ====================
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
    
    setTimeout(() => {
        this.sendConversationStatus(true);
    }, 500);
    
    setTimeout(() => {
        this.requestConversationStatus();
    }, 1000);
    
    // ✅ تم إزالة استدعاء ensureDataChannelOnly (لن يتم فتح Data Channel إلا بعد تفعيل الميزات)
    // setTimeout(() => { 
    //     if (this.friendOnline) {
    //         CallSystem.ensureDataChannelOnly(friendId).catch(() => {});
    //     }
    // }, 500);
    
    setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
    setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
    
    setTimeout(() => this.setupFeatureButton(), 500);
}, 
    
    
    // ==================== القسم 24: updateFriendStatus (الرئيسي مع الوقت 120 ثانية) ====================
    updateFriendStatus(friendId, isOnline, userData = null) {
        if (this.currentChat !== friendId) return;
        
        // الحالة 1: الشخص غير متصل
        if (!isOnline) {
            // ✅ إذا كان غير متصل من البداية (الميزات غير مفعلة) → أحمر مباشر
            if (!this.featuresEnabled) {
                this.friendOnline = false;
                const statusEl = document.getElementById('conversationStatus');
                if (statusEl) {
                    statusEl.innerHTML = '🔴 غير متصل';
                    statusEl.className = 'conversation-status offline';
                }
                return;
            }
            
            // ✅ هنا: الميزات مفعلة، فالمستخدم كان متصلاً وانقطع (دخل ملف أو خرج فجأة)
            // نبدأ العداد الأصفر 120 ثانية
            if (this.offlineTimer) clearTimeout(this.offlineTimer);
            if (this.offlineCountdownInterval) clearInterval(this.offlineCountdownInterval);
            
            this.offlineStartTime = Date.now();
            this.friendOnline = false;
            
            let secondsLeft = 120;
            const statusEl = document.getElementById('conversationStatus');
            
            const updateCountdown = () => {
                if (statusEl) {
                    statusEl.innerHTML = `🟡 غير متصل مؤقتاً (${secondsLeft})`;
                    statusEl.className = 'conversation-status offline-temp';
                }
                secondsLeft--;
                if (secondsLeft < 0) {
                    clearInterval(this.offlineCountdownInterval);
                    this.offlineCountdownInterval = null;
                }
            };
            
            updateCountdown();
            this.offlineCountdownInterval = setInterval(updateCountdown, 1000);
            
            this.offlineTimer = setTimeout(() => {
                if (!this.friendOnline && this.featuresEnabled) {
                    console.log('🔴 120 ثانية وما رجع - إلغاء الميزات وإرسال إشارة إلى المرسل');
                    
                    if (this.currentChat) {
                        this.sendFeatureCancelImmediately(this.currentChat);
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
                }
                
                if (this.offlineCountdownInterval) {
                    clearInterval(this.offlineCountdownInterval);
                    this.offlineCountdownInterval = null;
                }
                
                if (statusEl && !this.friendOnline) {
                    statusEl.innerHTML = '🔴 غير متصل';
                    statusEl.className = 'conversation-status offline';
                }
                
                this.offlineTimer = null;
            }, 120000);
            
            return;
        }
        
        // الحالة 2: الشخص رجع متصل خلال 120 ثانية (نرجع الميزات كما هي)
        if (isOnline && this.offlineStartTime && (Date.now() - this.offlineStartTime) < 120000) {
            console.log('✅ الطرف الآخر عاد خلال 120 ثانية - إبقاء الميزات مفعلة');
            
            if (this.offlineTimer) clearTimeout(this.offlineTimer);
            if (this.offlineCountdownInterval) clearInterval(this.offlineCountdownInterval);
            
            this.offlineTimer = null;
            this.offlineStartTime = null;
            this.friendOnline = true;
            
            const statusEl = document.getElementById('conversationStatus');
            if (statusEl) {
                statusEl.innerHTML = '🟢 متصل';
                statusEl.className = 'conversation-status online';
            }
            return;
        }
        
        // الحالة 3: الوضع الطبيعي (متصل أو غير متصل بشكل نهائي)
        this.friendOnline = isOnline;
        
        if (!userData && window.auth?.currentUser) {
            window.db.collection('users').doc(friendId).get().then(doc => {
                if (doc.exists) this.updateFriendStatus(friendId, isOnline, doc.data());
            }).catch(() => {});
            return;
        }
        
        const statusEl = document.getElementById('conversationStatus');
        if (!statusEl) return;
        
        let statusHtml = '';
        let statusClass = '';
        
        if (isOnline) {
            statusHtml = '🟢 متصل';
            statusClass = 'conversation-status online';
        } else {
            statusHtml = '🔴 غير متصل';
            statusClass = 'conversation-status offline';
        }
        
        statusEl.innerHTML = statusHtml;
        statusEl.className = statusClass;
        
        this.updateAllButtons();
    },
    
    // ==================== القسم 25: displayMessages ====================
    displayMessages(friendId) { const c = document.getElementById('messagesContainer'); if (!c) return; c.innerHTML = ''; (this.messages[friendId] || []).forEach(m => this.displayMessage(m)); },


     // ==================== القسم 26: displayMessage ====================
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
    else if (msg.type === 'location') {
        // معالجة رسالة الموقع
        let locationData = msg.data;
        let locationUrl = '';
        
        if (typeof locationData === 'object' && locationData.url) {
            locationUrl = locationData.url;
        } else if (typeof locationData === 'string') {
            const match = locationData.match(/https?:\/\/[^\s]+/);
            locationUrl = match ? match[0] : locationData;
        } else {
            locationUrl = '#';
        }
        
        // استخراج معلومات الضغطات
        const maxClicks = locationData.maxClicks;
        let clicksRemaining = locationData.clicksRemaining;
        
        // ✅ إذا كانت الصلاحية انتهت (clicksRemaining <= 0)
        if (clicksRemaining !== undefined && clicksRemaining <= 0) {
            div.innerHTML = `
                <div class="message-content" style="background: #888; border-radius: 12px; padding: 8px 12px; display: inline-flex; align-items: center; justify-content: center;">
                    <i class="fas fa-lock" style="font-size: 1.2rem; color: white;"></i>
                </div>
                <div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>
            `;
        } else {
            // ✅ عرض الموقع بدون عداد، فقط أيقونة خريطة
            const locationDiv = document.createElement('div');
            locationDiv.className = 'message-content location-card';
            locationDiv.style.cssText = 'cursor: pointer; background: #4CAF50; border-radius: 12px; padding: 8px 12px; display: inline-flex; align-items: center; justify-content: center;';
            locationDiv.innerHTML = `<i class="fas fa-map-marker-alt" style="font-size: 1.2rem; color: white;"></i>`;
            
            // معالج الضغط على الموقع
            locationDiv.onclick = (e) => {
                e.stopPropagation();
                
                // ✅ التحقق من الصلاحية - بدون رسالة تحذير
                if (clicksRemaining !== undefined && clicksRemaining <= 0) {
                    return; // لا شيء يحدث
                }
                
                // فتح الخريطة
                window.open(locationUrl, '_blank');
                
                // ✅ تقليل عدد الضغطات المتبقية (فقط للمستلم، وليس للمرسل)
                if (msg.sender !== 'me' && clicksRemaining !== undefined && maxClicks < 999999) {
                    clicksRemaining--;
                    
                    // تحديث البيانات في كائن الرسالة
                    msg.data.clicksRemaining = clicksRemaining;
                    
                    // ✅ إذا وصلت إلى الصفر، قفل الموقع (بدون رسالة تحذير)
                    if (clicksRemaining <= 0) {
                        locationDiv.style.background = '#888';
                        locationDiv.style.cursor = 'default';
                        locationDiv.innerHTML = `<i class="fas fa-lock" style="font-size: 1.2rem; color: white;"></i>`;
                        locationDiv.onclick = () => {
                            return; // لا شيء يحدث
                        };
                    }
                    
                    // تحديث في localStorage
                    if (ChatSystem.currentChat) {
                        const messages = ChatSystem.messages[ChatSystem.currentChat] || [];
                        const msgIndex = messages.findIndex(m => m.id === msg.id);
                        if (msgIndex !== -1) {
                            messages[msgIndex].data.clicksRemaining = clicksRemaining;
                            ChatSystem.saveMessage(ChatSystem.currentChat, messages[msgIndex]);
                        }
                    }
                }
            };
            
            div.appendChild(locationDiv);
            const infoDiv = document.createElement('div');
            infoDiv.className = 'message-info';
            infoDiv.innerHTML = `<span class="message-time">${time}</span>${statusHtml}`;
            div.appendChild(infoDiv);
            
            c.appendChild(div);
            c.scrollTop = c.scrollHeight;
            return;
        }
    }
    // ✅✅✅ قسم الصور المعدل (حجم موحد + إطار أخضر + فتح داخل المحادثة)
    else if (msg.type === 'image') {
        let imageSrc = msg.data;
        if (imageSrc && typeof imageSrc === 'string') {
            if (!imageSrc.startsWith('data:image') && !imageSrc.startsWith('http')) {
                imageSrc = 'data:image/jpeg;base64,' + imageSrc;
            }
        }
        
        // إنشاء div لعرض الصورة داخل المحادثة بحجم موحد
        const imageDiv = document.createElement('div');
        imageDiv.className = 'message-image-wrapper';
        imageDiv.style.cssText = 'cursor: pointer; display: inline-block; border: 2px solid #4CAF50; border-radius: 12px; overflow: hidden; width: 200px; height: 200px;';
        
        const img = document.createElement('img');
        img.src = imageSrc;
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';
        img.loading = 'lazy';
        
        // فتح الصورة داخل المحادثة (نافذة منبثقة)
        img.onclick = () => {
            this.showImagePreview(imageSrc);
        };
        
        imageDiv.appendChild(img);
        div.appendChild(imageDiv);
        
        // إضافة معلومات الوقت والحالة
        const infoDiv = document.createElement('div');
        infoDiv.className = 'message-info';
        infoDiv.innerHTML = `<span class="message-time">${time}</span>${statusHtml}`;
        div.appendChild(infoDiv);
        
        c.appendChild(div);
        c.scrollTop = c.scrollHeight;
        return;
    } 
    else if (msg.type === 'voice') {
        let audioSrc = msg.data;
        if (audioSrc && typeof audioSrc === 'string' && !audioSrc.startsWith('data:audio')) {
            audioSrc = 'data:audio/webm;base64,' + audioSrc;
        }
        
        const audioId = `audio_${msg.id}`;
        let audioDuration = 0;
        
        // ✅ الحصول على المدة الإجمالية للبصمة
        const tempAudio = new Audio(audioSrc);
        tempAudio.addEventListener('loadedmetadata', () => {
            audioDuration = tempAudio.duration;
            const durationSpan = document.getElementById(`duration_${audioId}`);
            if (durationSpan && !isNaN(audioDuration)) {
                const minutes = Math.floor(audioDuration / 60);
                const seconds = Math.floor(audioDuration % 60);
                durationSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        });
        
        // ✅ مشغل مخصص مع عدادين (وقت التشغيل الحالي والمدة الإجمالية)
        div.innerHTML = `
            <div class="message-content voice-message" style="background: #4CAF50; border-radius: 20px; padding: 8px 12px; display: inline-block; direction: ltr;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <button class="voice-play-btn" data-audio="${audioId}" style="background: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-play" style="color: #4CAF50; font-size: 0.9rem;"></i>
                    </button>
                    <button class="voice-replay-btn" data-audio="${audioId}" style="background: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-sync-alt" style="color: #f44336; font-size: 0.9rem;"></i>
                    </button>
                    <div style="text-align: center;">
                        <div style="display: flex; flex-direction: column; align-items: center;">
                            <span class="voice-time" id="time_${audioId}" style="color: white; font-size: 0.85rem; font-weight: bold; min-width: 45px;">0:00</span>
                            <span id="duration_${audioId}" style="color: white; font-size: 0.7rem; opacity: 0.8;">0:00</span>
                        </div>
                    </div>
                    <button class="voice-mute-btn" data-audio="${audioId}" style="background: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-volume-up" style="color: #4CAF50; font-size: 0.9rem;"></i>
                    </button>
                </div>
                <audio id="${audioId}" src="${audioSrc}" style="display: none;"></audio>
            </div>
            <div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>
        `;
        
        // إضافة معالج التشغيل بعد إضافة العنصر
        setTimeout(() => {
            const playBtn = div.querySelector('.voice-play-btn');
            const replayBtn = div.querySelector('.voice-replay-btn');
            const muteBtn = div.querySelector('.voice-mute-btn');
            const audioEl = document.getElementById(audioId);
            const timeSpan = document.getElementById(`time_${audioId}`);
            
            if (playBtn && audioEl) {
                let isPlaying = false;
                
                // زر التشغيل/الإيقاف المؤقت
                playBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (isPlaying) {
                        audioEl.pause();
                        playBtn.innerHTML = '<i class="fas fa-play" style="color: #4CAF50; font-size: 0.9rem;"></i>';
                        isPlaying = false;
                    } else {
                        audioEl.play();
                        playBtn.innerHTML = '<i class="fas fa-pause" style="color: #4CAF50; font-size: 0.9rem;"></i>';
                        isPlaying = true;
                    }
                };
                
                // زر إعادة التشغيل (سهم دائري)
                replayBtn.onclick = (e) => {
                    e.stopPropagation();
                    audioEl.pause();
                    audioEl.currentTime = 0;
                    playBtn.innerHTML = '<i class="fas fa-play" style="color: #4CAF50; font-size: 0.9rem;"></i>';
                    isPlaying = false;
                    if (timeSpan) timeSpan.textContent = '0:00';
                    audioEl.play();
                    playBtn.innerHTML = '<i class="fas fa-pause" style="color: #4CAF50; font-size: 0.9rem;"></i>';
                    isPlaying = true;
                };
                
                // زر كتم الصوت
                let isMuted = false;
                muteBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (isMuted) {
                        audioEl.muted = false;
                        muteBtn.innerHTML = '<i class="fas fa-volume-up" style="color: #4CAF50; font-size: 0.9rem;"></i>';
                        isMuted = false;
                    } else {
                        audioEl.muted = true;
                        muteBtn.innerHTML = '<i class="fas fa-volume-mute" style="color: #f44336; font-size: 0.9rem;"></i>';
                        isMuted = true;
                    }
                };
                
                // ✅ تحديث عداد الوقت الحالي (يتزايد من 0:00 إلى المدة الإجمالية)
                audioEl.ontimeupdate = () => {
                    const minutes = Math.floor(audioEl.currentTime / 60);
                    const seconds = Math.floor(audioEl.currentTime % 60);
                    if (timeSpan) {
                        timeSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    }
                };
                
                // ✅ عند انتهاء التشغيل، يعود العداد إلى 0:00
                audioEl.onended = () => {
                    playBtn.innerHTML = '<i class="fas fa-play" style="color: #4CAF50; font-size: 0.9rem;"></i>';
                    isPlaying = false;
                    if (timeSpan) timeSpan.textContent = '0:00';
                };
            }
        }, 10);
    } 
    // ✅✅✅ قسم الفيديو المعدل (حجم موحد + إطار أخضر)
    else if (msg.type === 'video') {
        let videoSrc = msg.data;
        if (videoSrc && typeof videoSrc === 'string') {
            if (!videoSrc.startsWith('data:video') && !videoSrc.startsWith('http')) {
                videoSrc = 'data:video/mp4;base64,' + videoSrc;
            }
        }
        div.innerHTML = `
            <div style="position:relative; width: 250px; border-radius: 12px; overflow: hidden; background:#000; border: 2px solid #4CAF50;">
                <video controls preload="metadata" playsinline style="width:100%; height: auto; max-height: 200px; display:block;">
                    <source src="${videoSrc}" type="video/mp4">
                </video>
            </div>
            <div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>
        `;
    } 
    else if (msg.type === 'file') {
        // ✅ التصميم المطلوب للملفات (بحجم ثابت مع break-all للأسماء الطويلة)
        let fileName = msg.fileName || 'ملف';
        
        // حساب حجم الملف تقريباً
        let fileSize = '';
        if (msg.data && typeof msg.data === 'string') {
            const sizeInBytes = Math.ceil(msg.data.length * 0.75);
            if (sizeInBytes < 1024) fileSize = sizeInBytes + ' B';
            else if (sizeInBytes < 1024 * 1024) fileSize = (sizeInBytes / 1024).toFixed(1) + ' KB';
            else fileSize = (sizeInBytes / (1024 * 1024)).toFixed(1) + ' MB';
        }
        
        // عرض اسم الملف كاملاً مع التفاف تلقائي وكسر الكلمات الطويلة
        let displayName = fileName;
        
        div.innerHTML = `
            <div class="message-content file-card" style="background: #4CAF50; border-radius: 16px; padding: 10px 12px; display: flex; align-items: center; gap: 12px; min-width: 250px; max-width: 280px; border: 1px solid #4CAF50;">
                <!-- أيقونة الملف داخل دائرة بيضاء -->
                <div style="background: white; border-radius: 50%; width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1); flex-shrink: 0;">
                    <span style="font-size: 1.5rem;">📄</span>
                </div>
                
                <!-- معلومات الملف -->
                <div style="flex: 1; overflow: hidden; min-width: 0;">
                    <div style="font-weight: bold; font-size: 0.85rem; word-break: break-all; color: white; line-height: 1.3;">${this.escapeHtml(displayName)}</div>
                    ${fileSize ? `<div style="font-size: 0.65rem; color: rgba(255,255,255,0.8); margin-top: 4px;">${fileSize}</div>` : ''}
                </div>
                
                <!-- زر التحميل (أيقونة فقط) -->
                <div style="color: white; cursor: pointer; background: rgba(255,255,255,0.2); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;" 
                     onclick="event.stopPropagation(); window.openFile('${msg.data}', '${msg.fileName || 'ملف'}')"
                     onmouseover="this.style.background='rgba(255,255,255,0.3)'"
                     onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                    <i class="fas fa-download" style="font-size: 1rem; pointer-events: none;"></i>
                </div>
            </div>
            <div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>
        `;
    }
    
    c.appendChild(div); 
    c.scrollTop = c.scrollHeight;
},
    

   // ==================== القسم 26.1: showImagePreview (عرض الصورة بشكل مكبر مع إطار ثابت وملء الشاشة) ====================
showImagePreview(imageSrc) {
    // إزالة أي نافذة سابقة
    const existingPreview = document.getElementById('imagePreviewModal');
    if (existingPreview) existingPreview.remove();
    
    // إنشاء النافذة المنبثقة (الإطار الخارجي الثابت)
    const modal = document.createElement('div');
    modal.id = 'imagePreviewModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.95);
        z-index: 10050;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        touch-action: pan-x pan-y;
    `;
    
    // ========== طلب ملء الشاشة ==========
    const requestFullscreen = (element) => {
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        }
    };
    
    // دخول ملء الشاشة عند فتح الصورة
    setTimeout(() => {
        requestFullscreen(modal);
    }, 100);
    
    // ========== الإطار الثابت (يغطي كامل الشاشة) ==========
    const frame = document.createElement('div');
    frame.style.cssText = `
        position: absolute;
        top: 20px;
        left: 20px;
        right: 20px;
        bottom: 20px;
        border: 3px solid #4CAF50;
        border-radius: 20px;
        pointer-events: none;
        z-index: 10051;
        box-shadow: 0 0 0 2px rgba(76,175,80,0.3);
    `;
    
    // ========== حاوية الصورة (تتحرك داخلها) ==========
    const imageContainer = document.createElement('div');
    imageContainer.style.cssText = `
        position: absolute;
        top: 20px;
        left: 20px;
        right: 20px;
        bottom: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        touch-action: none;
    `;
    
    const img = document.createElement('img');
    img.src = imageSrc;
    img.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
        object-fit: contain;
        border-radius: 12px;
        transition: transform 0.1s ease;
        cursor: default;
        touch-action: none;
    `;
    
    // منع القائمة المنبثقة عند الضغط المطول
    img.oncontextmenu = (e) => {
        e.preventDefault();
        return false;
    };
    
    // ========== الأزرار (داخل الإطار، فوق الصورة) ==========
    const buttonOverlay = document.createElement('div');
    buttonOverlay.style.cssText = `
        position: absolute;
        top: 30px;
        left: 0;
        right: 0;
        display: flex;
        justify-content: space-between;
        padding: 0 35px;
        pointer-events: none;
        z-index: 10052;
    `;
    
    // زر الرجوع (سهم) - داخل الإطار
    const backBtn = document.createElement('button');
    backBtn.innerHTML = '<i class="fas fa-arrow-right"></i>';
    backBtn.style.cssText = `
        background: rgba(0,0,0,0.7);
        border: 2px solid #4CAF50;
        border-radius: 50%;
        width: 45px;
        height: 45px;
        cursor: pointer;
        font-size: 1.2rem;
        backdrop-filter: blur(5px);
        transition: all 0.2s;
        color: white;
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    backBtn.onmouseover = () => { backBtn.style.background = '#4CAF50'; };
    backBtn.onmouseout = () => { backBtn.style.background = 'rgba(0,0,0,0.7)'; };
    backBtn.onclick = () => {
        // الخروج من ملء الشاشة أولاً
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        modal.remove();
    };
    
    // زر التحميل - داخل الإطار
    const downloadBtn = document.createElement('button');
    downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
    downloadBtn.style.cssText = `
        background: rgba(0,0,0,0.7);
        border: 2px solid #4CAF50;
        border-radius: 50%;
        width: 45px;
        height: 45px;
        cursor: pointer;
        font-size: 1.2rem;
        backdrop-filter: blur(5px);
        transition: all 0.2s;
        color: white;
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    downloadBtn.onmouseover = () => { downloadBtn.style.background = '#4CAF50'; };
    downloadBtn.onmouseout = () => { downloadBtn.style.background = 'rgba(0,0,0,0.7)'; };
    downloadBtn.onclick = (e) => {
        e.stopPropagation();
        const link = document.createElement('a');
        link.href = imageSrc;
        link.download = 'image.jpg';
        link.click();
    };
    
    buttonOverlay.appendChild(backBtn);
    buttonOverlay.appendChild(downloadBtn);
    
    // ========== متغيرات للتكبير والتصغير باللمس ==========
    let currentScale = 1;
    let initialDistance = 0;
    let initialScale = 1;
    let startX = 0, startY = 0;
    let translateX = 0, translateY = 0;
    let isTouching = false;
    
    const minScale = 0.8;
    const maxScale = 3;
    
    const updateTransform = () => {
        img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
    };
    
    // معالج اللمس للتكبير والتصغير
    img.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touches = e.touches;
        
        if (touches.length === 2) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            initialDistance = Math.hypot(dx, dy);
            initialScale = currentScale;
            isTouching = false;
        } else if (touches.length === 1) {
            startX = touches[0].clientX - translateX;
            startY = touches[0].clientY - translateY;
            isTouching = true;
        }
    });
    
    img.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touches = e.touches;
        
        if (touches.length === 2 && initialDistance > 0) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const newDistance = Math.hypot(dx, dy);
            let newScale = initialScale * (newDistance / initialDistance);
            newScale = Math.min(maxScale, Math.max(minScale, newScale));
            
            if (newScale !== currentScale) {
                currentScale = newScale;
                updateTransform();
            }
        } else if (touches.length === 1 && isTouching && currentScale > 1) {
            translateX = touches[0].clientX - startX;
            translateY = touches[0].clientY - startY;
            
            const maxTranslateX = (currentScale - 1) * 150;
            const maxTranslateY = (currentScale - 1) * 150;
            translateX = Math.min(maxTranslateX, Math.max(-maxTranslateX, translateX));
            translateY = Math.min(maxTranslateY, Math.max(-maxTranslateY, translateY));
            
            updateTransform();
        }
    });
    
    img.addEventListener('touchend', (e) => {
        e.preventDefault();
        initialDistance = 0;
        isTouching = false;
        
        if (currentScale < 0.95) {
            currentScale = 1;
            translateX = 0;
            translateY = 0;
            updateTransform();
        }
    });
    
    modal.addEventListener('touchmove', (e) => {
        if (e.target === img || imageContainer.contains(e.target)) {
            e.preventDefault();
        }
    }, { passive: false });
    
    imageContainer.appendChild(img);
    modal.appendChild(frame);
    modal.appendChild(imageContainer);
    modal.appendChild(buttonOverlay);
    
    // إغلاق بزر ESC (والخروج من ملء الشاشة)
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            if (document.getElementById('imagePreviewModal')) modal.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
    
    // إغلاق عند الضغط خارج الصورة
    modal.onclick = (e) => {
        if (e.target === modal || e.target === frame || e.target === imageContainer) {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            modal.remove();
        }
    };
    
    document.body.appendChild(modal);
},


    
    // ==================== القسم 27: sendMessage ====================
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
    
    // ==================== القسم 28: sendFileWithRetry ====================
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
    
    // ==================== القسم 29: _ensureChannelReady ====================
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
    
    // ==================== القسم 30: sendImage ====================
    async sendImage(file) { 
        if (!this.currentChat) return;
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return;
        }
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
            CallSystem.dc.send(JSON.stringify({ type: 'file_selection_start', timestamp: Date.now() }));
        }
        
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
    
    // ==================== القسم 31: sendVideoFile ====================
    async sendVideoFile(file) { 
        if (!this.currentChat) return;
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return;
        }
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
            CallSystem.dc.send(JSON.stringify({ type: 'file_selection_start', timestamp: Date.now() }));
        }
        
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
    
    // ==================== القسم 32: sendFile ====================
    async sendFile(file) { 
        if (!this.currentChat) return;
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return;
        }
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
            CallSystem.dc.send(JSON.stringify({ type: 'file_selection_start', timestamp: Date.now() }));
        }
        
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
    
    // ==================== القسم 33: sendVoiceNote ====================
    async sendVoiceNote(audioBlob) { 
        if (!this.currentChat) return;
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return;
        }
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
            CallSystem.dc.send(JSON.stringify({ type: 'file_selection_start', timestamp: Date.now() }));
        }
        
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
    
    // ==================== القسم 34: shareLocationDirect ====================
    
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
            const lat = p.coords.latitude.toFixed(6);
            const lng = p.coords.longitude.toFixed(6);
            const locationData = {
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                url: `https://www.google.com/maps?q=${lat},${lng}`
            };
            
            this.showLocationSwipeModalWithClicks(locationData);
            
        }, () => { 
            alert('❌ فشل تحديد موقعك');
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    }
},

showLocationSwipeModalWithClicks(locationData) {
    const existing = document.getElementById('locationSwipeModal');
    if (existing) existing.remove();
    
    const appColor = '#2196F3';
    
    const overlay = document.createElement('div');
    overlay.id = 'locationSwipeModal';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.85);
        z-index: 10003;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: system-ui, sans-serif;
        backdrop-filter: blur(5px);
    `;
    
    overlay.innerHTML = `
        <style>
            .toggle-switch {
                position: relative;
                display: inline-block;
                width: 60px;
                height: 30px;
            }
            .toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #555;
                transition: 0.3s;
                border-radius: 30px;
            }
            .toggle-slider:before {
                position: absolute;
                content: "";
                height: 24px;
                width: 24px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: 0.3s;
                border-radius: 50%;
            }
            input:checked + .toggle-slider {
                background-color: #4CAF50;
            }
            input:checked + .toggle-slider:before {
                transform: translateX(30px);
            }
            .click-preset {
                background: #1a1a2e;
                color: white;
                border: 1px solid #4CAF50;
                padding: 6px 12px;
                border-radius: 20px;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 0.9rem;
                min-width: 40px;
            }
            .click-preset:hover {
                background: #4CAF50;
                border-color: #4CAF50;
            }
            .click-preset.selected {
                background: #4CAF50;
                border-color: #4CAF50;
            }
        </style>
        
        <div style="background: #0a0e27; border-radius: 40px; width: 340px; max-width: 90%; padding: 30px 20px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
            <div style="font-size: 3rem; margin-bottom: 10px;">🗺️</div>
            <h3 style="color: white; margin: 0 0 5px;">مشاركة الموقع</h3>
            <p style="color: #aaa; font-size: 0.8rem; margin-bottom: 20px;">هل تريد مشاركة موقعك الحالي</p>
            
            <!-- الإحداثيات -->
            <div style="background: rgba(76,175,80,0.15); border-radius: 20px; padding: 12px; margin-bottom: 20px;">
                <div style="color: #4CAF50; font-size: 0.9rem; font-weight: bold; margin-bottom: 5px;">الإحداثيات</div>
                <div style="color: white; font-weight: bold; font-size: 0.9rem;">${locationData.lat} , ${locationData.lng}</div>
            </div>
            
            <!-- عدد مرات فتح الموقع -->
            <div style="margin-bottom: 15px;">
                <div style="color: white; font-size: 0.9rem; font-weight: bold; margin-bottom: 10px; text-align: center;">عدد مرات فتح الموقع</div>
                
                <!-- ✅ أزرار اختيار من 1 إلى 5 فقط (في المنتصف) -->
                <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 10px 0;">
                    <button type="button" class="click-preset" data-clicks="1">1</button>
                    <button type="button" class="click-preset" data-clicks="2">2</button>
                    <button type="button" class="click-preset" data-clicks="3">3</button>
                    <button type="button" class="click-preset" data-clicks="4">4</button>
                    <button type="button" class="click-preset" data-clicks="5">5</button>
                </div>
            </div>
            
            <!-- زر السحب -->
            <div style="margin-bottom: 15px;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 12px;">
                    <span style="color: white; font-size: 0.8rem;">بلا حدود</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="unlimitedToggle">
                        <span class="toggle-slider"></span>
                    </label>
                    <span style="color: #aaa; font-size: 0.8rem;">محدود</span>
                </div>
            </div>
            
            <!-- نص توضيحي -->
            <p style="color: #888; font-size: 0.65rem; margin: 10px 0;">بعد انتهاء العدد، سيغلق الموقع تلقائياً</p>
            
            <!-- شريط السحب -->
            <div class="swipe-container" style="width: 100%; margin: 20px 0; position: relative;">
                <div id="swipeButton" style="width: 100%; height: 70px; border-radius: 50px; position: relative; overflow: hidden; cursor: grab; user-select: none; touch-action: none; background: linear-gradient(90deg, #1a5a2a 0%, #1a5a2a 50%, #8b1a1a 50%, #8b1a1a 100%); border: 2px solid ${appColor};">
                    <div style="position: absolute; top: 10px; bottom: 10px; left: 50%; width: 2px; background: ${appColor}; transform: translateX(-50%);"></div>
                    <div style="position: absolute; top: 50%; left: 50%; width: 10px; height: 10px; background: ${appColor}; border-radius: 50%; transform: translate(-50%, -50%);"></div>
                    
                    <div id="leftThumb" style="position: absolute; top: 8px; left: 8px; width: 54px; height: 54px; border-radius: 50%; background: linear-gradient(145deg, #4CAF50, #1b5e2a); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; cursor: grab; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: left 0.05s linear; color: white;">
                        <i class="fas fa-check"></i>
                    </div>
                    <div id="rightThumb" style="position: absolute; top: 8px; right: 8px; width: 54px; height: 54px; border-radius: 50%; background: linear-gradient(145deg, #f44336, #8b0000); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; cursor: grab; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: right 0.05s linear; color: white;">
                        <i class="fas fa-times"></i>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    const button = document.getElementById('swipeButton');
    const leftThumb = document.getElementById('leftThumb');
    const rightThumb = document.getElementById('rightThumb');
    const unlimitedToggle = document.getElementById('unlimitedToggle');
    
    let selectedClicks = 1;
    let selectedButton = null;
    
    // معالج أزرار الاختيار
    document.querySelectorAll('.click-preset').forEach(btn => {
        btn.onclick = () => {
            if (selectedButton) {
                selectedButton.style.background = '#1a1a2e';
                selectedButton.style.borderColor = '#4CAF50';
            }
            selectedButton = btn;
            selectedButton.style.background = '#4CAF50';
            selectedButton.style.borderColor = '#4CAF50';
            selectedClicks = parseInt(btn.dataset.clicks);
        };
    });
    
    // تحديد الزر الأول (1) بشكل افتراضي
    const firstBtn = document.querySelector('.click-preset[data-clicks="1"]');
    if (firstBtn) {
        firstBtn.style.background = '#4CAF50';
        firstBtn.style.borderColor = '#4CAF50';
        selectedButton = firstBtn;
        selectedClicks = 1;
    }
    
    unlimitedToggle.addEventListener('change', () => {
        if (unlimitedToggle.checked) {
            document.querySelectorAll('.click-preset').forEach(btn => {
                btn.style.opacity = '0.5';
                btn.style.pointerEvents = 'none';
            });
        } else {
            document.querySelectorAll('.click-preset').forEach(btn => {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            });
            if (selectedButton) {
                selectedButton.style.background = '#4CAF50';
            }
        }
    });
    
    const buttonWidth = button.clientWidth;
    const centerPos = buttonWidth / 2;
    const maxLeftMove = centerPos - 35;
    const maxRightMove = centerPos - 35;
    
    let isDraggingLeft = false, isDraggingRight = false;
    let leftCurrentPos = 8, rightCurrentPos = 8;
    
    const onLeftStart = (e) => {
        e.preventDefault();
        isDraggingLeft = true;
        leftThumb.style.transition = 'none';
    };
    
    const onLeftMove = (e) => {
        if (!isDraggingLeft) return;
        e.preventDefault();
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const rect = button.getBoundingClientRect();
        let newLeft = clientX - rect.left - 27;
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
            
            let maxClicks;
            if (unlimitedToggle.checked) {
                maxClicks = 999999;
            } else {
                maxClicks = selectedClicks;
                if (maxClicks < 1) maxClicks = 1;
                if (maxClicks > 5) maxClicks = 5;
            }
            
            locationData.maxClicks = maxClicks;
            locationData.clicksRemaining = maxClicks;
            
            setTimeout(() => {
                CallSystem.dc.send(JSON.stringify({ type: 'location', data: locationData, id: Date.now().toString() }));
                const msgId = Date.now().toString();
                this.saveMessage(this.currentChat, { id: msgId, type: 'location', data: locationData, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                this.displayMessage({ id: msgId, type: 'location', data: locationData, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                overlay.remove();
            }, 200);
        } else {
            leftThumb.style.left = '8px';
        }
    };
    
    const onRightStart = (e) => {
        e.preventDefault();
        isDraggingRight = true;
        rightThumb.style.transition = 'none';
    };
    
    const onRightMove = (e) => {
        if (!isDraggingRight) return;
        e.preventDefault();
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const rect = button.getBoundingClientRect();
        let newRight = rect.right - clientX - 27;
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
                overlay.remove();
            }, 200);
        } else {
            rightThumb.style.right = '8px';
        }
    };
    
    leftThumb.addEventListener('mousedown', onLeftStart);
    leftThumb.addEventListener('touchstart', onLeftStart, { passive: false });
    rightThumb.addEventListener('mousedown', onRightStart);
    rightThumb.addEventListener('touchstart', onRightStart, { passive: false });
    
    document.addEventListener('mousemove', (e) => { onLeftMove(e); onRightMove(e); });
    document.addEventListener('mouseup', () => { onLeftEnd(); onRightEnd(); });
    document.addEventListener('touchmove', (e) => { onLeftMove(e); onRightMove(e); }, { passive: false });
    document.addEventListener('touchend', () => { onLeftEnd(); onRightEnd(); });
    
    setTimeout(() => {
        if (document.getElementById('locationSwipeModal')) overlay.remove();
    }, 30000);
}, 
    
    
    
    // ==================== القسم 35: saveMessage ====================
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

   // ==================== القسم 36: updateLastMessage ====================
updateLastMessage(friendId, lastMessage) { 
    document.querySelectorAll('.chat-item').forEach(item => { 
        if (item.getAttribute('onclick')?.includes(friendId)) { 
            const lm = item.querySelector('.last-message'), tm = item.querySelector('.chat-time'); 
            if (lm) lm.textContent = lastMessage; 
            if (tm) tm.textContent = 'الآن'; 
        } 
    }); 
},

// ==================== القسم 37: closeChat ====================
closeChat() {
    console.log('🔴 closeChat - بدء إغلاق المحادثة');
    console.log('currentChat:', this.currentChat);
    console.log('featuresEnabled قبيل الإغلاق:', this.featuresEnabled);
    
    const chatId = this.currentChat;
    
    if (chatId) {
        console.log('📤 إرسال إشارة إلغاء إلى:', chatId);
        this.sendFeatureCancelImmediately(chatId);
        this.sendConversationStatus(false);
        
        // ✅ حذف جميع الملفات والوسائط (صور، فيديو، بصمات، ملفات) عند إغلاق المحادثة
        const key = `chat_${chatId}`;
        const messages = this.messages[chatId] || [];
        // إبقاء النصوص فقط، حذف كل ما هو ليس نصاً
        const filteredMessages = messages.filter(msg => msg.type === 'text');
        this.messages[chatId] = filteredMessages;
        localStorage.setItem(key, JSON.stringify(filteredMessages));
        console.log('✅ تم تنظيف الملفات والوسائط من localStorage');
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
    
    
    // ==================== القسم 38: escapeHtml ====================
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
};

// ==================== القسم 39: تشغيل النظام ====================
ChatSystem.init();
