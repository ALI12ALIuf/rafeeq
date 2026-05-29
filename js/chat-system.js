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
    
    // ==================== القسم 2.5: دالة تحديث زر التفعيل (مركزية) ====================
    updateFeatureToggleUI() {
        const toggleInput = document.getElementById('featureToggleInput');
        if (!toggleInput) return;
        
        toggleInput.checked = this.featuresEnabled;
        
        const canUseToggle = (this.friendInConversation && this.friendOnline);
        toggleInput.disabled = !canUseToggle;
        
        const featureSwitchLabel = document.getElementById('featureSwitchLabel');
        if (featureSwitchLabel) {
            if (!canUseToggle) {
                featureSwitchLabel.style.opacity = '0.5';
                featureSwitchLabel.style.pointerEvents = 'none';
            } else {
                featureSwitchLabel.style.opacity = '1';
                featureSwitchLabel.style.pointerEvents = 'auto';
            }
        }
        
        console.log(`🎛️ تحديث زر التفعيل: checked=${this.featuresEnabled}, disabled=${!canUseToggle}`);
    },
    
    // ==================== القسم 2.6: إعادة تعيين الميزات بالكامل ====================
    async fullFeaturesReset() {
        console.log('🔄 بدء إعادة تعيين الميزات بالكامل...');
        
        // ✅ 1. إغلاق Data Channel
        if (CallSystem.dc) {
            try {
                CallSystem.dc.close();
                console.log('✅ تم إغلاق Data Channel');
            } catch(e) {}
            CallSystem.dc = null;
        }
        
        // ✅ 2. إغلاق PeerConnection
        if (CallSystem.pc) {
            try {
                CallSystem.pc.close();
                console.log('✅ تم إغلاق PeerConnection');
            } catch(e) {}
            CallSystem.pc = null;
        }
        
        // ✅ 3. حذف جميع إشارات WebRTC العالقة
        if (this.currentChat && typeof CallSystem !== 'undefined' && CallSystem.deleteAllWebRTCSignals) {
            await CallSystem.deleteAllWebRTCSignals(this.currentChat);
            console.log('✅ تم حذف إشارات WebRTC العالقة');
        }
        
        // ✅ 4. إعادة تعيين حالة الميزات
        this.featuresEnabled = false;
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        this.friendInConversation = false;
        
        // ✅ 5. تحديث واجهة المستخدم
        this.updateAllButtons();
        
        console.log('✅ اكتمل إعادة تعيين الميزات بالكامل');
    },
    
    // ==================== القسم 3: init ====================
    init() { 
        this.loadAllChats(); 
        this.setupPageFocusListener();
        this.setupFeatureButton();
        this.setupBeforeUnloadListener();
        this.cleanMediaMessagesOnLoad();
    },

    // ==================== القسم 3.5: cleanMediaMessagesOnLoad ====================
    cleanMediaMessagesOnLoad() {
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
    
    // ==================== القسم 4: setupBeforeUnloadListener ====================
    setupBeforeUnloadListener() {
        window.addEventListener('beforeunload', () => {
            if (this.currentChat && this.featuresEnabled) {
                console.log('🚪 الصفحة تغلق - سيتم إلغاء الميزات محلياً');
            }
        });
    },

    // ==================== القسم 5: setupFeatureButton ====================
    setupFeatureButton() {
        setTimeout(() => {
            const oldBtn = document.getElementById('enableFeaturesBtn');
            if (oldBtn) oldBtn.remove();
            
            const oldContainer = document.getElementById('featureToggleContainer');
            if (oldContainer) oldContainer.remove();
            
            const oldKickBtn = document.getElementById('kickBtn');
            if (oldKickBtn) oldKickBtn.remove();
            
            const container = document.querySelector('.chat-actions, .message-input-container, .chat-footer, #conversationPage');
            if (!container) {
                console.log('⚠️ لم يتم العثور على حاوية للزر');
                return;
            }
            
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
                    @keyframes featureBlink {
                        0% { background-color: #f44336; }
                        50% { background-color: #2196F3; }
                        100% { background-color: #f44336; }
                    }
                    .feature-switch.blinking .feature-slider {
                        animation: featureBlink 0.8s ease-in-out infinite;
                    }
                    .kick-btn {
                        background: none;
                        border: none;
                        color: #f44336;
                        font-size: 1.1rem;
                        cursor: pointer;
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.3s ease;
                        margin-right: 5px;
                        opacity: 0.5;
                        pointer-events: none;
                    }
                    .kick-btn.active {
                        opacity: 1;
                        pointer-events: auto;
                    }
                    .kick-btn.active:hover {
                        background: rgba(244, 67, 54, 0.1);
                        transform: scale(1.05);
                    }
                    .kick-btn.active:active {
                        transform: scale(0.95);
                    }
                `;
                document.head.appendChild(style);
            }
            
            const toggleContainer = document.createElement('div');
            toggleContainer.className = 'feature-toggle-container';
            toggleContainer.id = 'featureToggleContainer';
            
            toggleContainer.innerHTML = `
                <button id="kickBtn" class="kick-btn" title="طرد المستخدم من المحادثة">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
                <span class="feature-toggle-label" style="color: #f44336;">○</span>
                <label class="feature-switch" id="featureSwitchLabel">
                    <input type="checkbox" id="featureToggleInput">
                    <span class="feature-slider" id="featureToggleSlider"></span>
                </label>
                <span class="feature-toggle-label" style="color: #4CAF50;">●</span>
            `;
            
            container.appendChild(toggleContainer);
            
            const toggleInput = document.getElementById('featureToggleInput');
            const kickBtn = document.getElementById('kickBtn');
            
            if (!toggleInput) return;
            
            window.featureToggleInput = toggleInput;
            
            toggleInput.onclick = (e) => {
                console.log('🔘 تم الضغط على زر التفعيل');
                
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
            
            if (kickBtn) {
                kickBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.kickUserFromConversation();
                };
            }
            
            if (this.featuresEnabled && toggleInput) {
                toggleInput.checked = true;
            }
            
            this.updateKickButtonState();
            
            console.log('✅ تم إضافة زر التفعيل وزر الطرد');
        }, 1000);
    },

    // ✅ دالة تحديث حالة زر الطرد
    updateKickButtonState() {
        const kickBtn = document.getElementById('kickBtn');
        if (!kickBtn) return;
        
        const canUse = (this.friendInConversation && this.featuresEnabled);
        
        if (canUse) {
            kickBtn.classList.add('active');
            kickBtn.title = 'طرد المستخدم من المحادثة';
        } else {
            kickBtn.classList.remove('active');
            kickBtn.title = this.featuresEnabled ? 'غير متاح - الطرف الآخر ليس في المحادثة' : 'غير متاح - الميزات غير مفعلة';
        }
    },

    // ==================== القسم 5.1: طرد المستخدم من المحادثة ====================
    async kickUserFromConversation() {
        if (!this.currentChat) {
            console.log('❌ لا توجد محادثة نشطة');
            return;
        }
        
        if (!this.featuresEnabled || !this.friendInConversation) {
            console.log('❌ لا يمكن الطرد - الميزات غير مفعلة أو الطرف الآخر ليس في المحادثة');
            return;
        }
        
        console.log('👢 محاولة طرد المستخدم:', this.currentChat);
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
            try {
                CallSystem.dc.send(JSON.stringify({ 
                    type: 'force_close_conversation',
                    timestamp: Date.now()
                }));
                console.log('✅ تم إرسال إشارة الطرد مباشرة عبر Data Channel');
            } catch(e) {
                console.error('❌ فشل إرسال إشارة الطرد:', e);
            }
        }
        
        await this.fullFeaturesReset();
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
            console.log('📨 تم إرسال طلب تفعيل الميزات');
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
        
        if (this.currentChat) {
            this.friendInConversation = true;
            console.log('✅ تم تفعيل friendInConversation يدوياً بعد قبول الطلب');
        }
        
        console.log('✅ featuresEnabled =', this.featuresEnabled);
        
        if (this.featureBlinkInterval) {
            clearInterval(this.featureBlinkInterval);
            this.featureBlinkInterval = null;
        }
        
        const toggleInput = document.getElementById('featureToggleInput');
        const switchLabel = document.getElementById('featureSwitchLabel');
        
        if (toggleInput) toggleInput.checked = true;
        if (switchLabel) switchLabel.classList.remove('blinking');
        
        if (this.currentChat) {
            try {
                console.log('🔧 محاولة فتح Data Channel...');
                await CallSystem.ensureDataChannelOnly(this.currentChat);
            } catch(e) {
                console.error('❌ خطأ في فتح Data Channel:', e);
            }
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
    },
    
    // ==================== القسم 10: handleFeatureResponse ====================
    async handleFeatureResponse(fromId, action) {
        console.log('📨 handleFeatureResponse - from:', fromId, 'action:', action);
        
        if (action === 'accepted') {
            this.featuresEnabled = true;
            this.featureRequestPending = false;
            this.featureRequestReceived = false;
            
            if (this.currentChat === fromId) {
                this.friendInConversation = true;
                console.log('✅ تم تفعيل friendInConversation يدوياً');
            }
            
            if (this.featureBlinkInterval) {
                clearInterval(this.featureBlinkInterval);
                this.featureBlinkInterval = null;
            }
            
            const toggleInput = document.getElementById('featureToggleInput');
            const switchLabel = document.getElementById('featureSwitchLabel');
            
            if (toggleInput) toggleInput.checked = true;
            if (switchLabel) switchLabel.classList.remove('blinking');
            
            if (this.currentChat) {
                try {
                    console.log('🔧 محاولة فتح Data Channel...');
                    await CallSystem.ensureDataChannelOnly(this.currentChat);
                } catch(e) {
                    console.error('❌ خطأ في فتح Data Channel:', e);
                }
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
            
            const toggleInput = document.getElementById('featureToggleInput');
            if (toggleInput) toggleInput.checked = false;
            
            console.log('❌ تم رفض طلب تفعيل الميزات');
            
        } else if (action === 'disable') {
            console.log('🔴 استلام إشارة إيقاف من الطرف الآخر');
            await this.fullFeaturesReset();
        }
    },

    // ==================== القسم 10.1: disableFeatures ====================
    async disableFeatures() {
        console.log('🔴 disableFeatures - إلغاء تفعيل الميزات');
        await this.fullFeaturesReset();
        console.log('✅ تم إلغاء تفعيل الميزات');
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
        
        const toggleInput = document.getElementById('featureToggleInput');
        const switchLabel = document.getElementById('featureSwitchLabel');
        
        if (toggleInput) toggleInput.checked = false;
        if (switchLabel) switchLabel.classList.remove('blinking');
        
        if (chatId) {
            console.log('📤 تم إلغاء الميزات محلياً');
        }
        
        this.updateAllButtons();
    },
    
    // ==================== القسم 13: handleFeatureCancel ====================
    handleFeatureCancel() {
        console.log('🔓 handleFeatureCancel - تم استلام إلغاء من الطرف الآخر');
        this.fullFeaturesReset();
        console.log('✅ handleFeatureCancel - انتهى');
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
        
        this.updateFeatureToggleUI();
        this.updateKickButtonState();
        
        console.log(`🎛️ تحديث الأزرار: friendInConversation=${this.friendInConversation}, featuresEnabled=${this.featuresEnabled}, canUse=${canUse}`);
    },
    
    // ==================== القسم 15: setupPageFocusListener ====================
    setupPageFocusListener() {
        window.addEventListener('focus', () => {
            if (this.currentChat && this.friendOnline && this.featuresEnabled) {
                console.log('👁️ الصفحة في المقدمة');
            }
        });
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
                <div id="progressFill" style="background: linear-gradient(90deg, #4CAF50, #8BC34A); height: 100%; width: 0%; position: absolute; left: 0; top: 0; transition: width 0.3s;"></div>
                <span id="progressPercent" style="position: relative; z-index: 2; font-size: 12px; font-weight: bold; color: white;">0%</span>
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
    
    // ==================== القسم 22: updateFriendConversationStatus ====================
    updateFriendConversationStatus(friendId, isInConversation) {
        if (this.currentChat !== friendId) {
            this._pendingConversationStatus[friendId] = isInConversation;
        }
        this.updateAllButtons();
    },

    // ==================== القسم 23: openChat ====================
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId;
        
        if (this._pendingConversationStatus && this._pendingConversationStatus[friendId] !== undefined) {
            this.friendInConversation = this._pendingConversationStatus[friendId];
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
        
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
        setTimeout(() => this.setupFeatureButton(), 500);
        
        setTimeout(() => {
            if (this.featuresEnabled && (!CallSystem.dc || CallSystem.dc.readyState !== 'open')) {
                console.log('⚠️ الميزات مفعلة ولكن القناة مغلقة - إعادة تعيين');
                this.fullFeaturesReset();
            }
        }, 1000);
    },
    
    // ==================== القسم 24: updateFriendStatus ====================
    updateFriendStatus(friendId, isOnline, userData = null) {
        if (this.currentChat !== friendId) return;
        
        if (!isOnline) {
            if (!this.featuresEnabled) {
                this.friendOnline = false;
                const statusEl = document.getElementById('conversationStatus');
                if (statusEl) {
                    statusEl.innerHTML = '🔴 غير متصل';
                    statusEl.className = 'conversation-status offline';
                }
                return;
            }
            
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
            
            this.offlineTimer = setTimeout(async () => {
                if (!this.friendOnline && this.featuresEnabled) {
                    console.log('🔴 120 ثانية وما رجع - إعادة تعيين الميزات بالكامل');
                    
                    if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
                        try {
                            CallSystem.dc.send(JSON.stringify({ 
                                type: 'force_disable_features',
                                timestamp: Date.now()
                            }));
                            console.log('✅ تم إرسال إشارة إلغاء الميزات');
                        } catch(e) {}
                    }
                    
                    await this.fullFeaturesReset();
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
        
        if (isOnline && this.offlineStartTime && (Date.now() - this.offlineStartTime) < 120000) {
            console.log('✅ الطرف الآخر عاد خلال 120 ثانية - إبقاء الميزات');
            
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
        
        this.friendOnline = isOnline;
        
        const statusEl = document.getElementById('conversationStatus');
        if (!statusEl) return;
        
        if (isOnline) {
            statusEl.innerHTML = '🟢 متصل';
            statusEl.className = 'conversation-status online';
        } else {
            statusEl.innerHTML = '🔴 غير متصل';
            statusEl.className = 'conversation-status offline';
        }
        
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
        
        const formatDateTime = (dateObj) => {
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            let hours = dateObj.getHours();
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            const formattedHours = String(hours).padStart(2, '0');
            return `${year}-${month}-${day} ${formattedHours}:${minutes} ${ampm}`;
        };
        
        const dateTime = formatDateTime(new Date(msg.time));
        
        if (msg.type === 'text') {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            
            if (msg.sender === 'me') {
                contentDiv.style.cssText = 'border: 1.5px solid #2196F3; background: var(--card-bg); color: var(--text); border-radius: 18px; padding: 10px 14px; max-width: 100%; word-wrap: break-word; position: relative;';
            } else {
                contentDiv.style.cssText = 'border: 1.5px solid #4CAF50; background: var(--card-bg); color: var(--text); border-radius: 18px; padding: 10px 14px; max-width: 100%; word-wrap: break-word; position: relative;';
            }
            
            const textSpan = document.createElement('span');
            textSpan.style.cssText = 'font-size: 1rem; line-height: 1.4; display: block;';
            textSpan.innerHTML = this.escapeHtml(msg.text);
            contentDiv.appendChild(textSpan);
            div.appendChild(contentDiv);
            
            const existingTextMessages = c.querySelectorAll('.message.sent, .message.received');
            const currentMessageCount = existingTextMessages.length;
            
            if (currentMessageCount % 10 === 0) {
                const timeSeparator = document.createElement('div');
                timeSeparator.className = 'time-separator';
                timeSeparator.style.cssText = 'text-align: center; margin: 15px 0; font-size: 0.7rem; color: var(--text-light); opacity: 0.7; direction: ltr;';
                timeSeparator.textContent = dateTime;
                c.appendChild(timeSeparator);
            }
        } 
        else if (msg.type === 'image') {
            let imageSrc = msg.data;
            if (imageSrc && typeof imageSrc === 'string' && !imageSrc.startsWith('data:image') && !imageSrc.startsWith('http')) {
                imageSrc = 'data:image/jpeg;base64,' + imageSrc;
            }
            
            const imageDiv = document.createElement('div');
            imageDiv.className = 'message-image-wrapper';
            const borderColor = msg.sender === 'me' ? '#2196F3' : '#4CAF50';
            imageDiv.style.cssText = `cursor: pointer; display: inline-block; border: 2px solid ${borderColor}; border-radius: 12px; overflow: hidden; width: 200px; height: 200px;`;
            
            const img = document.createElement('img');
            img.src = imageSrc;
            img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';
            img.loading = 'lazy';
            
            img.onclick = () => { this.showImagePreview(imageSrc); };
            
            imageDiv.appendChild(img);
            div.appendChild(imageDiv);
        }
        else if (msg.type === 'video') {
            let videoSrc = msg.data;
            if (videoSrc && typeof videoSrc === 'string' && !videoSrc.startsWith('data:video') && !videoSrc.startsWith('http')) {
                videoSrc = 'data:video/mp4;base64,' + videoSrc;
            }
            
            const borderColor = msg.sender === 'me' ? '#2196F3' : '#4CAF50';
            
            div.innerHTML = `
                <div class="message-content video-thumbnail" style="position: relative; width: 250px; border-radius: 12px; overflow: hidden; background: #000; border: 2px solid ${borderColor}; cursor: pointer;">
                    <video style="width: 100%; height: auto; max-height: 200px; display: block; pointer-events: none;" preload="metadata">
                        <source src="${videoSrc}" type="video/mp4">
                    </video>
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.6); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);">
                        <i class="fas fa-expand" style="color: white; font-size: 1.5rem;"></i>
                    </div>
                </div>
            `;
            
            const videoContainer = div.querySelector('.video-thumbnail');
            videoContainer.onclick = () => { this.showVideoPreview(videoSrc); };
        }
        else if (msg.type === 'file') {
            let fileName = msg.fileName || 'ملف';
            let fileSize = '';
            if (msg.data && typeof msg.data === 'string') {
                const sizeInBytes = Math.ceil(msg.data.length * 0.75);
                if (sizeInBytes < 1024) fileSize = sizeInBytes + ' B';
                else if (sizeInBytes < 1024 * 1024) fileSize = (sizeInBytes / 1024).toFixed(1) + ' KB';
                else fileSize = (sizeInBytes / (1024 * 1024)).toFixed(1) + ' MB';
            }
            
            const borderColor = msg.sender === 'me' ? '#2196F3' : '#4CAF50';
            
            div.innerHTML = `
                <div class="message-content file-card" style="background: #4CAF50; border-radius: 16px; padding: 10px 12px; display: flex; align-items: center; gap: 12px; min-width: 250px; max-width: 280px; border: 1.5px solid ${borderColor};">
                    <div style="background: white; border-radius: 50%; width: 45px; height: 45px; display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 1.5rem;">📄</span>
                    </div>
                    <div style="flex: 1; overflow: hidden; min-width: 0;">
                        <div style="font-weight: bold; font-size: 0.85rem; word-break: break-all; color: white;">${this.escapeHtml(fileName)}</div>
                        ${fileSize ? `<div style="font-size: 0.65rem; color: rgba(255,255,255,0.8);">${fileSize}</div>` : ''}
                    </div>
                    <div style="color: white; cursor: pointer; background: rgba(255,255,255,0.2); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;" 
                         onclick="event.stopPropagation(); window.openFile('${msg.data}', '${msg.fileName || 'ملف'}')">
                        <i class="fas fa-download" style="font-size: 1rem;"></i>
                    </div>
                </div>
            `;
        }
        
        c.appendChild(div); 
        c.scrollTop = c.scrollHeight;
    },
    
    // ==================== القسم 27: sendMessage ====================
    async sendMessage(text) { 
        if (!this.currentChat || !text.trim()) return false; 
        const mid = Date.now().toString(); 
        
        if (this.featuresEnabled && this.friendInConversation && CallSystem.dc && CallSystem.dc.readyState === 'open') {
            try {
                const messageData = {
                    type: 'direct_text',
                    id: mid,
                    text: text.trim(),
                    sender: 'me',
                    time: new Date().toISOString()
                };
                CallSystem.dc.send(JSON.stringify(messageData));
                
                this.saveMessage(this.currentChat, { id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                this.displayMessage({ id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                console.log('✅ تم إرسال النص مباشرة عبر Data Channel');
                return true;
            } catch(e) {
                console.log('⚠️ فشل الإرسال المباشر');
            }
        }
        
        try { 
            const pr = await SecureChatSystem.getMyPrivateKey(), pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); 
            if (!pr || !pu) return false;
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu), enc = await SecureChatSystem.encryptData(text.trim(), sk); 
            await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'text', data: enc, timestamp: Date.now() }); 
            this.saveMessage(this.currentChat, { id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            this.displayMessage({ id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            return true; 
        } catch (e) { 
            console.error('❌ فشل إرسال النص:', e);
            return false; 
        } 
    },
    
    // ==================== القسم 35: saveMessage ====================
    saveMessage(friendId, message) { 
        const key = `chat_${friendId}`; 
        let h = []; 
        try { h = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { h = []; }
        h.push(message); 
        
        // ✅ حد أقصى 300 رسالة لكل محادثة
        const MAX_MESSAGES = 300;
        if (h.length > MAX_MESSAGES) {
            const excess = h.length - MAX_MESSAGES;
            h = h.slice(excess);
            console.log(`🧹 تم حذف ${excess} رسالة قديمة من محادثة ${friendId}`);
        }
        
        try { localStorage.setItem(key, JSON.stringify(h)); } catch (e) {
            h = h.slice(Math.floor(h.length * 0.2));
            try { localStorage.setItem(key, JSON.stringify(h)); } catch (e2) { h = h.slice(-10); try { localStorage.setItem(key, JSON.stringify(h)); } catch (e3) {} }
        }
        this.messages[friendId] = h; 
    },
    
    // ==================== القسم 37: closeChat ====================
    async closeChat() {
        console.log('🔴 closeChat - بدء إغلاق المحادثة');
        
        const chatId = this.currentChat;
        
        if (chatId) {
            if (typeof CallSystem !== 'undefined' && CallSystem.deleteAllWebRTCSignals) {
                CallSystem.deleteAllWebRTCSignals(chatId);
            }
            
            const key = `chat_${chatId}`;
            const messages = this.messages[chatId] || [];
            const filteredMessages = messages.filter(msg => msg.type === 'text');
            this.messages[chatId] = filteredMessages;
            localStorage.setItem(key, JSON.stringify(filteredMessages));
            console.log('✅ تم تنظيف الملفات والوسائط من localStorage');
            
            await this.fullFeaturesReset();
        }
        
        this.featuresEnabled = false;
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        
        if (this.featureBlinkInterval) {
            clearInterval(this.featureBlinkInterval);
            this.featureBlinkInterval = null;
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
