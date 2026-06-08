// ========== chat-system.js - النسخة النهائية بعد إزالة التنظيف ==========

const ChatSystem = {
    currentChat: null, messages: {},
    friendInConversation: false,
    _pendingConversationStatus: {},
    
    featuresEnabled: false,
    featureRequestPending: false,
    featureRequestReceived: false,
    featureBlinkInterval: null,
    
    offlineStartTime: null,
    offlineTimer: null,
    offlineCountdownInterval: null,
    
    // ==================== القسم 2.5 ====================
    updateFeatureToggleUI() {
        const toggleInput = document.getElementById('featureToggleInput');
        if (!toggleInput) return;
        
        toggleInput.checked = this.featuresEnabled;
        toggleInput.disabled = false;
        
        const featureSwitchLabel = document.getElementById('featureSwitchLabel');
        if (featureSwitchLabel) {
            featureSwitchLabel.style.opacity = '1';
            featureSwitchLabel.style.pointerEvents = 'auto';
        }
        
        console.log(`🎛️ تحديث زر التفعيل: checked=${this.featuresEnabled}, disabled=false`);
    },
    
    // ==================== القسم 3: init ====================
    init() { 
        this.loadAllChats(); 
        this.setupPageFocusListener();
        this.setupFeatureButton();
        this.setupBeforeUnloadListener();
    },
    
    // ==================== القسم 4 ====================
    setupBeforeUnloadListener() {
        window.addEventListener('beforeunload', () => {
            if (this.currentChat && this.featuresEnabled) {
                console.log('🚪 الصفحة تغلق');
            }
        });
    },

    // ==================== القسم 5 ====================
    setupFeatureButton() {
        const toggleContainer = document.getElementById('featureToggleContainer');
        const kickBtn = document.getElementById('kickBtn');
        const toggleInput = document.getElementById('featureToggleInput');
        
        if (!toggleContainer || !kickBtn || !toggleInput) {
            console.log('⚠️ لم يتم العثور على الأزرار في HTML');
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
                    font-size: 1.3rem;
                    cursor: pointer;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
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
        
        toggleContainer.style.display = 'inline-flex';
        kickBtn.style.display = 'inline-flex';
        
        window.featureToggleInput = toggleInput;
        
        toggleInput.onclick = (e) => {
            console.log('🔘 تم الضغط على زر التفعيل');
            
            if (this.featuresEnabled) {
                console.log('⚠️ الميزات مفعلة، سيتم إلغاء التفعيل');
                this.featuresEnabled = false;
                this.featureRequestPending = false;
                this.featureRequestReceived = false;
                if (toggleInput) toggleInput.checked = false;
                this.updateAllButtons();
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
        this.updateFeatureToggleUI();
        
        console.log('✅ تم تهيئة أزرار التفعيل والطرد');
    },

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
    
    // ==================== القسم 5.1 ====================
    async kickUserFromConversation() {
        if (!this.currentChat) {
            console.log('❌ لا توجد محادثة نشطة');
            return;
        }
        
        if (!this.featuresEnabled || !this.friendInConversation) {
            console.log('❌ لا يمكن إنهاء المحادثة - الميزات غير مفعلة أو الطرف الآخر ليس في المحادثة');
            return;
        }
        
        console.log('👢 إنهاء المحادثة مع المستخدم:', this.currentChat);
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
            try {
                CallSystem.dc.send(JSON.stringify({ 
                    type: 'force_close_conversation',
                    timestamp: Date.now()
                }));
                console.log('✅ تم إرسال إشارة إنهاء المحادثة إلى:', this.currentChat);
            } catch(e) {
                console.error('❌ فشل إرسال إشارة إنهاء المحادثة:', e);
            }
        } else {
            console.log('❌ Data Channel غير مفتوح، لا يمكن إرسال إشارة');
        }
        
        this.currentChat = null;
        this.friendInConversation = false;
        this.featuresEnabled = false;
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        
        if (this.featureBlinkInterval) {
            clearInterval(this.featureBlinkInterval);
            this.featureBlinkInterval = null;
        }
        
        const toggleInput = document.getElementById('featureToggleInput');
        if (toggleInput) toggleInput.checked = false;
        
        const toggleContainer = document.getElementById('featureToggleContainer');
        const kickBtn = document.getElementById('kickBtn');
        if (toggleContainer) toggleContainer.style.display = 'none';
        if (kickBtn) kickBtn.style.display = 'none';
        
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        
        this.updateAllButtons();
        console.log('✅ تم إنهاء المحادثة');
    }, 
    
    // ==================== القسم 6 ====================
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
                
                const toggleInput = document.getElementById('featureToggleInput');
                if (toggleInput) toggleInput.checked = false;
                
                this.updateAllButtons();
                
                console.log('⏰ انتهت مهلة الانتظار (30 ثانية)، تم إلغاء الطلب');
            }
        }, 500);
    },  
    
    // ==================== القسم 7 ====================
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

    // ==================== القسم 8 ====================
    async handleFeatureRequest(fromId) {
        console.log('🔔 handleFeatureRequest - استلام طلب من:', fromId);
        
        this.featureRequestReceived = true;
        this.startFeatureBlink();
        console.log('📞 شخص يريد تفعيل الميزات - اضغط على الدائرة الحمراء');
        console.log('✅ تم تفعيل وضع الاستقبال');
    }, 
    
    // ==================== القسم 9 ====================
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
                console.log('✅ تم فتح Data Channel بنجاح');
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
    
    // ==================== القسم 10 ====================
    async handleFeatureResponse(fromId, action) {
        console.log('📨 handleFeatureResponse - from:', fromId, 'action:', action);
        
        if (action === 'accepted') {
            this.featuresEnabled = true;
            this.featureRequestPending = false;
            this.featureRequestReceived = false;
            
            if (this.currentChat === fromId) {
                this.friendInConversation = true;
                console.log('✅ تم تفعيل friendInConversation يدوياً بعد قبول الطلب من الطرف الآخر');
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
                    console.log('🔧 محاولة فتح Data Channel بعد قبول الطرف الآخر...');
                    await CallSystem.ensureDataChannelOnly(this.currentChat);
                    console.log('✅ تم فتح Data Channel بنجاح');
                } catch(e) {
                    console.error('❌ خطأ في فتح Data Channel:', e);
                }
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
                this.featureBlinkInterval = null;
            }
            
            const toggleInput = document.getElementById('featureToggleInput');
            const switchLabel = document.getElementById('featureSwitchLabel');
            
            if (toggleInput) toggleInput.checked = false;
            if (switchLabel) switchLabel.classList.remove('blinking');
            
            const btn = document.getElementById('enableFeaturesBtn');
            if (btn) btn.style.background = '#f44336';
            console.log('❌ تم رفض طلب تفعيل الميزات');
            
        } else if (action === 'disable') {
            console.log('🔴 استلام إشارة إيقاف من الطرف الآخر');
            
            this.featuresEnabled = false;
            this.featureRequestPending = false;
            this.featureRequestReceived = false;
            
            if (this.featureBlinkInterval) {
                clearInterval(this.featureBlinkInterval);
                this.featureBlinkInterval = null;
            }
            
            const toggleInput = document.getElementById('featureToggleInput');
            const switchLabel = document.getElementById('featureSwitchLabel');
            
            if (toggleInput) toggleInput.checked = false;
            if (switchLabel) switchLabel.classList.remove('blinking');
            
            const btn = document.getElementById('enableFeaturesBtn');
            if (btn) {
                btn.style.background = '#f44336';
                btn.title = 'تفعيل الميزات';
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
    
    const toggleInput = document.getElementById('featureToggleInput');
    const switchLabel = document.getElementById('featureSwitchLabel');
    
    if (toggleInput) toggleInput.checked = false;
    if (switchLabel) switchLabel.classList.remove('blinking');
    
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
    
    // ==================== القسم 13 ====================
    handleFeatureCancel() {
        console.log('🔓 handleFeatureCancel - تم استلام إلغاء من الطرف الآخر');
        
        this.featuresEnabled = false;
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        
        if (this.featureBlinkInterval) {
            clearInterval(this.featureBlinkInterval);
            this.featureBlinkInterval = null;
        }
        
        const toggleInput = document.getElementById('featureToggleInput');
        const switchLabel = document.getElementById('featureSwitchLabel');
        
        if (toggleInput) toggleInput.checked = false;
        if (switchLabel) switchLabel.classList.remove('blinking');
        
        this.updateAllButtons();
        console.log('⚠️ الطرف الآخر خرج من المحادثة، تم إلغاء تفعيل الميزات');
    },
    
    // ==================== القسم 14 ====================
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
    
    // ==================== القسم 15 ====================
    setupPageFocusListener() {
        window.addEventListener('focus', () => {
            if (this.currentChat && this.featuresEnabled) {
                console.log('👁️ الصفحة في المقدمة');
            }
        });
    },

    closeConversation() {
        console.log("🚪 إغلاق صفحة المحادثة والعودة للقائمة الرئيسية");
        
        document.body.classList.remove('conversation-open');

        this.currentChat = null;
        this.friendInConversation = false;
        
        const conversationPage = document.querySelector('.conversation-page');
        if (conversationPage) conversationPage.style.display = 'none';
        
        const chatPage = document.querySelector('.page.active') || document.querySelector('.chat-page');
        if (chatPage) chatPage.style.display = 'block';
        
        if (this.featureBlinkInterval) {
            clearInterval(this.featureBlinkInterval);
            this.featureBlinkInterval = null;
        }
        const featureSwitch = document.querySelector('.feature-switch');
        if (featureSwitch) featureSwitch.classList.remove('blinking');
        
        this.updateFeatureToggleUI();
        
        const bottomNav = document.querySelector('.bottom-nav');
        if (bottomNav) bottomNav.style.setProperty('display', 'flex', 'important');
        
        const appHeader = document.querySelector('.app-header');
        if (appHeader) appHeader.style.setProperty('display', 'flex', 'important');
    }, 
    
    // ==================== القسم 17 ====================
    loadAllChats() { 
        for (let i = 0; i < localStorage.length; i++) { 
            const k = localStorage.key(i); 
            if (k && k.startsWith('chat_')) { 
                const fid = k.replace('chat_', ''); 
                try { this.messages[fid] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { this.messages[fid] = []; } 
            } 
        } 
    },
    
    // ==================== القسم 18 ====================
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
    
    // ==================== القسم 19 ====================
    updateProgressBar(percent, message) {
        const fill = document.getElementById('progressFill');
        const perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = Math.min(percent, 100) + '%';
        if (perc) perc.textContent = Math.round(percent) + '%';
    },
    
    // ==================== القسم 20 ====================
    hideProgressBar() { const bar = document.getElementById('progressBar'); if (bar) bar.remove(); },
    
    // ==================== القسم 23 ====================
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId;
        
        this.friendInConversation = false;
        
        document.body.classList.add('conversation-open');
        const nameEl = document.getElementById('conversationName'), avatarEl = document.getElementById('conversationAvatar');
        if (nameEl) nameEl.textContent = friendName;
        if (avatarEl) avatarEl.textContent = friendAvatar || '👤';
        document.querySelector('.chat-page').style.display = 'none'; 
        document.getElementById('conversationPage').style.display = 'flex';
        this.displayMessages(friendId);
        
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
        
        const toggleContainer = document.getElementById('featureToggleContainer');
        const kickBtn = document.getElementById('kickBtn');
        if (toggleContainer) toggleContainer.style.display = 'flex';
        if (kickBtn) kickBtn.style.display = 'flex';
        
        this.updateAllButtons();
        
        setTimeout(() => {
            if (this.featuresEnabled && (!CallSystem.dc || CallSystem.dc.readyState !== 'open')) {
                console.log('⚠️ الميزات مفعلة ولكن القناة مغلقة - إعادة تعيين الميزات');
                this.featuresEnabled = false;
                this.featureRequestPending = false;
                this.featureRequestReceived = false;
                
                const toggleInput = document.getElementById('featureToggleInput');
                if (toggleInput) toggleInput.checked = false;
                
                this.updateAllButtons();
                console.log('✅ تم إعادة تعيين الميزات (القناة كانت مغلقة)');
            }
        }, 1000);
    }, 
    
    // ==================== القسم 25 ====================
    displayMessages(friendId) { 
        const c = document.getElementById('messagesContainer'); 
        if (!c) return; 
        c.innerHTML = ''; 
        (this.messages[friendId] || []).forEach(m => this.displayMessage(m)); 
    },

    // ==================== القسم 26 ====================
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
        else if (msg.type === 'location') {
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
            
            const maxClicks = locationData.maxClicks;
            let clicksRemaining = locationData.clicksRemaining;
            
            if (clicksRemaining !== undefined && clicksRemaining <= 0) {
                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                contentDiv.style.cssText = 'background: #888; border-radius: 12px; padding: 8px 12px; display: inline-flex; align-items: center; justify-content: center; border: none;';
                contentDiv.innerHTML = `<i class="fas fa-lock" style="font-size: 1.2rem; color: white;"></i>`;
                div.appendChild(contentDiv);
            } else {
                const locationDiv = document.createElement('div');
                locationDiv.className = 'message-content location-card';
                const borderColor = msg.sender === 'me' ? '#2196F3' : '#4CAF50';
                locationDiv.style.cssText = `cursor: pointer; background: #4CAF50; border-radius: 12px; padding: 8px 12px; display: inline-flex; align-items: center; justify-content: center; border: 1.5px solid ${borderColor};`;
                locationDiv.innerHTML = `<i class="fas fa-map-marker-alt" style="font-size: 1.2rem; color: white;"></i>`;
                
                locationDiv.onclick = (e) => {
                    e.stopPropagation();
                    if (clicksRemaining !== undefined && clicksRemaining <= 0) return;
                    window.open(locationUrl, '_blank');
                    if (msg.sender !== 'me' && clicksRemaining !== undefined && maxClicks < 999999) {
                        clicksRemaining--;
                        msg.data.clicksRemaining = clicksRemaining;
                        if (clicksRemaining <= 0) {
                            locationDiv.style.background = '#888';
                            locationDiv.style.cursor = 'default';
                            locationDiv.innerHTML = `<i class="fas fa-lock" style="font-size: 1.2rem; color: white;"></i>`;
                            locationDiv.onclick = () => {};
                        }
                        if (ChatSystem.currentChat) {
                            const messages = ChatSystem.messages[ChatSystem.currentChat] || [];
                            const msgIndex = messages.findIndex(m => m.id === msg.id);
                            if (msgIndex !== -1) {
                                messages[msgIndex].data.clicksRemaining = clicksRemaining;
                            }
                        }
                    }
                };
                div.appendChild(locationDiv);
            }
        }
        else if (msg.type === 'image') {
            let imageSrc = msg.data;
            
            const imageDiv = document.createElement('div');
            imageDiv.className = 'message-image-wrapper';
            const borderColor = msg.sender === 'me' ? '#2196F3' : '#4CAF50';
            imageDiv.style.cssText = `cursor: pointer; display: inline-block; border: 2px solid ${borderColor}; border-radius: 12px; overflow: hidden; width: 200px; height: 200px;`;
            
            const img = document.createElement('img');
            img.src = imageSrc;
            img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';
            img.loading = 'lazy';
            
            img.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            };
            img.ondragstart = (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            };
            
            img.onclick = () => {
                this.showImagePreview(imageSrc);
            };
            
            imageDiv.appendChild(img);
            div.appendChild(imageDiv);
        } 
        else if (msg.type === 'voice') {
            let audioSrc = msg.data;
            
            const audioId = `audio_${msg.id}`;
            let audioDuration = 0;
            
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
            
            const borderColor = msg.sender === 'me' ? '#2196F3' : '#4CAF50';
            
            div.innerHTML = `
                <div class="message-content voice-message" style="background: #4CAF50; border-radius: 20px; padding: 8px 12px; display: inline-block; direction: ltr; border: 1.5px solid ${borderColor};">
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
            `;
            
            setTimeout(() => {
                const playBtn = div.querySelector('.voice-play-btn');
                const replayBtn = div.querySelector('.voice-replay-btn');
                const muteBtn = div.querySelector('.voice-mute-btn');
                const audioEl = document.getElementById(audioId);
                const timeSpan = document.getElementById(`time_${audioId}`);
                
                if (playBtn && audioEl) {
                    let isPlaying = false;
                    
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
                    
                    audioEl.ontimeupdate = () => {
                        const minutes = Math.floor(audioEl.currentTime / 60);
                        const seconds = Math.floor(audioEl.currentTime % 60);
                        if (timeSpan) {
                            timeSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                        }
                    };
                    
                    audioEl.onended = () => {
                        playBtn.innerHTML = '<i class="fas fa-play" style="color: #4CAF50; font-size: 0.9rem;"></i>';
                        isPlaying = false;
                        if (timeSpan) timeSpan.textContent = '0:00';
                    };
                }
            }, 10);
        } 
        else if (msg.type === 'video') {
            let videoSrc = msg.data;
            
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
            videoContainer.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            };
            
            videoContainer.onclick = (e) => {
                e.stopPropagation();
                this.showVideoPreview(videoSrc);
            };
        } 
        else if (msg.type === 'file') {
            let fileName = msg.fileName || 'ملف';
            let fileUrl = msg.data;
            
            let fileSize = '';
            
            let displayName = fileName;
            const borderColor = msg.sender === 'me' ? '#2196F3' : '#4CAF50';
            
            div.innerHTML = `
                <div class="message-content file-card" style="background: #4CAF50; border-radius: 16px; padding: 10px 12px; display: flex; align-items: center; gap: 12px; min-width: 250px; max-width: 280px; border: 1.5px solid ${borderColor};">
                    <div style="background: white; border-radius: 50%; width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1); flex-shrink: 0;">
                        <span style="font-size: 1.5rem;">📄</span>
                    </div>
                    
                    <div style="flex: 1; overflow: hidden; min-width: 0;">
                        <div style="font-weight: bold; font-size: 0.85rem; word-break: break-all; color: white; line-height: 1.3;">${this.escapeHtml(displayName)}</div>
                        ${fileSize ? `<div style="font-size: 0.65rem; color: rgba(255,255,255,0.8); margin-top: 4px;">${fileSize}</div>` : ''}
                    </div>
                    
                    <div style="color: white; cursor: pointer; background: rgba(255,255,255,0.2); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;" 
                         class="download-file-btn"
                         data-url="${fileUrl}"
                         data-name="${msg.fileName || 'ملف'}"
                         onmouseover="this.style.background='rgba(255,255,255,0.3)'"
                         onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                        <i class="fas fa-download" style="font-size: 1rem; pointer-events: none;"></i>
                    </div>
                </div>
            `;
            
            const downloadBtnDiv = div.querySelector('.download-file-btn');
            if (downloadBtnDiv) {
                downloadBtnDiv.onclick = (e) => {
                    e.stopPropagation();
                    const url = downloadBtnDiv.getAttribute('data-url');
                    const name = downloadBtnDiv.getAttribute('data-name');
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = name;
                    link.click();
                };
            }
        }
        
        c.appendChild(div); 
        c.scrollTop = c.scrollHeight;
    },
    
    // ==================== القسم 26.1 ====================
    showImagePreview(imageSrc) {
        const existingPreview = document.getElementById('imagePreviewModal');
        if (existingPreview) existingPreview.remove();
        
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
        
        modal.oncontextmenu = (e) => {
            e.preventDefault();
            return false;
        };
        
        const frame = document.createElement('div');
        frame.style.cssText = `
            position: absolute;
            top: 15px;
            left: 15px;
            right: 15px;
            bottom: 15px;
            border: 3px solid #4CAF50;
            border-radius: 20px;
            pointer-events: none;
            z-index: 10051;
            box-shadow: 0 0 0 2px rgba(76,175,80,0.3);
        `;
        
        const imageContainer = document.createElement('div');
        imageContainer.style.cssText = `
            position: absolute;
            top: 15px;
            left: 15px;
            right: 15px;
            bottom: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            touch-action: none;
            border-radius: 16px;
        `;
        
        const img = document.createElement('img');
        img.src = imageSrc;
        img.style.cssText = `
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            object-fit: contain;
            transition: transform 0.1s ease;
            cursor: default;
            touch-action: none;
        `;
        
        img.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        img.ondragstart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        img.oncopy = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        img.oncut = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        img.onselectstart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        
        const buttonOverlay = document.createElement('div');
        buttonOverlay.style.cssText = `
            position: absolute;
            top: 30px;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-between;
            padding: 0 30px;
            pointer-events: none;
            z-index: 10052;
        `;
        
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
            modal.remove();
        };
        
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
                
                const maxTranslateX = (currentScale - 1) * 200;
                const maxTranslateY = (currentScale - 1) * 200;
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
        
        imageContainer.appendChild(img);
        modal.appendChild(frame);
        modal.appendChild(imageContainer);
        modal.appendChild(buttonOverlay);
        
        const escHandler = (e) => {
            if (e.key === 'Escape' && document.getElementById('imagePreviewModal')) {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
        document.body.appendChild(modal);
    },

    // ==================== القسم 26.2 ====================
    showVideoPreview(videoSrc) {
        const existingPreview = document.getElementById('videoPreviewModal');
        if (existingPreview) existingPreview.remove();
        
        const modal = document.createElement('div');
        modal.id = 'videoPreviewModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.95);
            z-index: 10060;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        `;
        
        modal.oncontextmenu = (e) => {
            e.preventDefault();
            return false;
        };
        
        const frame = document.createElement('div');
        frame.style.cssText = `
            position: absolute;
            top: 15px;
            left: 15px;
            right: 15px;
            bottom: 15px;
            border: 3px solid #4CAF50;
            border-radius: 20px;
            pointer-events: none;
            z-index: 10061;
            box-shadow: 0 0 0 2px rgba(76,175,80,0.3);
        `;
        
        const contentContainer = document.createElement('div');
        contentContainer.style.cssText = `
            position: absolute;
            top: 15px;
            left: 15px;
            right: 15px;
            bottom: 15px;
            display: flex;
            flex-direction: column;
            background: #000;
            border-radius: 16px;
            overflow: hidden;
        `;
        
        const videoWrapper = document.createElement('div');
        videoWrapper.style.cssText = `
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            overflow: hidden;
        `;
        
        const video = document.createElement('video');
        video.src = videoSrc;
        video.style.cssText = `
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            object-fit: contain;
        `;
        video.controls = false;
        video.playsinline = true;
        
        video.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        video.ondragstart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        
        const topButtons = document.createElement('div');
        topButtons.style.cssText = `
            position: absolute;
            top: 30px;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-between;
            padding: 0 35px;
            pointer-events: none;
            z-index: 10062;
        `;
        
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
            if (video) video.pause();
            modal.remove();
        };
        
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
            link.href = videoSrc;
            link.download = 'video.mp4';
            link.click();
        };
        
        topButtons.appendChild(backBtn);
        topButtons.appendChild(downloadBtn);
        
        const controlsBar = document.createElement('div');
        controlsBar.style.cssText = `
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 20px;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(10px);
            padding: 15px 20px;
            border-top: 1px solid #4CAF50;
            z-index: 10062;
        `;
        
        const playPauseBtn = document.createElement('button');
        playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        playPauseBtn.style.cssText = `
            background: #4CAF50;
            border: none;
            border-radius: 50%;
            width: 45px;
            height: 45px;
            cursor: pointer;
            font-size: 1.1rem;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        `;
        
        const currentTimeSpan = document.createElement('span');
        currentTimeSpan.textContent = '0:00';
        currentTimeSpan.style.cssText = `color: white; font-size: 0.9rem; min-width: 45px; text-align: center; font-family: monospace;`;
        
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            flex: 1;
            max-width: 300px;
            height: 4px;
            background: rgba(255,255,255,0.3);
            border-radius: 2px;
            cursor: pointer;
            position: relative;
        `;
        
        const progressFill = document.createElement('div');
        progressFill.style.cssText = `
            width: 0%;
            height: 100%;
            background: #4CAF50;
            border-radius: 2px;
        `;
        progressBar.appendChild(progressFill);
        
        const durationSpan = document.createElement('span');
        durationSpan.textContent = '0:00';
        durationSpan.style.cssText = `color: white; font-size: 0.9rem; min-width: 45px; text-align: center; font-family: monospace;`;
        
        controlsBar.appendChild(playPauseBtn);
        controlsBar.appendChild(currentTimeSpan);
        controlsBar.appendChild(progressBar);
        controlsBar.appendChild(durationSpan);
        
        videoWrapper.appendChild(video);
        contentContainer.appendChild(videoWrapper);
        contentContainer.appendChild(controlsBar);
        
        modal.appendChild(frame);
        modal.appendChild(contentContainer);
        modal.appendChild(topButtons);
        
        video.addEventListener('loadedmetadata', () => {
            const minutes = Math.floor(video.duration / 60);
            const seconds = Math.floor(video.duration % 60);
            durationSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        });
        
        video.addEventListener('timeupdate', () => {
            const minutes = Math.floor(video.currentTime / 60);
            const seconds = Math.floor(video.currentTime % 60);
            currentTimeSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            const percent = (video.currentTime / video.duration) * 100;
            progressFill.style.width = percent + '%';
        });
        
        let isPlaying = false;
        playPauseBtn.onclick = () => {
            if (isPlaying) {
                video.pause();
                playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                isPlaying = false;
            } else {
                video.play();
                playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                isPlaying = true;
            }
        };
        
        video.onended = () => {
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            isPlaying = false;
        };
        
        progressBar.onclick = (e) => {
            const rect = progressBar.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percent = clickX / rect.width;
            video.currentTime = percent * video.duration;
        };
        
        const escHandler = (e) => {
            if (e.key === 'Escape' && document.getElementById('videoPreviewModal')) {
                if (video) video.pause();
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
        document.body.appendChild(modal);
        
        video.play().then(() => {
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            isPlaying = true;
        }).catch(() => {});
    },

    // ==================== القسم 27 ====================
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
                
                this.displayMessage({ id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                console.log('✅ تم إرسال النص مباشرة عبر Data Channel');
                return true;
            } catch(e) {
                console.log('⚠️ فشل الإرسال المباشر، الإرسال عبر Firebase بدلاً من ذلك:', e);
            }
        }
        
        try { 
            const pr = await SecureChatSystem.getMyPrivateKey(), pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); 
            if (!pr || !pu) return false;
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu), enc = await SecureChatSystem.encryptData(text.trim(), sk); 
            await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'text', data: enc, timestamp: Date.now() }); 
            this.displayMessage({ id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            console.log('✅ تم إرسال النص عبر Firebase (تشفير E2EE)');
            return true; 
        } catch (e) { 
            console.error('❌ فشل إرسال النص:', e);
            return false; 
        } 
    },   
    
    // ==================== القسم 28 ====================
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
    
    // ==================== القسم 29 ====================
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
    
    // ==================== القسم 30 ====================
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
                const msgId = Date.now().toString();
                const tempUrl = URL.createObjectURL(file);
                this.displayMessage({ id: msgId, type: 'image', data: tempUrl, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent', _blobUrl: tempUrl });
                setTimeout(() => URL.revokeObjectURL(tempUrl), 5000);
            } else alert('فشل إرسال الصورة');
        }
    },
    
    // ==================== القسم 31 ====================
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
                    const msgId = Date.now().toString();
                    const tempUrl = URL.createObjectURL(file);
                    
                    this.displayMessage({ id: msgId, type: 'video', data: tempUrl, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent', _blobUrl: tempUrl });
                    
                    setTimeout(() => URL.revokeObjectURL(tempUrl), 5000);
                    
                } catch (error) { alert('فشل معالجة الفيديو'); }
            } else alert('فشل إرسال الفيديو');
        }
    },
    
    // ==================== القسم 32 ====================
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
                const msgId = Date.now().toString();
                const tempUrl = URL.createObjectURL(file);
                this.displayMessage({ id: msgId, type: 'file', data: tempUrl, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent', _blobUrl: tempUrl });
                setTimeout(() => URL.revokeObjectURL(tempUrl), 5000);
            } else alert('فشل إرسال الملف');
        }
    },
    
    // ==================== القسم 33 ====================
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
                const msgId = Date.now().toString();
                const tempUrl = URL.createObjectURL(audioBlob);
                this.displayMessage({ id: msgId, type: 'voice', data: tempUrl, sender: 'me', time: new Date().toISOString(), status: 'sent', _blobUrl: tempUrl });
                setTimeout(() => URL.revokeObjectURL(tempUrl), 5000);
            } else alert('فشل إرسال البصمة الصوتية');
        }
    },
    
    // ==================== القسم 34 ====================
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
                
                <div style="background: rgba(76,175,80,0.15); border-radius: 20px; padding: 12px; margin-bottom: 20px;">
                    <div style="color: #4CAF50; font-size: 0.9rem; font-weight: bold; margin-bottom: 5px;">الإحداثيات</div>
                    <div style="color: white; font-weight: bold; font-size: 0.9rem;">${locationData.lat} , ${locationData.lng}</div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <div style="color: white; font-size: 0.9rem; font-weight: bold; margin-bottom: 10px; text-align: center;">عدد مرات فتح الموقع</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 10px 0;">
                        <button type="button" class="click-preset" data-clicks="1">1</button>
                        <button type="button" class="click-preset" data-clicks="2">2</button>
                        <button type="button" class="click-preset" data-clicks="3">3</button>
                        <button type="button" class="click-preset" data-clicks="4">4</button>
                        <button type="button" class="click-preset" data-clicks="5">5</button>
                    </div>
                </div>
                
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
                
                <p style="color: #888; font-size: 0.65rem; margin: 10px 0;">بعد انتهاء العدد، سيغلق الموقع تلقائياً</p>
                
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
    
    // ==================== القسم 36 ====================
    updateLastMessage(friendId, lastMessage) { 
        document.querySelectorAll('.chat-item').forEach(item => { 
            if (item.getAttribute('onclick')?.includes(friendId)) { 
                const lm = item.querySelector('.last-message'), tm = item.querySelector('.chat-time'); 
                if (lm) lm.textContent = lastMessage; 
                if (tm) tm.textContent = 'الآن'; 
            } 
        }); 
    },
    
    // ==================== القسم 38 ====================
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
};

// ==================== القسم 39 ====================
ChatSystem.init();

// ==================== فيكس الكيبورد ====================
const initVisualViewportFix = () => {
    if (!window.visualViewport) return;

    const fixViewportHeight = () => {
        const conversationPage = document.querySelector('.conversation-page');
        const messagesContainer = document.querySelector('.messages-container');
        
        if (conversationPage && document.body.classList.contains('conversation-open')) {
            const currentViewportHeight = window.visualViewport.height;
            conversationPage.style.height = `${currentViewportHeight}px`;
            
            if (messagesContainer) {
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 30);
            }
        }
    };

    window.visualViewport.addEventListener('resize', fixViewportHeight);
    window.visualViewport.addEventListener('scroll', fixViewportHeight);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVisualViewportFix);
} else {
    initVisualViewportFix();
}

// ==================== منع السحب خارج الرسائل ====================
document.addEventListener('touchmove', function(e) {
    if (document.body.classList.contains('conversation-open')) {
        const isMessagesContainer = e.target.closest('.messages-container');
        if (!isMessagesContainer) {
            e.preventDefault();
        }
    }
}, { passive: false });

// ==================== منع التكبير ====================
document.addEventListener('touchstart', function (e) {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function (e) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, { passive: false });
