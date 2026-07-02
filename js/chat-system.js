// ========== chat-system.js - النسخة المعدلة (دعم طلبات الصداقة في الدردشة) ==========
// نظام الدردشة E2EE + نظام الحضور Presence

const ChatSystem = {
    currentChat: null, messages: {},
    friendInConversation: false,
    
    featuresEnabled: false,
    featureRequestPending: false,
    featureRequestReceived: false,
    featureBlinkInterval: null,
    
    // ✅ قالب عنصر المحادثة (ثابت)
    chatItemTemplate: null,
    
    // ==================== القسم 2.5: دالة تحديث زر التفعيل ====================
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

// ==================== القسم 2.6: دالة جلب اسم المستخدم ====================
async getContactName(userId) {
    try {
        const userDoc = await window.db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            return userDoc.data().name || 'مستخدم';
        }
    } catch(e) {
        console.warn('خطأ في جلب اسم المستخدم:', e);
    }
    return 'مستخدم';
},
   

 // ==================== القسم 3: init ====================
init() { 
    this.loadAllChats(); 
    this.setupFeatureButton();
    
    // ✅ تخزين مرجع القالب الثابت لقائمة المحادثات
    this.chatItemTemplate = document.getElementById('chatItemTemplate');
    
    // ✅ التحقق من وجود القالب
    if (!this.chatItemTemplate) {
        console.warn('⚠️ قالب chatItemTemplate غير موجود في HTML');
    } else {
        console.log('✅ تم تحميل قالب chatItemTemplate بنجاح');
    }
},   
    

    // ==================== القسم 4: setupFeatureButton ====================
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
    this.updateFeatureToggleUI();
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
    

 // ==================== القسم : 5.1 إنهاء المحادثة من الطرفين ====================
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
    
    this.closeChat();
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
        if (blinkCount > 120) {
            clearInterval(this.featureBlinkInterval);
            this.featureRequestPending = false;
            this.featureRequestReceived = false;
            switchLabel.classList.remove('blinking');
            
            const toggleInput = document.getElementById('featureToggleInput');
            if (toggleInput) toggleInput.checked = false;
            
            this.updateAllButtons();
            
            console.log('⏰ انتهت مهلة الانتظار (60 ثانية)، تم إلغاء الطلب');
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
    
    this._pendingIceCandidates = [];
    this._batchTimer = null;
    
    try {
        if (CallSystem.pc) {
            try { CallSystem.pc.close(); } catch(e) {}
            CallSystem.pc = null;
        }
        if (CallSystem.dc) {
            try { CallSystem.dc.close(); } catch(e) {}
            CallSystem.dc = null;
        }
        
        const iceServersConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        };
        
        CallSystem.pc = new RTCPeerConnection(iceServersConfig);
        CallSystem.dc = CallSystem.pc.createDataChannel('chat', { ordered: true, maxRetransmits: 3 });
        CallSystem.setupDataChannel(CallSystem.dc);
        
        CallSystem.pc.onicecandidate = e => {
            if (e.candidate) {
                console.log('📡 تجميع ICE candidate:', e.candidate.candidate.substring(0, 50));
                this._pendingIceCandidates.push(e.candidate);
            }
        };
        
        const offer = await CallSystem.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
        await CallSystem.pc.setLocalDescription(offer);
        
        await new Promise(resolve => {
            if (CallSystem.pc.localDescription && CallSystem.pc.localDescription.sdp) {
                resolve();
            } else {
                const checkInterval = setInterval(() => {
                    if (CallSystem.pc.localDescription && CallSystem.pc.localDescription.sdp) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve();
                }, 2000);
            }
        });
        
        if (!CallSystem.pc.localDescription || !CallSystem.pc.localDescription.sdp) {
            throw new Error('فشل إنشاء SDP صالح');
        }
        
        const sdpToSend = {
            type: CallSystem.pc.localDescription.type,
            sdp: CallSystem.pc.localDescription.sdp
        };
        
        await new Promise(resolve => {
            if (this._batchTimer) clearTimeout(this._batchTimer);
            this._batchTimer = setTimeout(() => {
                console.log(`📦 انتهاء التجميع (10 ثواني) - تم تجميع ${this._pendingIceCandidates.length} ICE candidate`);
                resolve();
            }, 10000);
        });
        
        const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
        const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
        if (!myPrivateKey || !receiverPublicKey) return;
        const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
        const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ 
            type: 'feature_request',
            action: 'offer',
            sdp: sdpToSend,
            candidates: this._pendingIceCandidates
        }), sharedKey);
        
        await SecureChatSystem.sendToServer(this.currentChat, { 
            id: 'feat-' + Date.now(), 
            type: 'feature_request', 
            data: encrypted, 
            timestamp: Date.now() 
        });
        
        console.log('🚀 تم إرسال طلب تفعيل الميزات (Offer + Candidates)');
        
    } catch(e) {
        console.error('❌ خطأ في إرسال طلب التفعيل:', e);
        this.featureRequestPending = false;
        if (this.featureBlinkInterval) clearInterval(this.featureBlinkInterval);
        const switchLabel = document.getElementById('featureSwitchLabel');
        if (switchLabel) switchLabel.classList.remove('blinking');
        const toggleInput = document.getElementById('featureToggleInput');
        if (toggleInput) toggleInput.checked = false;
        alert('فشل إرسال طلب التفعيل: ' + e.message);
    }
},

// ==================== القسم 8: acceptFeatureRequest ====================
async acceptFeatureRequest() {
    if (!this.currentChat || !this.receivedOffer) return;
    
    console.log('✅ قبول طلب تفعيل الميزات...');
    this.featureRequestReceived = false;
    if (this.featureBlinkInterval) clearInterval(this.featureBlinkInterval);
    const switchLabel = document.getElementById('featureSwitchLabel');
    if (switchLabel) switchLabel.classList.remove('blinking');
    
    this._pendingIceCandidates = [];
    this._batchTimer = null;
    
    try {
        if (CallSystem.pc) {
            try { CallSystem.pc.close(); } catch(e) {}
            CallSystem.pc = null;
        }
        
        const iceServersConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        };
        
        CallSystem.pc = new RTCPeerConnection(iceServersConfig);
        CallSystem.pc.ondatachannel = e => {
            CallSystem.dc = e.channel;
            CallSystem.setupDataChannel(CallSystem.dc);
        };
        
        CallSystem.pc.onicecandidate = e => {
            if (e.candidate) {
                console.log('📡 تجميع ICE candidate (Answer):', e.candidate.candidate.substring(0, 50));
                this._pendingIceCandidates.push(e.candidate);
            }
        };
        
        await CallSystem.pc.setRemoteDescription(new RTCSessionDescription(this.receivedOffer));
        
        if (this.receivedCandidates && Array.isArray(this.receivedCandidates)) {
            for (const cand of this.receivedCandidates) {
                try {
                    await CallSystem.pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch(e) {
                    console.warn('⚠️ فشل إضافة ICE candidate:', e);
                }
            }
        }
        
        const answer = await CallSystem.pc.createAnswer();
        await CallSystem.pc.setLocalDescription(answer);
        
        await new Promise(resolve => {
            if (this._batchTimer) clearTimeout(this._batchTimer);
            this._batchTimer = setTimeout(() => {
                console.log(`📦 انتهاء التجميع (Answer) - تم تجميع ${this._pendingIceCandidates.length} ICE candidate`);
                resolve();
            }, 5000);
        });
        
        const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
        const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(this.currentChat);
        if (!myPrivateKey || !receiverPublicKey) return;
        const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
        const encrypted = await SecureChatSystem.encryptData(JSON.stringify({ 
            type: 'feature_request',
            action: 'answer',
            sdp: {
                type: CallSystem.pc.localDescription.type,
                sdp: CallSystem.pc.localDescription.sdp
            },
            candidates: this._pendingIceCandidates
        }), sharedKey);
        
        await SecureChatSystem.sendToServer(this.currentChat, { 
            id: 'feat-ans-' + Date.now(), 
            type: 'feature_request', 
            data: encrypted, 
            timestamp: Date.now() 
        });
        
        console.log('🚀 تم إرسال الرد (Answer + Candidates)');
        this.receivedOffer = null;
        this.receivedCandidates = null;
        
    } catch(e) {
        console.error('❌ خطأ في قبول طلب التفعيل:', e);
        alert('فشل قبول طلب التفعيل: ' + e.message);
    }
},

// ==================== القسم 9: disableFeatures ====================
disableFeatures() {
    if (!this.featuresEnabled) return;
    
    console.log('🔌 تعطيل الميزات...');
    this.featuresEnabled = false;
    
    if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
        try {
            CallSystem.dc.send(JSON.stringify({ type: 'disable_features' }));
        } catch(e) {}
    }
    
    if (CallSystem.pc) {
        try { CallSystem.pc.close(); } catch(e) {}
        CallSystem.pc = null;
        CallSystem.dc = null;
    }
    
    const toggleInput = document.getElementById('featureToggleInput');
    if (toggleInput) toggleInput.checked = false;
    
    this.updateAllButtons();
    alert('تم تعطيل الميزات المتقدمة');
},

// ==================== القسم 10: updateAllButtons ====================
updateAllButtons() {
    const attachBtn = document.querySelector('.attach-btn');
    const micBtn = document.getElementById('actionBtn');
    
    if (this.featuresEnabled) {
        if (attachBtn) {
            attachBtn.style.opacity = '1';
            attachBtn.style.pointerEvents = 'auto';
            attachBtn.style.cursor = 'pointer';
        }
        if (micBtn) {
            micBtn.style.opacity = '1';
            micBtn.style.pointerEvents = 'auto';
            micBtn.style.cursor = 'pointer';
        }
    } else {
        if (attachBtn) {
            attachBtn.style.opacity = '0.5';
            attachBtn.style.pointerEvents = 'none';
            attachBtn.style.cursor = 'not-allowed';
        }
        if (micBtn) {
            micBtn.style.opacity = '0.5';
            micBtn.style.pointerEvents = 'none';
            micBtn.style.cursor = 'not-allowed';
        }
    }
    
    this.updateKickButtonState();
    this.updateFeatureToggleUI();
},

// ==================== القسم 11: loadAllChats ====================
loadAllChats() {
    const list = document.getElementById('chatsList');
    if (!list) return;
    list.innerHTML = '';
    
    const chats = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('chat_')) {
            const friendId = key.replace('chat_', '');
            const messages = JSON.parse(localStorage.getItem(key)) || [];
            if (messages.length > 0) {
                chats.push({ friendId, lastMessage: messages[messages.length - 1] });
            }
        }
    }
    
    chats.sort((a, b) => new Date(b.lastMessage.time) - new Date(a.lastMessage.time));
    
    chats.forEach(chat => {
        this.addChatItemToList(chat.friendId, chat.lastMessage);
    });
    
    if (chats.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-comment-slash"></i><h3 data-i18n="no_chats">لا توجد محادثات</h3></div>';
    }
},

// ==================== القسم 12: addChatItemToList ====================
async addChatItemToList(friendId, lastMsg) {
    const list = document.getElementById('chatsList');
    if (!list) return;
    
    const existing = Array.from(list.children).find(item => item.getAttribute('onclick')?.includes(friendId));
    if (existing) existing.remove();
    
    const template = this.chatItemTemplate || document.getElementById('chatItemTemplate');
    if (!template) return;
    
    const clone = template.content.cloneNode(true);
    const item = clone.querySelector('.chat-item');
    
    item.setAttribute('onclick', `openChat('${friendId}')`);
    
    const avatar = item.querySelector('.chat-avatar-emoji');
    const name = item.querySelector('.chat-info h4');
    const msgText = item.querySelector('.last-message');
    const time = item.querySelector('.chat-time');
    
    try {
        const userDoc = await window.db.collection('users').doc(friendId).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            if (avatar) avatar.textContent = data.avatarEmoji || '👤';
            if (name) name.textContent = data.name || 'مستخدم';
        } else {
            if (avatar) avatar.textContent = '👤';
            if (name) name.textContent = 'مستخدم';
        }
    } catch(e) {
        if (avatar) avatar.textContent = '👤';
        if (name) name.textContent = 'مستخدم';
    }
    
    if (msgText) {
        if (lastMsg.type === 'text') msgText.textContent = lastMsg.text;
        else if (lastMsg.type === 'image') msgText.textContent = '📷 صورة';
        else if (lastMsg.type === 'video') msgText.textContent = '🎥 فيديو';
        else if (lastMsg.type === 'voice') msgText.textContent = '🎤 بصمة صوتية';
        else if (lastMsg.type === 'file') msgText.textContent = '📄 ملف';
        else if (lastMsg.type === 'location') msgText.textContent = '📍 موقع';
        else if (lastMsg.type === 'friend_request_card') msgText.textContent = '👤 طلب صداقة';
        else if (lastMsg.type === 'friend_request_status') msgText.textContent = '🔔 حالة طلب الصداقة';
        else msgText.textContent = 'رسالة جديدة';
    }
    
    if (time) {
        const date = new Date(lastMsg.time);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            time.textContent = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }
    
    list.prepend(clone);
    
    const empty = list.querySelector('.empty-state');
    if (empty) empty.remove();
},

// ==================== القسم 13: openChat ====================
async openChat(friendId) {
    console.log('🔵 openChat:', friendId);
    this.currentChat = friendId;
    
    document.querySelector('.chat-page').style.display = 'none';
    const convPage = document.getElementById('conversationPage');
    convPage.style.display = 'flex';
    document.body.classList.add('conversation-open');
    
    const avatar = document.getElementById('conversationAvatar');
    const name = document.getElementById('conversationName');
    const status = document.getElementById('conversationStatus');
    
    if (status) {
        status.textContent = 'جاري الاتصال...';
        status.style.color = 'var(--text-light)';
    }
    
    try {
        const userDoc = await window.db.collection('users').doc(friendId).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            if (avatar) avatar.textContent = data.avatarEmoji || '👤';
            if (name) {
                name.textContent = data.name || 'مستخدم';
                name.style.display = 'block';
            }
        }
    } catch(e) {}
    
    this.displayMessages(friendId);
    this.updateAllButtons();
    
    if (window.PresenceSystem) {
        window.PresenceSystem.trackPresence(friendId, (isOnline) => {
            if (this.currentChat === friendId && status) {
                status.textContent = isOnline ? 'متصل الآن' : 'غير متصل';
                status.style.color = isOnline ? '#4CAF50' : 'var(--text-light)';
            }
        });
    }
},

// ==================== القسم 14: displayMessages ====================
displayMessages(friendId) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    container.innerHTML = '';
    
    const key = `chat_${friendId}`;
    const messages = JSON.parse(localStorage.getItem(key)) || [];
    this.messages[friendId] = messages;
    
    messages.forEach(msg => {
        this.displayMessage(msg);
    });
    
    container.scrollTop = container.scrollHeight;
},

// ==================== القسم 15: displayMessage (معدل لدعم الأنواع الجديدة) ====================
displayMessage(msg) {
    const c = document.getElementById('messagesContainer'); 
    if (!c) return;
    
    const formatDateTime = (dateObj) => {
        let hours = dateObj.getHours();
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
    };
    
    const dateTime = formatDateTime(new Date(msg.time || msg.timestamp));
    const isMe = msg.sender === 'me' || msg.sender === window.auth?.currentUser?.uid;
    const borderColor = isMe ? '#2196F3' : '#4CAF50';
    
    const wrapperTemplate = document.getElementById('messageWrapperTemplate');
    let div;
    if (wrapperTemplate) {
        div = wrapperTemplate.content.cloneNode(true).firstElementChild;
    } else {
        div = document.createElement('div');
        div.className = 'message';
    }
    
    div.className = `message ${isMe ? 'sent' : 'received'}`;
    div.id = `msg-${msg.id}`;
    
    // 1. الرسالة النصية
    if (msg.type === 'text') {
        const textTemplate = document.getElementById('textMessageTemplate');
        if (textTemplate) {
            const clone = textTemplate.content.cloneNode(true);
            const contentDiv = clone.querySelector('.message-content');
            const textSpan = contentDiv?.querySelector('span');
            if (contentDiv) contentDiv.style.border = `1.5px solid ${borderColor}`;
            if (textSpan) textSpan.innerHTML = this.escapeHtml(msg.text);
            div.appendChild(clone);
        }
    }
    
    // 2. بطاقة طلب الصداقة (جديد)
    else if (msg.type === 'friend_request_card') {
        const reqTemplate = document.getElementById('friendRequestMessageTemplate');
        if (reqTemplate) {
            const clone = reqTemplate.content.cloneNode(true);
            const card = clone.querySelector('.friend-request-card');
            const text = clone.querySelector('.request-text');
            const acceptBtn = clone.querySelector('.accept-request-btn');
            const rejectBtn = clone.querySelector('.reject-request-btn');
            
            if (text) text.textContent = msg.text || 'طلب صداقة جديد';
            
            // إذا كان الطلب مرسلاً مني، أخفِ الأزرار
            if (isMe) {
                if (acceptBtn) acceptBtn.style.display = 'none';
                if (rejectBtn) rejectBtn.style.display = 'none';
                const timer = clone.querySelector('.expiry-timer');
                if (timer) timer.textContent = 'تم إرسال الطلب';
            } else {
                if (acceptBtn) acceptBtn.onclick = () => window.acceptFriendRequest(msg.requestId, msg.sender);
                if (rejectBtn) rejectBtn.onclick = () => window.rejectFriendRequest(msg.requestId, msg.sender);
            }
            
            div.appendChild(clone);
            div.className = 'message received request-msg'; // دائماً توسيط أو شكل مميز
            div.style.alignSelf = 'center';
        }
    }
    
    // 3. حالة طلب الصداقة (جديد)
    else if (msg.type === 'friend_request_status') {
        const statusTemplate = document.getElementById('friendRequestStatusTemplate');
        if (statusTemplate) {
            const clone = statusTemplate.content.cloneNode(true);
            const text = clone.querySelector('.status-text');
            if (text) text.textContent = msg.text;
            div.appendChild(clone);
            div.className = 'message status-msg';
            div.style.alignSelf = 'center';
        }
    }
    
    // 4. الموقع
    else if (msg.type === 'location') {
        const locTemplate = document.getElementById('locationMessageTemplate');
        if (locTemplate) {
            const clone = locTemplate.content.cloneNode(true);
            const card = clone.querySelector('.location-card');
            if (card) {
                card.style.border = `1.5px solid ${borderColor}`;
                card.onclick = () => window.open(msg.data.url || msg.data, '_blank');
            }
            div.appendChild(clone);
        }
    }
    
    // 5. الصورة
    else if (msg.type === 'image') {
        const imgTemplate = document.getElementById('imageMessageTemplate');
        if (imgTemplate) {
            const clone = imgTemplate.content.cloneNode(true);
            const img = clone.querySelector('.message-image-content');
            if (img) {
                img.src = msg.data;
                img.onclick = () => this.showImagePreview(msg.data);
            }
            div.appendChild(clone);
        }
    }
    
    // 6. الصوت
    else if (msg.type === 'voice') {
        const voiceTemplate = document.getElementById('voiceMessageTemplate');
        if (voiceTemplate) {
            const clone = voiceTemplate.content.cloneNode(true);
            const audio = clone.querySelector('.voice-audio-element');
            if (audio) {
                audio.src = msg.data;
                this.setupVoiceControls(clone, audio);
            }
            div.appendChild(clone);
        }
    }
    
    // 7. الفيديو
    else if (msg.type === 'video') {
        const vidTemplate = document.getElementById('videoMessageTemplate');
        if (vidTemplate) {
            const clone = vidTemplate.content.cloneNode(true);
            const source = clone.querySelector('source');
            if (source) source.src = msg.data;
            const thumb = clone.querySelector('.video-thumbnail');
            if (thumb) thumb.onclick = () => this.showVideoPreview(msg.data);
            div.appendChild(clone);
        }
    }
    
    // 8. الملف
    else if (msg.type === 'file') {
        const fileTemplate = document.getElementById('fileMessageTemplate');
        if (fileTemplate) {
            const clone = fileTemplate.content.cloneNode(true);
            const name = clone.querySelector('.file-name');
            if (name) name.textContent = msg.fileName || 'ملف';
            const btn = clone.querySelector('.download-file-btn');
            if (btn) btn.onclick = () => {
                const a = document.createElement('a');
                a.href = msg.data;
                a.download = msg.fileName || 'file';
                a.click();
            };
            div.appendChild(clone);
        }
    }
    
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
},

// ==================== القسم 16: saveMessage (معدل للسماح بالأنواع الجديدة) ====================
async saveMessage(friendId, message) {
    if (!friendId) return;
    
    // السماح بحفظ النصوص وطلبات الصداقة وحالاتها
    const storableTypes = ['text', 'friend_request_card', 'friend_request_status'];
    if (!storableTypes.includes(message.type)) {
        console.log(`📝 النوع ${message.type} لن يُحفظ في localStorage`);
        return;
    }
    
    const key = `chat_${friendId}`;
    let messages = [];
    try {
        messages = JSON.parse(localStorage.getItem(key)) || [];
    } catch(e) {
        messages = [];
    }
    
    messages.push(message);
    if (messages.length > 200) messages = messages.slice(-200);
    
    localStorage.setItem(key, JSON.stringify(messages));
    this.messages[friendId] = messages;
    
    this.addChatItemToList(friendId, message);
},

// ==================== القسم 17: removeMessageFromChat (جديد) ====================
removeMessageFromChat(friendId, messageId) {
    const key = `chat_${friendId}`;
    let messages = JSON.parse(localStorage.getItem(key)) || [];
    messages = messages.filter(m => m.id !== messageId);
    localStorage.setItem(key, JSON.stringify(messages));
    this.messages[friendId] = messages;
    
    if (this.currentChat === friendId) {
        const el = document.getElementById(`msg-${messageId}`);
        if (el) el.remove();
    }
},

// ==================== بقية الدوال المساعدة (بدون تغيير) ====================
escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
},

showImagePreview(src) {
    // كود عرض معاينة الصورة
},

showVideoPreview(src) {
    // كود عرض معاينة الفيديو
},

setupVoiceControls(clone, audio) {
    // كود التحكم بالصوت
},

setupImageZoom(modal, img) {
    // كود الزووم
}

};

// تهيئة النظام عند التحميل
window.addEventListener('load', () => ChatSystem.init());
window.ChatSystem = ChatSystem;
