// ========== chat-system.js - النسخة المعدلة مع الفصل التام ==========
// نظام الدردشة E2EE + نظام الحضور Presence - معدل للعمل مع الأنظمة المستقلة

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
    
    // ==================== دالة تحديث زر التفعيل ====================
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
        console.log(`🎛️ تحديث زر التفعيل: checked=${this.featuresEnabled}`);
    },
    
    // ==================== init ====================
    init() { 
        this.loadAllChats(); 
        this.setupPageFocusListener();
        this.setupFeatureButton();
        this.setupBeforeUnloadListener();
        this.cleanMediaMessagesOnLoad();
    },
    
    cleanMediaMessagesOnLoad() {
        for (const friendId in this.messages) {
            const messages = this.messages[friendId] || [];
            const filteredMessages = messages.filter(msg => msg.type === 'text');
            if (filteredMessages.length !== messages.length) {
                this.messages[friendId] = filteredMessages;
                localStorage.setItem(`chat_${friendId}`, JSON.stringify(filteredMessages));
            }
        }
        console.log('🧹 تم تنظيف جميع الملفات والوسائط من localStorage');
    },
    
    setupBeforeUnloadListener() {
        window.addEventListener('beforeunload', () => {
            if (this.currentChat && this.featuresEnabled) {
                console.log('🚪 الصفحة تغلق - سيتم إلغاء الميزات محلياً');
            }
        });
    },
    
    // ==================== setupFeatureButton ====================
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
            `;
            document.head.appendChild(style);
        }
        
        toggleContainer.style.display = 'inline-flex';
        kickBtn.style.display = 'inline-flex';
        window.featureToggleInput = toggleInput;
        
        toggleInput.onclick = (e) => {
            console.log('🔘 تم الضغط على زر التفعيل');
            if (this.featuresEnabled) {
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
        
        if (this.featuresEnabled && toggleInput) toggleInput.checked = true;
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
    
    // ==================== إنهاء المحادثة من الطرفين ====================
    async kickUserFromConversation() {
        if (!this.currentChat) return;
        if (!this.featuresEnabled || !this.friendInConversation) return;
        
        console.log('👢 إنهاء المحادثة مع المستخدم:', this.currentChat);
        
        if (ChatDataSystem.dc && ChatDataSystem.dc.readyState === 'open') {
            try {
                ChatDataSystem.dc.send(JSON.stringify({ type: 'force_close_conversation', timestamp: Date.now() }));
            } catch(e) {}
        }
        
        this.closeChat();
    },
    
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
    
    // ==================== requestEnableFeatures ====================
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
    
    // ==================== handleFeatureRequest ====================
    async handleFeatureRequest(fromId) {
        console.log('🔔 handleFeatureRequest - استلام طلب من:', fromId);
        this.featureRequestReceived = true;
        this.startFeatureBlink();
        console.log('📞 شخص يريد تفعيل الميزات - اضغط على الدائرة الحمراء');
    },
    
    // ==================== acceptFeatureRequest ====================
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
        
        // ✅ تهيئة نظام الملفات والصور المستقل فوراً
        if (this.currentChat) {
            try {
                console.log('🔧 تهيئة نظام نقل الملفات المستقل...');
                await ChatDataSystem.init(this.currentChat);
                console.log('✅ تم تهيئة نظام الملفات بنجاح');
            } catch(e) {
                console.error('❌ خطأ في تهيئة نظام الملفات:', e);
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
    
    // ==================== handleFeatureResponse ====================
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
            
            // ✅ تهيئة نظام الملفات والصور المستقل فوراً
            if (this.currentChat) {
                try {
                    console.log('🔧 تهيئة نظام نقل الملفات المستقل...');
                    await ChatDataSystem.init(this.currentChat);
                    console.log('✅ تم تهيئة نظام الملفات بنجاح');
                } catch(e) {
                    console.error('❌ خطأ في تهيئة نظام الملفات:', e);
                }
            }
            
            this.updateAllButtons();
            console.log('✅ تم تفعيل الميزات!');
            
        } else if (action === 'rejected') {
            this.featureRequestPending = false;
            this.featureRequestReceived = false;
            if (this.featureBlinkInterval) clearInterval(this.featureBlinkInterval);
            const toggleInput = document.getElementById('featureToggleInput');
            if (toggleInput) toggleInput.checked = false;
            console.log('❌ تم رفض طلب تفعيل الميزات');
            
        } else if (action === 'disable') {
            console.log('🔴 استلام إشارة إيقاف من الطرف الآخر');
            this.disableFeatures();
        }
    },
    
    // ==================== disableFeatures ====================
    async disableFeatures() {
        console.log('🔴 disableFeatures - إلغاء تفعيل الميزات');
        
        // ✅ إغلاق نظام الملفات المستقل
        ChatDataSystem.closeFullSystem();
        
        // ✅ إغلاق نظام المكالمات المستقل إن كان نشطاً
        if (VoiceVideoSystem.isInCall) {
            VoiceVideoSystem.endCall();
        }
        
        if (this.currentChat && typeof CallSystem !== 'undefined' && CallSystem.deleteAllWebRTCSignals) {
            await CallSystem.deleteAllWebRTCSignals(this.currentChat);
        }
        
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
        console.log('✅ تم إلغاء تفعيل الميزات');
    },
    
    // ==================== resetFeatures ====================
    resetFeatures() {
        console.log('🔄 resetFeatures - إعادة تعيين الميزات');
        
        ChatDataSystem.cleanup();
        if (VoiceVideoSystem.isInCall) VoiceVideoSystem.endCall();
        
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
        
        this.updateAllButtons();
    },
    
    // ==================== handleFeatureCancel ====================
    handleFeatureCancel() {
        console.log('🔓 handleFeatureCancel - تم استلام إلغاء من الطرف الآخر');
        this.disableFeatures();
    },
    
    // ==================== updateAllButtons ====================
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
                             document.querySelector('#audioCallBtn');
        
        const videoCallBtn = document.querySelector('[onclick="startVideoCall()"]') || 
                             document.querySelector('.video-call-btn') ||
                             document.querySelector('#videoCallBtn');
        
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
    
    // ==================== setupPageFocusListener ====================
    setupPageFocusListener() {
        window.addEventListener('focus', () => {
            if (this.currentChat && this.featuresEnabled) {
                console.log('👁️ الصفحة في المقدمة');
            }
        });
    },
    
    // ==================== closeConversation ====================
    closeConversation() {
        console.log("🚪 إغلاق صفحة المحادثة والعودة للقائمة الرئيسية");
        document.body.classList.remove('conversation-open');
        
        // ✅ تنظيف الأنظمة المستقلة
        ChatDataSystem.closeFullSystem();
        if (VoiceVideoSystem.isInCall) VoiceVideoSystem.endCall();
        
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
    
    // ==================== loadAllChats ====================
    loadAllChats() { 
        for (let i = 0; i < localStorage.length; i++) { 
            const k = localStorage.key(i); 
            if (k && k.startsWith('chat_')) { 
                const fid = k.replace('chat_', ''); 
                try { this.messages[fid] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { this.messages[fid] = []; } 
            } 
        } 
    },
    
    // ==================== showProgressBar ====================
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
                <div id="progressFill" style="background: linear-gradient(90deg, #4CAF50, #8BC34A); height: 100%; width: 0%; position: absolute; left: 0; top: 0; transition: width 0.3s; border-radius: 0 2px 2px 0;"></div>
                <span id="progressPercent" style="position: relative; z-index: 2; font-size: 12px; font-weight: bold; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">0%</span>
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
    
    // ==================== openChat ====================
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId;
        this.friendInConversation = false;
        this.resetFeatures();
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
            if (this.featuresEnabled) {
                console.log('⚠️ الميزات مفعلة ولكن القناة مغلقة - إعادة تعيين الميزات');
                this.featuresEnabled = false;
                this.featureRequestPending = false;
                this.featureRequestReceived = false;
                const toggleInput = document.getElementById('featureToggleInput');
                if (toggleInput) toggleInput.checked = false;
                this.updateAllButtons();
            }
        }, 1000);
    },
    
    // ==================== displayMessages ====================
    displayMessages(friendId) { const c = document.getElementById('messagesContainer'); if (!c) return; c.innerHTML = ''; (this.messages[friendId] || []).forEach(m => this.displayMessage(m)); },
    
    // ==================== displayMessage ====================
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
            return `${year}-${month}-${day} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
        };
        
        const dateTime = formatDateTime(new Date(msg.time));
        
        if (msg.type === 'text') {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.style.cssText = `border: 1.5px solid ${msg.sender === 'me' ? '#2196F3' : '#4CAF50'}; background: var(--card-bg); color: var(--text); border-radius: 18px; padding: 10px 14px; max-width: 100%; word-wrap: break-word;`;
            const textSpan = document.createElement('span');
            textSpan.style.cssText = 'font-size: 1rem; line-height: 1.4; display: block;';
            textSpan.innerHTML = this.escapeHtml(msg.text);
            contentDiv.appendChild(textSpan);
            div.appendChild(contentDiv);
            
            const existingTextMessages = c.querySelectorAll('.message.sent, .message.received');
            if (existingTextMessages.length % 10 === 0) {
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
            if (typeof locationData === 'object' && locationData.url) locationUrl = locationData.url;
            else if (typeof locationData === 'string') {
                const match = locationData.match(/https?:\/\/[^\s]+/);
                locationUrl = match ? match[0] : locationData;
            }
            
            const maxClicks = locationData.maxClicks;
            let clicksRemaining = locationData.clicksRemaining;
            
            if (clicksRemaining !== undefined && clicksRemaining <= 0) {
                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                contentDiv.style.cssText = 'background: #888; border-radius: 12px; padding: 8px 12px; display: inline-flex; align-items: center; justify-content: center;';
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
                                ChatSystem.saveMessage(ChatSystem.currentChat, messages[msgIndex]);
                            }
                        }
                    }
                };
                div.appendChild(locationDiv);
            }
        }
        else if (msg.type === 'image') {
            let imageSrc = msg.data;
            if (imageSrc && typeof imageSrc === 'string' && !imageSrc.startsWith('data:image') && !imageSrc.startsWith('http')) {
                imageSrc = 'data:image/jpeg;base64,' + imageSrc;
            }
            const imageDiv = document.createElement('div');
            imageDiv.className = 'message-image-wrapper';
            imageDiv.style.cssText = `cursor: pointer; display: inline-block; border: 2px solid ${msg.sender === 'me' ? '#2196F3' : '#4CAF50'}; border-radius: 12px; overflow: hidden; width: 200px; height: 200px;`;
            const img = document.createElement('img');
            img.src = imageSrc;
            img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';
            img.loading = 'lazy';
            img.oncontextmenu = (e) => { e.preventDefault(); return false; };
            img.ondragstart = (e) => { e.preventDefault(); return false; };
            img.onclick = () => { this.showImagePreview(imageSrc); };
            imageDiv.appendChild(img);
            div.appendChild(imageDiv);
        } 
        else if (msg.type === 'voice') {
            let audioSrc = msg.data;
            if (audioSrc && typeof audioSrc === 'string' && !audioSrc.startsWith('data:audio')) {
                audioSrc = 'data:audio/webm;base64,' + audioSrc;
            }
            const audioId = `audio_${msg.id}`;
            const borderColor = msg.sender === 'me' ? '#2196F3' : '#4CAF50';
            div.innerHTML = `
                <div class="message-content voice-message" style="background: #4CAF50; border-radius: 20px; padding: 8px 12px; display: inline-block; direction: ltr; border: 1.5px solid ${borderColor};">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button class="voice-play-btn" data-audio="${audioId}" style="background: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer;"><i class="fas fa-play" style="color: #4CAF50;"></i></button>
                        <button class="voice-replay-btn" data-audio="${audioId}" style="background: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer;"><i class="fas fa-sync-alt" style="color: #f44336;"></i></button>
                        <div><span class="voice-time" id="time_${audioId}" style="color: white;">0:00</span><span id="duration_${audioId}" style="color: white; font-size: 0.7rem; display: block;">0:00</span></div>
                        <button class="voice-mute-btn" data-audio="${audioId}" style="background: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer;"><i class="fas fa-volume-up" style="color: #4CAF50;"></i></button>
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
                let isPlaying = false;
                if (playBtn && audioEl) {
                    playBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (isPlaying) { audioEl.pause(); playBtn.innerHTML = '<i class="fas fa-play" style="color: #4CAF50;"></i>'; isPlaying = false; }
                        else { audioEl.play(); playBtn.innerHTML = '<i class="fas fa-pause" style="color: #4CAF50;"></i>'; isPlaying = true; }
                    };
                    replayBtn.onclick = (e) => {
                        e.stopPropagation();
                        audioEl.pause(); audioEl.currentTime = 0;
                        playBtn.innerHTML = '<i class="fas fa-play" style="color: #4CAF50;"></i>';
                        isPlaying = false;
                        if (timeSpan) timeSpan.textContent = '0:00';
                        audioEl.play();
                        playBtn.innerHTML = '<i class="fas fa-pause" style="color: #4CAF50;"></i>';
                        isPlaying = true;
                    };
                    let isMuted = false;
                    muteBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (isMuted) { audioEl.muted = false; muteBtn.innerHTML = '<i class="fas fa-volume-up" style="color: #4CAF50;"></i>'; isMuted = false; }
                        else { audioEl.muted = true; muteBtn.innerHTML = '<i class="fas fa-volume-mute" style="color: #f44336;"></i>'; isMuted = true; }
                    };
                    audioEl.ontimeupdate = () => {
                        const minutes = Math.floor(audioEl.currentTime / 60);
                        const seconds = Math.floor(audioEl.currentTime % 60);
                        if (timeSpan) timeSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    };
                    audioEl.onended = () => { playBtn.innerHTML = '<i class="fas fa-play" style="color: #4CAF50;"></i>'; isPlaying = false; if (timeSpan) timeSpan.textContent = '0:00'; };
                }
            }, 10);
        } 
        else if (msg.type === 'video') {
            let videoSrc = msg.data;
            if (videoSrc && typeof videoSrc === 'string' && !videoSrc.startsWith('data:video') && !videoSrc.startsWith('http')) {
                videoSrc = 'data:video/mp4;base64,' + videoSrc;
            }
            div.innerHTML = `
                <div class="message-content video-thumbnail" style="position: relative; width: 250px; border-radius: 12px; overflow: hidden; background: #000; border: 2px solid ${msg.sender === 'me' ? '#2196F3' : '#4CAF50'}; cursor: pointer;">
                    <video style="width: 100%; height: auto; max-height: 200px; display: block;" preload="metadata"><source src="${videoSrc}" type="video/mp4"></video>
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.6); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-expand" style="color: white; font-size: 1.5rem;"></i></div>
                </div>
            `;
            const videoContainer = div.querySelector('.video-thumbnail');
            videoContainer.onclick = (e) => { e.stopPropagation(); this.showVideoPreview(videoSrc); };
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
            div.innerHTML = `
                <div class="message-content file-card" style="background: #4CAF50; border-radius: 16px; padding: 10px 12px; display: flex; align-items: center; gap: 12px; min-width: 250px; border: 1.5px solid ${msg.sender === 'me' ? '#2196F3' : '#4CAF50'};">
                    <div style="background: white; border-radius: 50%; width: 45px; height: 45px; display: flex; align-items: center; justify-content: center;"><span style="font-size: 1.5rem;">📄</span></div>
                    <div style="flex: 1; overflow: hidden;"><div style="font-weight: bold; font-size: 0.85rem; word-break: break-all; color: white;">${this.escapeHtml(fileName)}</div>${fileSize ? `<div style="font-size: 0.65rem; color: rgba(255,255,255,0.8);">${fileSize}</div>` : ''}</div>
                    <div style="color: white; cursor: pointer; background: rgba(255,255,255,0.2); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;" onclick="event.stopPropagation(); window.openFile && window.openFile('${msg.data}', '${msg.fileName || 'ملف'}')"><i class="fas fa-download"></i></div>
                </div>
            `;
        }
        
        c.appendChild(div); 
        c.scrollTop = c.scrollHeight;
    },
    
    // ==================== showImagePreview (مختصراً للطول) ====================
    showImagePreview(imageSrc) {
        const existingPreview = document.getElementById('imagePreviewModal');
        if (existingPreview) existingPreview.remove();
        const modal = document.createElement('div');
        modal.id = 'imagePreviewModal';
        modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:10050;display:flex;align-items:center;justify-content:center;`;
        const img = document.createElement('img');
        img.src = imageSrc;
        img.style.cssText = 'max-width:90%;max-height:90%;object-fit:contain;';
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'position:absolute;top:20px;right:20px;background:rgba(0,0,0,0.5);color:white;border:none;border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer;';
        closeBtn.onclick = () => modal.remove();
        modal.appendChild(img);
        modal.appendChild(closeBtn);
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        document.body.appendChild(modal);
    },
    
    showVideoPreview(videoSrc) {
        const existingPreview = document.getElementById('videoPreviewModal');
        if (existingPreview) existingPreview.remove();
        const modal = document.createElement('div');
        modal.id = 'videoPreviewModal';
        modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:10060;display:flex;align-items:center;justify-content:center;`;
        const video = document.createElement('video');
        video.src = videoSrc;
        video.controls = true;
        video.autoplay = true;
        video.style.cssText = 'max-width:90%;max-height:90%;';
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'position:absolute;top:20px;right:20px;background:rgba(0,0,0,0.5);color:white;border:none;border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer;';
        closeBtn.onclick = () => { video.pause(); modal.remove(); };
        modal.appendChild(video);
        modal.appendChild(closeBtn);
        modal.onclick = (e) => { if (e.target === modal) { video.pause(); modal.remove(); } };
        document.body.appendChild(modal);
        video.play().catch(() => {});
    },
    
    // ==================== sendMessage ====================
    async sendMessage(text) { 
        if (!this.currentChat || !text.trim()) return false; 
        const mid = Date.now().toString(); 
        
        if (this.featuresEnabled && this.friendInConversation && ChatDataSystem.dc && ChatDataSystem.dc.readyState === 'open') {
            try {
                const messageData = {
                    type: 'direct_text',
                    id: mid,
                    text: text.trim(),
                    sender: 'me',
                    time: new Date().toISOString()
                };
                ChatDataSystem.dc.send(JSON.stringify(messageData));
                this.saveMessage(this.currentChat, { id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
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
            this.saveMessage(this.currentChat, { id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            this.displayMessage({ id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            return true; 
        } catch (e) { 
            console.error('❌ فشل إرسال النص:', e);
            return false; 
        } 
    },
    
    // ==================== sendImage - معدل لاستخدام ChatDataSystem ====================
    async sendImage(file) { 
        if (!this.currentChat) return;
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return;
        }
        
        if (!ChatDataSystem.dc || ChatDataSystem.dc.readyState !== 'open') {
            await ChatDataSystem.init(this.currentChat);
            if (!ChatDataSystem.dc || ChatDataSystem.dc.readyState !== 'open') {
                alert('قناة نقل الملفات غير جاهزة');
                return;
            }
        }
        
        const success = await ChatDataSystem.sendFile(file, 'image');
        if (success) {
            const comp = await SecureChatSystem.compressImage(file);
            const b64 = await SecureChatSystem.fileToBase64(comp);
            const msgId = Date.now().toString();
            this.saveMessage(this.currentChat, { id: msgId, type: 'image', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            this.displayMessage({ id: msgId, type: 'image', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
        } else alert('فشل إرسال الصورة');
    },
    
    // ==================== sendVideoFile - معدل ====================
    async sendVideoFile(file) { 
        if (!this.currentChat) return;
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return;
        }
        
        if (!ChatDataSystem.dc || ChatDataSystem.dc.readyState !== 'open') {
            await ChatDataSystem.init(this.currentChat);
            if (!ChatDataSystem.dc || ChatDataSystem.dc.readyState !== 'open') {
                alert('قناة نقل الملفات غير جاهزة');
                return;
            }
        }
        
        try {
            await SecureChatSystem.validateVideo(file);
        } catch (error) {
            alert(error.message);
            return;
        }
        
        const success = await ChatDataSystem.sendFile(file, 'video');
        if (success) {
            const b64 = await SecureChatSystem.fileToBase64(file);
            const msgId = Date.now().toString();
            this.saveMessage(this.currentChat, { id: msgId, type: 'video', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            this.displayMessage({ id: msgId, type: 'video', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
        } else alert('فشل إرسال الفيديو');
    },
    
    // ==================== sendFile - معدل ====================
    async sendFile(file) { 
        if (!this.currentChat) return;
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return;
        }
        
        if (!ChatDataSystem.dc || ChatDataSystem.dc.readyState !== 'open') {
            await ChatDataSystem.init(this.currentChat);
            if (!ChatDataSystem.dc || ChatDataSystem.dc.readyState !== 'open') {
                alert('قناة نقل الملفات غير جاهزة');
                return;
            }
        }
        
        const success = await ChatDataSystem.sendFile(file, 'file');
        if (success) {
            const b64 = await SecureChatSystem.fileToBase64(file);
            const msgId = Date.now().toString();
            this.saveMessage(this.currentChat, { id: msgId, type: 'file', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            this.displayMessage({ id: msgId, type: 'file', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
        } else alert('فشل إرسال الملف');
    },
    
    // ==================== sendVoiceNote - معدل ====================
    async sendVoiceNote(audioBlob) { 
        if (!this.currentChat) return;
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن الإرسال - الطرف الآخر ليس في المحادثة' : 'لا يمكن الإرسال - الميزات غير مفعلة');
            return;
        }
        
        if (!ChatDataSystem.dc || ChatDataSystem.dc.readyState !== 'open') {
            await ChatDataSystem.init(this.currentChat);
            if (!ChatDataSystem.dc || ChatDataSystem.dc.readyState !== 'open') {
                alert('قناة نقل الملفات غير جاهزة');
                return;
            }
        }
        
        const success = await ChatDataSystem.sendFile(audioBlob, 'voice');
        if (success) {
            const b64 = await SecureChatSystem.fileToBase64(audioBlob);
            const msgId = Date.now().toString();
            this.saveMessage(this.currentChat, { id: msgId, type: 'voice', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
            this.displayMessage({ id: msgId, type: 'voice', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
        } else alert('فشل إرسال البصمة الصوتية');
    },
    
    // ==================== shareLocationDirect - معدل ====================
    async shareLocationDirect() { 
        if (!this.currentChat) return; 
        if (!this.friendInConversation || !this.featuresEnabled) {
            alert(this.featuresEnabled ? 'لا يمكن المشاركة - الطرف الآخر ليس في المحادثة' : 'لا يمكن المشاركة - الميزات غير مفعلة');
            return;
        }
        
        if (!ChatDataSystem.dc || ChatDataSystem.dc.readyState !== 'open') {
            await ChatDataSystem.init(this.currentChat);
            if (!ChatDataSystem.dc || ChatDataSystem.dc.readyState !== 'open') {
                alert('قناة نقل البيانات غير جاهزة');
                return;
            }
        }
        
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
    },
    
    showLocationSwipeModalWithClicks(locationData) {
        const existing = document.getElementById('locationSwipeModal');
        if (existing) existing.remove();
        
        const appColor = '#2196F3';
        const overlay = document.createElement('div');
        overlay.id = 'locationSwipeModal';
        overlay.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10003;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);`;
        
        overlay.innerHTML = `
            <style>.toggle-switch{position:relative;display:inline-block;width:60px;height:30px}.toggle-switch input{opacity:0;width:0;height:0}.toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:#555;transition:0.3s;border-radius:30px}.toggle-slider:before{position:absolute;content:"";height:24px;width:24px;left:3px;bottom:3px;background-color:white;transition:0.3s;border-radius:50%}input:checked+.toggle-slider{background-color:#4CAF50}input:checked+.toggle-slider:before{transform:translateX(30px)}.click-preset{background:#1a1a2e;color:white;border:1px solid #4CAF50;padding:6px 12px;border-radius:20px;cursor:pointer;transition:all 0.2s;font-size:0.9rem}.click-preset:hover{background:#4CAF50}.click-preset.selected{background:#4CAF50}</style>
            <div style="background:#0a0e27;border-radius:40px;width:340px;max-width:90%;padding:30px 20px;text-align:center;">
                <div style="font-size:3rem;">🗺️</div>
                <h3 style="color:white;">مشاركة الموقع</h3>
                <div style="background:rgba(76,175,80,0.15);border-radius:20px;padding:12px;margin:15px 0;"><div style="color:#4CAF50;">الإحداثيات</div><div style="color:white;">${locationData.lat} , ${locationData.lng}</div></div>
                <div><div style="color:white;margin-bottom:10px;">عدد مرات فتح الموقع</div><div style="display:flex;gap:8px;justify-content:center;"><button class="click-preset" data-clicks="1">1</button><button class="click-preset" data-clicks="2">2</button><button class="click-preset" data-clicks="3">3</button><button class="click-preset" data-clicks="4">4</button><button class="click-preset" data-clicks="5">5</button></div></div>
                <div style="margin:15px 0;"><div style="display:flex;align-items:center;justify-content:center;gap:12px;"><span style="color:white;">بلا حدود</span><label class="toggle-switch"><input type="checkbox" id="unlimitedToggle"><span class="toggle-slider"></span></label><span style="color:#aaa;">محدود</span></div></div>
                <div class="swipe-container" style="margin:20px 0;"><div id="swipeButton" style="width:100%;height:70px;border-radius:50px;position:relative;overflow:hidden;cursor:grab;background:linear-gradient(90deg,#1a5a2a 0%,#1a5a2a 50%,#8b1a1a 50%,#8b1a1a 100%);border:2px solid ${appColor};"><div style="position:absolute;top:10px;bottom:10px;left:50%;width:2px;background:${appColor};transform:translateX(-50%);"></div><div id="leftThumb" style="position:absolute;top:8px;left:8px;width:54px;height:54px;border-radius:50%;background:linear-gradient(145deg,#4CAF50,#1b5e2a);display:flex;align-items:center;justify-content:center;font-size:1.5rem;cursor:grab;"><i class="fas fa-check"></i></div><div id="rightThumb" style="position:absolute;top:8px;right:8px;width:54px;height:54px;border-radius:50%;background:linear-gradient(145deg,#f44336,#8b0000);display:flex;align-items:center;justify-content:center;font-size:1.5rem;cursor:grab;"><i class="fas fa-times"></i></div></div></div>
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
                if (selectedButton) selectedButton.style.background = '#1a1a2e';
                selectedButton = btn;
                selectedButton.style.background = '#4CAF50';
                selectedClicks = parseInt(btn.dataset.clicks);
            };
        });
        const firstBtn = document.querySelector('.click-preset[data-clicks="1"]');
        if (firstBtn) { firstBtn.style.background = '#4CAF50'; selectedButton = firstBtn; selectedClicks = 1; }
        
        unlimitedToggle.addEventListener('change', () => {
            const presets = document.querySelectorAll('.click-preset');
            if (unlimitedToggle.checked) presets.forEach(btn => { btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; });
            else presets.forEach(btn => { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; });
        });
        
        const buttonWidth = button.clientWidth;
        const centerPos = buttonWidth / 2;
        const maxLeftMove = centerPos - 35;
        const maxRightMove = centerPos - 35;
        
        let isDraggingLeft = false, isDraggingRight = false;
        let leftCurrentPos = 8, rightCurrentPos = 8;
        
        const onLeftStart = (e) => { e.preventDefault(); isDraggingLeft = true; leftThumb.style.transition = 'none'; };
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
            leftThumb.style.transition = 'left 0.3s';
            if (leftCurrentPos >= maxLeftMove - 10) {
                leftThumb.style.left = maxLeftMove + 'px';
                let maxClicks = unlimitedToggle.checked ? 999999 : (selectedClicks || 1);
                locationData.maxClicks = maxClicks;
                locationData.clicksRemaining = maxClicks;
                setTimeout(() => {
                    if (ChatDataSystem.dc && ChatDataSystem.dc.readyState === 'open') {
                        ChatDataSystem.dc.send(JSON.stringify({ type: 'location', data: locationData, id: Date.now().toString() }));
                    }
                    const msgId = Date.now().toString();
                    this.saveMessage(this.currentChat, { id: msgId, type: 'location', data: locationData, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                    this.displayMessage({ id: msgId, type: 'location', data: locationData, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                    overlay.remove();
                }, 200);
            } else { leftThumb.style.left = '8px'; }
        };
        
        const onRightStart = (e) => { e.preventDefault(); isDraggingRight = true; rightThumb.style.transition = 'none'; };
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
            rightThumb.style.transition = 'right 0.3s';
            if (rightCurrentPos >= maxRightMove - 10) {
                rightThumb.style.right = maxRightMove + 'px';
                setTimeout(() => overlay.remove(), 200);
            } else { rightThumb.style.right = '8px'; }
        };
        
        leftThumb.addEventListener('mousedown', onLeftStart);
        leftThumb.addEventListener('touchstart', onLeftStart, { passive: false });
        rightThumb.addEventListener('mousedown', onRightStart);
        rightThumb.addEventListener('touchstart', onRightStart, { passive: false });
        document.addEventListener('mousemove', (e) => { onLeftMove(e); onRightMove(e); });
        document.addEventListener('mouseup', () => { onLeftEnd(); onRightEnd(); });
        document.addEventListener('touchmove', (e) => { onLeftMove(e); onRightMove(e); }, { passive: false });
        document.addEventListener('touchend', () => { onLeftEnd(); onRightEnd(); });
        
        setTimeout(() => { if (document.getElementById('locationSwipeModal')) overlay.remove(); }, 30000);
    },
    
    // ==================== saveMessage ====================
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
            try { localStorage.setItem(key, JSON.stringify(h)); } catch (e2) { h = h.slice(-10); localStorage.setItem(key, JSON.stringify(h)); }
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
    
    // ==================== closeChat - معدل ====================
    closeChat() {
        console.log('🔴 closeChat - بدء إغلاق المحادثة');
        const chatId = this.currentChat;
        
        if (chatId) {
            ChatDataSystem.closeFullSystem();
            if (VoiceVideoSystem.isInCall) VoiceVideoSystem.endCall();
            
            const key = `chat_${chatId}`;
            const messages = this.messages[chatId] || [];
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
        if (btn) { btn.style.background = '#f44336'; btn.title = 'تفعيل الميزات'; }
        
        const toggleContainer = document.getElementById('featureToggleContainer');
        const kickBtn = document.getElementById('kickBtn');
        if (toggleContainer) toggleContainer.style.display = 'none';
        if (kickBtn) kickBtn.style.display = 'none';
        
        this.updateAllButtons();
        
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        if (typeof PresenceSystem !== 'undefined') PresenceSystem.stopAll();
        this.currentChat = null;
        this.friendInConversation = false;
        
        console.log('✅ closeChat - انتهى');
    },
    
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
};

// ==================== تشغيل النظام ====================
ChatSystem.init();

// ==================== إصلاح الكيبورد ====================
const initVisualViewportFix = () => {
    if (!window.visualViewport) return;
    const fixViewportHeight = () => {
        const conversationPage = document.querySelector('.conversation-page');
        const messagesContainer = document.querySelector('.messages-container');
        if (conversationPage && document.body.classList.contains('conversation-open')) {
            conversationPage.style.height = `${window.visualViewport.height}px`;
            if (messagesContainer) setTimeout(() => messagesContainer.scrollTop = messagesContainer.scrollHeight, 30);
        }
    };
    window.visualViewport.addEventListener('resize', fixViewportHeight);
    window.visualViewport.addEventListener('scroll', fixViewportHeight);
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initVisualViewportFix);
else initVisualViewportFix();

document.addEventListener('touchmove', function(e) {
    if (document.body.classList.contains('conversation-open') && !e.target.closest('.messages-container')) {
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchstart', function(e) { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
}, { passive: false });
