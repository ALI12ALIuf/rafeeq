// ========== chat-system.js - النسخة المعدلة (قوالب ثابتة + setupVoiceControls) ==========
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
        
        console.log('📡 الـ localDescription جاهز:', {
            type: CallSystem.pc.localDescription?.type,
            hasSdp: !!CallSystem.pc.localDescription?.sdp,
            sdpLength: CallSystem.pc.localDescription?.sdp?.length
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
            action: 'offer_batch',
            sdp: sdpToSend,
            iceCandidates: this._pendingIceCandidates.map(c => ({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex })),
            timestamp: Date.now()
        }), sharedKey);
        await SecureChatSystem.sendToServer(this.currentChat, { 
            id: Date.now().toString(), 
            type: 'feature_request', 
            data: encrypted, 
            timestamp: Date.now() 
        });
        console.log(`📨 تم إرسال الدفعة (Offer + ${this._pendingIceCandidates.length} ICE candidates) لفتح القناة`);
        
        this._pendingIceCandidates = [];
        this._batchTimer = null;
        
    } catch(e) {
        this.featureRequestPending = false;
        this.startFeatureBlink();
        console.log('❌ فشل إرسال الطلب:', e);
        alert('فشل إرسال طلب التفعيل: ' + (e.message || 'خطأ غير معروف'));
    }
},

// ==================== القسم 8: handleFeatureRequest ====================
async handleFeatureRequest(fromId, encryptedData) {
    console.log('🔔 handleFeatureRequest - استلام طلب من:', fromId);
    
    let requestData;
    try {
        const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
        const senderPublicKey = await SecureChatSystem.getReceiverPublicKey(fromId);
        if (!myPrivateKey || !senderPublicKey) return;
        const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, senderPublicKey);
        const decrypted = await SecureChatSystem.decryptData(encryptedData, sharedKey);
        requestData = JSON.parse(decrypted);
    } catch(e) {
        console.error('❌ فشل فك تشفير الطلب:', e);
        return;
    }
    
    if (requestData.action === 'offer_batch' && requestData.sdp) {
        console.log('📡 استلام دفعة (Offer + ICE candidates) من', fromId);
        console.log(`📦 عدد ICE candidates في الدفعة: ${requestData.iceCandidates?.length || 0}`);
        
        if (!requestData.sdp.type || requestData.sdp.type !== 'offer') {
            console.error('❌ SDP غير صالح - type:', requestData.sdp.type);
            return;
        }
        
        if (!requestData.sdp.sdp || requestData.sdp.sdp.length < 10) {
            console.error('❌ SDP فارغ أو غير مكتمل');
            return;
        }
        
        if (!this._pendingOffer) this._pendingOffer = {};
        this._pendingOffer[fromId] = {
            sdp: new RTCSessionDescription({
                type: requestData.sdp.type,
                sdp: requestData.sdp.sdp
            }),
            iceCandidates: requestData.iceCandidates || [],
            timestamp: Date.now()
        };
        
        this.featureRequestReceived = true;
        this.startFeatureBlink();
        console.log('📞 شخص يريد تفعيل الميزات - اضغط على الدائرة الحمراء');
    }
    else if (requestData.action === 'ice' && requestData.candidate) {
        console.log('📡 استلام ICE candidate منفرد (دعم خلفي)');
        if (CallSystem.pc) {
            try {
                await CallSystem.pc.addIceCandidate(new RTCIceCandidate(requestData.candidate.candidate));
            } catch(e) {
                console.warn('فشل إضافة ICE candidate:', e);
            }
        } else if (this._pendingOffer && this._pendingOffer[fromId]) {
            this._pendingOffer[fromId].iceCandidates.push(requestData.candidate);
        }
    }
},

// ==================== القسم 8.1: acceptOffer ====================
async acceptOffer(fromId, offerData) {
    console.log('✅ قبول Offer من', fromId);
    
    if (this.featureBlinkInterval) {
        clearInterval(this.featureBlinkInterval);
        this.featureBlinkInterval = null;
    }
    
    const switchLabel = document.getElementById('featureSwitchLabel');
    if (switchLabel) switchLabel.classList.remove('blinking');
    
    this._responseIceCandidates = [];
    this._responseBatchTimer = null;
    
    try {
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
        
        if (CallSystem.pc) {
            try { CallSystem.pc.close(); } catch(e) {}
            CallSystem.pc = null;
        }
        
        CallSystem.pc = new RTCPeerConnection(iceServersConfig);
        
        CallSystem.pc.ondatachannel = e => {
            console.log('📡 استقبال Data Channel');
            CallSystem.setupDataChannel(e.channel);
            CallSystem.dc = e.channel;
        };
        
        CallSystem.pc.onicecandidate = e => {
            if (e.candidate) {
                console.log('📡 تجميع ICE candidate للمستلم');
                this._responseIceCandidates.push(e.candidate);
            }
        };
        
        const offerSdp = offerData.sdp;
        console.log('📡 تعيين Remote Description - type:', offerSdp.type);
        
        if (!offerSdp.type || !offerSdp.sdp) {
            throw new Error('SDP غير صالح للاستخدام');
        }
        
        await CallSystem.pc.setRemoteDescription(offerSdp);
        
        for (const ice of (offerData.iceCandidates || [])) {
            try {
                await CallSystem.pc.addIceCandidate(new RTCIceCandidate(ice));
                console.log('✅ تم إضافة ICE candidate مستلمة');
            } catch(e) {
                console.warn('فشل إضافة ICE candidate:', e);
            }
        }
        
        console.log('📡 إنشاء Answer...');
        const answer = await CallSystem.pc.createAnswer();
        await CallSystem.pc.setLocalDescription(answer);
        console.log('✅ تم إنشاء Answer بنجاح');
        
        await new Promise(resolve => {
            if (this._responseBatchTimer) clearTimeout(this._responseBatchTimer);
            this._responseBatchTimer = setTimeout(() => {
                console.log(`📦 انتهاء تجميع المستلم (10 ثواني) - تم تجميع ${this._responseIceCandidates.length} ICE candidate`);
                resolve();
            }, 10000);
        });
        
        await this.sendOfferResponseBatch(fromId, {
            sdp: CallSystem.pc.localDescription,
            iceCandidates: this._responseIceCandidates.map(c => ({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex }))
        });
        
        this.featuresEnabled = true;
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        this.friendInConversation = true;
        
        const toggleInput = document.getElementById('featureToggleInput');
        if (toggleInput) toggleInput.checked = true;
        
        this.updateAllButtons();
        console.log('✅ تم فتح القناة وتفعيل الميزات بنجاح');
        
        this._responseIceCandidates = [];
        this._responseBatchTimer = null;
        
    } catch(e) {
        console.error('❌ فشل قبول الـ Offer:', e);
        alert('فشل فتح قناة الاتصال: ' + (e.message || 'خطأ غير معروف'));
        this.featureRequestReceived = false;
        const toggleInput = document.getElementById('featureToggleInput');
        if (toggleInput) toggleInput.checked = false;
    }
},

async sendOfferResponseBatch(toId, batchData) {
    try {
        const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
        const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(toId);
        if (!myPrivateKey || !receiverPublicKey) return;
        const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
        
        const messageData = {
            type: 'feature_response',
            action: 'answer_batch',
            sdp: batchData.sdp,
            iceCandidates: batchData.iceCandidates || [],
            timestamp: Date.now()
        };
        
        const encrypted = await SecureChatSystem.encryptData(JSON.stringify(messageData), sharedKey);
        await SecureChatSystem.sendToServer(toId, { 
            id: Date.now().toString(), 
            type: 'feature_response', 
            data: encrypted, 
            timestamp: Date.now() 
        });
        console.log(`📨 تم إرسال دفعة الرد (Answer + ${batchData.iceCandidates.length} ICE candidates) إلى`, toId);
    } catch(e) {
        console.error('❌ فشل إرسال الرد:', e);
    }
},

async sendOfferResponse(toId, action, data = null) {
    try {
        const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
        const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(toId);
        if (!myPrivateKey || !receiverPublicKey) return;
        const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
        
        const messageData = {
            type: 'feature_response',
            action: action,
            timestamp: Date.now()
        };
        if (data) {
            if (data.sdp) messageData.sdp = data.sdp;
            if (data.candidate) messageData.candidate = data.candidate;
        }
        
        const encrypted = await SecureChatSystem.encryptData(JSON.stringify(messageData), sharedKey);
        await SecureChatSystem.sendToServer(toId, { 
            id: Date.now().toString(), 
            type: 'feature_response', 
            data: encrypted, 
            timestamp: Date.now() 
        });
        console.log(`📨 تم إرسال ${action} إلى`, toId);
    } catch(e) {
        console.error('❌ فشل إرسال الرد:', e);
    }
},

// ==================== القسم 9: acceptFeatureRequest ====================
async acceptFeatureRequest() {
    console.log('🔍 acceptFeatureRequest - بدء التنفيذ');
    
    if (!this.featureRequestReceived && !this.featureRequestPending) {
        console.log('⚠️ لا يوجد طلب معلق');
        return;
    }
    
    this.featureRequestPending = false;
    this.featureRequestReceived = false;
    
    if (this.currentChat) {
        console.log('✅ تم تجهيز المحادثة، في انتظار تفعيل الميزات بعد نجاح القناة');
    }
    
    if (this.featureBlinkInterval) {
        clearInterval(this.featureBlinkInterval);
        this.featureBlinkInterval = null;
    }
    
    const switchLabel = document.getElementById('featureSwitchLabel');
    if (switchLabel) switchLabel.classList.remove('blinking');
    
    if (this._pendingOffer && this._pendingOffer[this.currentChat] && this._pendingOffer[this.currentChat].sdp) {
        console.log('📡 يوجد Offer معلق، جاري قبوله...');
        await this.acceptOffer(this.currentChat, this._pendingOffer[this.currentChat]);
        delete this._pendingOffer[this.currentChat];
    } else {
        console.log('⚠️ لا يوجد Offer معلق');
        
        if (this.currentChat) {
            CallSystem.ensureDataChannelOnly(this.currentChat).then(() => {
                console.log('✅ تم فتح Data Channel في الخلفية');
                this.featuresEnabled = true;
                this.friendInConversation = true;
                const toggleInput = document.getElementById('featureToggleInput');
                if (toggleInput) toggleInput.checked = true;
                this.updateAllButtons();
                console.log('✅ تم تفعيل الميزات بعد فتح القناة');
            }).catch(e => {
                console.error('❌ خطأ في فتح Data Channel:', e);
            });
        }
    }
    
    console.log('✅ تم تجهيز القناة، في انتظار تفعيل الميزات بعد نجاح الاتصال');
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
    
    // ✅ تحديث زر الإجراء (بصمة/إرسال)
    if (typeof window.toggleSendButton === 'function') {
        setTimeout(() => window.toggleSendButton(), 100);
    }
    
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
    
    // ✅ تحديث زر الإجراء (بصمة/إرسال)
    if (typeof window.toggleSendButton === 'function') {
        setTimeout(() => window.toggleSendButton(), 100);
    }
},

// ==================== القسم 14: updateAllButtons ====================
updateAllButtons() {
    const canUse = (this.friendInConversation && this.featuresEnabled);
    
    // ✅ استخدام class="attach-option" بدلاً من data-dc
    const btns = document.querySelectorAll('#attachmentMenu .attach-option');
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
    
    // ✅ تحديث زر الإجراء (بصمة/إرسال)
    if (typeof window.toggleSendButton === 'function') {
        window.toggleSendButton();
    }
    
    console.log(`🎛️ تحديث الأزرار: friendInConversation=${this.friendInConversation}, featuresEnabled=${this.featuresEnabled}, canUse=${canUse}`);
},


   // ==================== القسم 15: closeConversation ====================
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
        const bar = document.getElementById('progressBar');
        if (!bar) return;
        bar.style.display = 'flex';
        const fill = document.getElementById('progressFill');
        const perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = '0%';
        if (perc) perc.textContent = '0%';
    },
    
    // ==================== القسم 19: updateProgressBar ====================
    updateProgressBar(percent, message) {
        const fill = document.getElementById('progressFill');
        const perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = Math.min(percent, 100) + '%';
        if (perc) perc.textContent = Math.round(percent) + '%';
    },
    
    // ==================== القسم 20: hideProgressBar ====================
    hideProgressBar() { 
        const bar = document.getElementById('progressBar'); 
        if (bar) bar.style.display = 'none'; 
    },
    
    
    // ==================== القسم 23: openChat ====================
openChat(friendId, friendName, friendAvatar) {
    if (this.currentChat && this.currentChat !== friendId) {
        console.log('🧹 تنظيف المحادثة السابقة قبل فتح محادثة جديدة:', this.currentChat);
        this.cleanConversationData(this.currentChat, false);
    }
    
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
    
    
// ==================== القسم 25: displayMessages ====================
    displayMessages(friendId) { 
        const c = document.getElementById('messagesContainer'); 
        if (!c) return; 
        c.innerHTML = ''; 
        const messages = this.messages[friendId] || [];
        
        messages.forEach(msg => {
            if (msg.type === 'text') {
                this.displayMessage(msg);
            }
        });
        
        c.scrollTop = c.scrollHeight;
    },

// ==================== القسم 26.0: setupVoiceControls (دالة مساعدة للبصمة الصوتية) ====================
setupVoiceControls(clone, audioEl) {
    const playBtn = clone.querySelector('.voice-play-btn');
    const replayBtn = clone.querySelector('.voice-replay-btn');
    const muteBtn = clone.querySelector('.voice-mute-btn');
    const timeSpan = clone.querySelector('.voice-current-time');
    const durationSpan = clone.querySelector('.voice-duration');
    
    if (!audioEl || !audioEl.src) return;
    
    // إعداد مدة الصوت
    const tempAudio = new Audio(audioEl.src);
    tempAudio.addEventListener('loadedmetadata', () => {
        const duration = tempAudio.duration;
        if (durationSpan && !isNaN(duration)) {
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            durationSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    });
    
    let isPlaying = false;
    
    if (playBtn) {
        playBtn.onclick = (e) => {
            e.stopPropagation();
            if (isPlaying) {
                audioEl.pause();
                playBtn.innerHTML = '<i class="fas fa-play"></i>';
                isPlaying = false;
            } else {
                audioEl.play();
                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                isPlaying = true;
            }
        };
    }
    
    if (replayBtn) {
        replayBtn.onclick = (e) => {
            e.stopPropagation();
            audioEl.pause();
            audioEl.currentTime = 0;
            if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
            isPlaying = false;
            if (timeSpan) timeSpan.textContent = '0:00';
            audioEl.play();
            if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            isPlaying = true;
        };
    }
    
    let isMuted = false;
    if (muteBtn) {
        muteBtn.onclick = (e) => {
            e.stopPropagation();
            if (isMuted) {
                audioEl.muted = false;
                muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                isMuted = false;
            } else {
                audioEl.muted = true;
                muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
                isMuted = true;
            }
        };
    }
    
    audioEl.ontimeupdate = () => {
        const minutes = Math.floor(audioEl.currentTime / 60);
        const seconds = Math.floor(audioEl.currentTime % 60);
        if (timeSpan) {
            timeSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    };
    
    audioEl.onended = () => {
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
        isPlaying = false;
        if (timeSpan) timeSpan.textContent = '0:00';
    };
},

// ==================== القسم 26: displayMessage (معدل بالكامل - استخدام القوالب الثابتة) ====================
displayMessage(msg) {
    const c = document.getElementById('messagesContainer'); 
    if (!c) return;
    
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
    const borderColor = msg.sender === 'me' ? '#2196F3' : '#4CAF50';
    
    // ✅ إنشاء العنصر الرئيسي باستخدام cloneNode من قالب ثابت
    const template = document.getElementById('messageWrapperTemplate');
    let div;
    if (template) {
        div = template.content.cloneNode(true).firstElementChild;
    } else {
        // ⚠️ Fallback فقط في حالة عدم وجود القالب (حل طوارئ)
        console.warn('⚠️ قالب messageWrapperTemplate غير موجود');
        div = document.createElement('div');
        div.className = 'message';
    }
    
    div.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`;
    div.id = `msg-${msg.id}`;
    
    // ==================== معالجة الرسائل النصية (معدل - استخدام القالب الثابت) ====================
    if (msg.type === 'text') {
        const textTemplate = document.getElementById('textMessageTemplate');
        if (textTemplate) {
            const clone = textTemplate.content.cloneNode(true);
            const contentDiv = clone.querySelector('.message-content');
            const textSpan = contentDiv?.querySelector('span');
            
            if (contentDiv) {
                contentDiv.style.border = `1.5px solid ${borderColor}`;
            }
            
            if (textSpan) {
                textSpan.innerHTML = this.escapeHtml(msg.text);
            }
            
            div.appendChild(clone);
        } else {
            console.warn('⚠️ قالب textMessageTemplate غير موجود');
        }
        
        // ✅ إضافة فاصل زمني كل 10 رسائل
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
    
    // ==================== معالجة الموقع ====================
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
        
        const templateLoc = document.getElementById('locationMessageTemplate');
        if (templateLoc) {
            const clone = templateLoc.content.cloneNode(true);
            const locationDiv = clone.querySelector('.location-card');
            if (locationDiv) {
                locationDiv.style.background = '#4CAF50';
                
                if (clicksRemaining !== undefined && clicksRemaining <= 0) {
                    locationDiv.style.background = '#888';
                    locationDiv.innerHTML = `<i class="fas fa-lock" style="font-size: 1.2rem; color: white;"></i>`;
                    locationDiv.style.border = 'none';
                } else {
                    locationDiv.style.border = `1.5px solid ${borderColor}`;
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
                }
            }
            div.appendChild(clone);
        } else {
            console.warn('⚠️ قالب locationMessageTemplate غير موجود');
        }
    }
    
    // ==================== معالجة الصورة ====================
    else if (msg.type === 'image') {
        const templateImg = document.getElementById('imageMessageTemplate');
        if (templateImg) {
            const clone = templateImg.content.cloneNode(true);
            const wrapper = clone.querySelector('.message-image-wrapper');
            if (wrapper) {
                wrapper.style.border = `2px solid ${borderColor}`;
                const img = wrapper.querySelector('.message-image-content');
                if (img) {
                    img.src = msg.data;
                    img.onclick = () => this.showImagePreview(msg.data);
                    img.oncontextmenu = (e) => e.preventDefault();
                    img.ondragstart = (e) => e.preventDefault();
                }
            }
            div.appendChild(clone);
        } else {
            console.warn('⚠️ قالب imageMessageTemplate غير موجود');
        }
    }
    
    // ==================== معالجة البصمة الصوتية ====================
    else if (msg.type === 'voice') {
        const templateVoice = document.getElementById('voiceMessageTemplate');
        if (templateVoice) {
            const clone = templateVoice.content.cloneNode(true);
            const voiceMsg = clone.querySelector('.voice-message');
            if (voiceMsg) {
                voiceMsg.style.background = '#4CAF50';
                voiceMsg.style.border = `1.5px solid ${borderColor}`;
                const audioEl = voiceMsg.querySelector('.voice-audio-element');
                if (audioEl && msg.data) {
                    audioEl.src = msg.data;
                    this.setupVoiceControls(clone, audioEl);
                }
            }
            div.appendChild(clone);
        } else {
            console.warn('⚠️ قالب voiceMessageTemplate غير موجود');
        }
    }
    
    // ==================== معالجة الفيديو ====================
    else if (msg.type === 'video') {
        const templateVideo = document.getElementById('videoMessageTemplate');
        if (templateVideo) {
            const clone = templateVideo.content.cloneNode(true);
            const thumbnail = clone.querySelector('.video-thumbnail');
            if (thumbnail) {
                thumbnail.style.border = `2px solid ${borderColor}`;
                const video = thumbnail.querySelector('.video-thumbnail-content');
                const source = video?.querySelector('source');
                if (source && msg.data) {
                    source.src = msg.data;
                    video.load();
                }
                thumbnail.onclick = (e) => {
                    e.stopPropagation();
                    this.showVideoPreview(msg.data);
                };
            }
            div.appendChild(clone);
        } else {
            console.warn('⚠️ قالب videoMessageTemplate غير موجود');
        }
    }
    
    // ==================== معالجة الملف (النظام الجديد - window.open) ====================
    else if (msg.type === 'file') {
        const templateFile = document.getElementById('fileMessageTemplate');
        if (templateFile) {
            const clone = templateFile.content.cloneNode(true);
            const fileCard = clone.querySelector('.file-card');
            if (fileCard) {
                fileCard.style.background = '#4CAF50';
                fileCard.style.border = `1.5px solid ${borderColor}`;
                const fileNameEl = fileCard.querySelector('.file-name');
                if (fileNameEl) {
                    fileNameEl.textContent = msg.fileName || 'ملف';
                }
                const downloadBtn = fileCard.querySelector('.download-file-btn');
                if (downloadBtn && msg.data) {
                    // ✅ إزالة أي خصائص href أو download قديمة
                    downloadBtn.removeAttribute('href');
                    downloadBtn.removeAttribute('download');
                    downloadBtn.removeAttribute('target');
                    
                    // ✅ النظام الجديد: استخدام window.open
                    downloadBtn.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        
                        try {
                            // محاولة فتح الملف في نافذة جديدة
                            const win = window.open(msg.data, '_blank');
                            if (win) {
                                win.document.title = msg.fileName || 'ملف';
                                console.log(`✅ [النظام الجديد] تم تحميل الملف: ${msg.fileName}`);
                            } else {
                                // حل بديل إذا منع المتصفح النافذة المنبثقة
                                const link = document.createElement('a');
                                link.href = msg.data;
                                link.download = msg.fileName || 'ملف';
                                link.style.display = 'none';
                                document.body.appendChild(link);
                                link.click();
                                setTimeout(() => document.body.removeChild(link), 100);
                                console.log(`✅ [البديل] تم تحميل الملف: ${msg.fileName}`);
                            }
                        } catch (error) {
                            console.error('❌ فشل تحميل الملف:', error);
                            // حل أخير: فتح الرابط مباشرة
                            window.location.href = msg.data;
                        }
                    };
                }
            }
            div.appendChild(clone);
        } else {
            console.warn('⚠️ قالب fileMessageTemplate غير موجود');
        }
    }
    
    // ✅ إضافة الرسالة إلى الحاوية
    c.appendChild(div); 
    c.scrollTop = c.scrollHeight;
},

// ==================== القسم 26.1: showImagePreview ====================
showImagePreview(imageSrc) {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    if (!modal || !img) return;
    
    img.src = imageSrc;
    modal.style.display = 'flex';
    
    this.setupImageZoom(modal, img);
},

// ==================== القسم 26.1.1: setupImageZoom ====================
setupImageZoom(modal, img) {
    if (img._zoomCleanup) {
        img._zoomCleanup();
        img._zoomCleanup = null;
    }
    
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
    
    const touchStartHandler = (e) => {
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
    };
    
    const touchMoveHandler = (e) => {
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
    };
    
    const touchEndHandler = (e) => {
        e.preventDefault();
        initialDistance = 0;
        isTouching = false;
        
        if (currentScale < 0.95) {
            currentScale = 1;
            translateX = 0;
            translateY = 0;
            updateTransform();
        }
    };
    
    img.addEventListener('touchstart', touchStartHandler);
    img.addEventListener('touchmove', touchMoveHandler, { passive: false });
    img.addEventListener('touchend', touchEndHandler);
    
    img._zoomCleanup = () => {
        img.removeEventListener('touchstart', touchStartHandler);
        img.removeEventListener('touchmove', touchMoveHandler);
        img.removeEventListener('touchend', touchEndHandler);
    };
},

// ==================== القسم 26.2: showVideoPreview ====================
showVideoPreview(videoSrc) {
    const modal = document.getElementById('videoPreviewModal');
    const video = document.getElementById('previewVideo');
    if (!modal || !video) return;
    
    video.src = videoSrc;
    modal.style.display = 'flex';
    video.play().catch(() => {});
},

// ==================== القسم 26.3: دوال إغلاق المعاينات (معدلة - نظام window.open) ====================
closeImagePreview() {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    if (modal) modal.style.display = 'none';
    if (img) { img.src = ''; img.style.transform = 'none'; }
},

closeVideoPreview() {
    const modal = document.getElementById('videoPreviewModal');
    const video = document.getElementById('previewVideo');
    if (modal) modal.style.display = 'none';
    if (video) { video.pause(); video.src = ''; }
},

// ✅ دالة تحميل الصورة (النظام الجديد - window.open)
downloadPreviewImage() {
    const img = document.getElementById('previewImage');
    if (!img || !img.src) return;
    
    try {
        const win = window.open(img.src, '_blank');
        if (win) {
            win.document.title = 'image.jpg';
            console.log('✅ [النظام الجديد] تم تحميل الصورة');
        } else {
            // حل بديل إذا منع المتصفح النافذة المنبثقة
            const link = document.createElement('a');
            link.href = img.src;
            link.download = 'image.jpg';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => document.body.removeChild(link), 100);
            console.log('✅ [البديل] تم تحميل الصورة');
        }
    } catch (error) {
        console.error('❌ فشل تحميل الصورة:', error);
        window.location.href = img.src;
    }
},

// ✅ دالة تحميل الفيديو (النظام الجديد - window.open)
downloadPreviewVideo() {
    const video = document.getElementById('previewVideo');
    if (!video || !video.src) return;
    
    try {
        const win = window.open(video.src, '_blank');
        if (win) {
            win.document.title = 'video.mp4';
            console.log('✅ [النظام الجديد] تم تحميل الفيديو');
        } else {
            // حل بديل إذا منع المتصفح النافذة المنبثقة
            const link = document.createElement('a');
            link.href = video.src;
            link.download = 'video.mp4';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => document.body.removeChild(link), 100);
            console.log('✅ [البديل] تم تحميل الفيديو');
        }
    } catch (error) {
        console.error('❌ فشل تحميل الفيديو:', error);
        window.location.href = video.src;
    }
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
        console.log('✅ تم إرسال النص عبر Firebase (تشفير E2EE)');
        return true; 
    } catch (e) { 
        console.error('❌ فشل إرسال النص:', e);
        return false; 
    } 
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
                const msgId = Date.now().toString();
                const tempUrl = URL.createObjectURL(file);
                this.displayMessage({ id: msgId, type: 'image', data: tempUrl, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent', _blobUrl: tempUrl });
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
                    const msgId = Date.now().toString();
                    const tempUrl = URL.createObjectURL(file);
                    
                    this.displayMessage({ id: msgId, type: 'video', data: tempUrl, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent', _blobUrl: tempUrl });
                    
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
                const msgId = Date.now().toString();
                const tempUrl = URL.createObjectURL(file);
                this.displayMessage({ id: msgId, type: 'file', data: tempUrl, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent', _blobUrl: tempUrl });
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
                const msgId = Date.now().toString();
                const tempUrl = URL.createObjectURL(audioBlob);
                this.displayMessage({ id: msgId, type: 'voice', data: tempUrl, sender: 'me', time: new Date().toISOString(), status: 'sent', _blobUrl: tempUrl });
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

// ==================== القسم 34.1: showLocationSwipeModalWithClicks ====================
showLocationSwipeModalWithClicks(locationData) {
    const modal = document.getElementById('locationSwipeModal');
    const coordsText = document.getElementById('locationCoordsText');
    if (!modal || !coordsText) return;
    
    coordsText.textContent = `${locationData.lat} , ${locationData.lng}`;
    modal.style.display = 'flex';
    
    this.setupLocationSwipe(locationData);
},

setupLocationSwipe(locationData) {
    const modal = document.getElementById('locationSwipeModal');
    const button = document.getElementById('locationSwipeButton');
    const leftThumb = document.getElementById('locationLeftThumb');
    const rightThumb = document.getElementById('locationRightThumb');
    const unlimitedToggle = document.getElementById('unlimitedToggle');
    
    if (!button || !leftThumb || !rightThumb) return;
    
    if (leftThumb._cleanup) leftThumb._cleanup();
    if (rightThumb._cleanup) rightThumb._cleanup();
    
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
                if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
                    CallSystem.dc.send(JSON.stringify({ type: 'location', data: locationData, id: Date.now().toString() }));
                }
                const msgId = Date.now().toString();
                this.displayMessage({ id: msgId, type: 'location', data: locationData, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                modal.style.display = 'none';
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
                modal.style.display = 'none';
            }, 200);
        } else {
            rightThumb.style.right = '8px';
        }
    };
    
    leftThumb.addEventListener('mousedown', onLeftStart);
    leftThumb.addEventListener('touchstart', onLeftStart, { passive: false });
    rightThumb.addEventListener('mousedown', onRightStart);
    rightThumb.addEventListener('touchstart', onRightStart, { passive: false });
    
    const moveHandler = (e) => { onLeftMove(e); onRightMove(e); };
    const endHandler = () => { onLeftEnd(); onRightEnd(); };
    
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', endHandler);
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('touchend', endHandler);
    
    leftThumb._cleanup = () => {
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', endHandler);
        document.removeEventListener('touchmove', moveHandler);
        document.removeEventListener('touchend', endHandler);
    };
    rightThumb._cleanup = leftThumb._cleanup;
    
    setTimeout(() => {
        if (modal && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    }, 30000);
}, 
    
    
    // ==================== القسم 35: saveMessage ====================
    saveMessage(friendId, message) { 
        if (message.type !== 'text') {
            console.log(`📝 الوسائط (${message.type}) لن تُحفظ - تعرض فقط أثناء المحادثة`);
            return;
        }
        
        const key = `chat_${friendId}`; 
        let messages = []; 
        try { 
            messages = JSON.parse(localStorage.getItem(key)) || []; 
        } catch (e) { 
            messages = []; 
        }
        
        messages.push(message); 
        
        if (messages.length > 100) {
            const excessCount = messages.length - 100;
            const removeCount = excessCount + 50;
            messages = messages.slice(removeCount);
            console.log(`🧹 تم حذف ${removeCount} رسالة قديمة (الحد الأقصى 100 رسالة)`);
        }
        
        try { 
            localStorage.setItem(key, JSON.stringify(messages)); 
        } catch (e) {
            const removeCount = Math.min(50, messages.length);
            messages = messages.slice(removeCount);
            try { 
                localStorage.setItem(key, JSON.stringify(messages)); 
                console.log(`🧹 مساحة غير كافية - تم حذف ${removeCount} رسالة قديمة`);
            } catch (e2) { 
                messages = messages.slice(-50);
                try { 
                    localStorage.setItem(key, JSON.stringify(messages)); 
                    console.log(`🧹 مساحة غير كافية - تم الاحتفاظ بآخر 50 رسالة فقط`);
                } catch (e3) {}
            }
        }
        
        this.messages[friendId] = messages; 
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
        console.log('📤 إغلاق المحادثة - سيتم تنظيف البيانات محلياً');
        
        this.cleanConversationData(chatId, false);
        
        const key = `chat_${chatId}`;
        const messages = this.messages[chatId] || [];
        const filteredMessages = messages.filter(msg => msg.type === 'text');
        this.messages[chatId] = filteredMessages;
        localStorage.setItem(key, JSON.stringify(filteredMessages));
        console.log('✅ تم تنظيف الملفات والوسائط من localStorage');
        
        document.querySelectorAll('img, video, audio').forEach(el => {
            if (el.src && el.src.startsWith('blob:')) {
                URL.revokeObjectURL(el.src);
                el.src = '';
            }
        });
    }
    
    this.featuresEnabled = false;
    this.featureRequestPending = false;
    this.featureRequestReceived = false;
    
    if (this.featureBlinkInterval) {
        clearInterval(this.featureBlinkInterval);
        this.featureBlinkInterval = null;
    }
    
    const toggleContainer = document.getElementById('featureToggleContainer');
    const kickBtn = document.getElementById('kickBtn');
    if (toggleContainer) toggleContainer.style.display = 'none';
    if (kickBtn) kickBtn.style.display = 'none';
    
    this.updateAllButtons();
    
    document.body.classList.remove('conversation-open');
    document.getElementById('conversationPage').style.display = 'none';
    document.querySelector('.chat-page').style.display = 'block';
    
    if (typeof CallSystem !== 'undefined' && CallSystem.cleanupDynamicElements) {
        CallSystem.cleanupDynamicElements();
    }
    
    if (!CallSystem.isInCall) {
        if (CallSystem.dc) {
            try { CallSystem.dc.close(); } catch(e) {}
            CallSystem.dc = null;
        }
        if (CallSystem.pc) {
            try { CallSystem.pc.close(); } catch(e) {}
            CallSystem.pc = null;
        }
    }
    this.currentChat = null;
    this.friendInConversation = false;
    
    console.log('✅ closeChat - انتهى');
},

    
    // ==================== القسم 40: تنظيف بيانات المحادثة ====================
    cleanConversationData(chatId, cleanAll = false) {
        console.log('🧹 بدء مسح بيانات المحادثة:', chatId);
        
        const key = `chat_${chatId}`;
        if (cleanAll) {
            localStorage.removeItem(key);
            delete this.messages[chatId];
            console.log('✅ تم مسح localStorage بالكامل');
        } else {
            const messages = this.messages[chatId] || [];
            const textMessages = messages.filter(msg => msg.type === 'text').slice(-100);
            this.messages[chatId] = textMessages;
            localStorage.setItem(key, JSON.stringify(textMessages));
            console.log('✅ تم الاحتفاظ بآخر 100 رسالة نصية فقط');
        }
        
        document.querySelectorAll('img, video, audio').forEach(el => {
            if (el.src && el.src.startsWith('blob:')) {
                URL.revokeObjectURL(el.src);
                el.src = '';
            }
        });
        
        if (this.currentChat === chatId) {
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                messagesContainer.innerHTML = '';
            }
        }
        
        if (typeof CallSystem !== 'undefined') {
            CallSystem.incomingChunks = {};
            CallSystem.incomingFileInfo = {};
            CallSystem._callIceCandidates = [];
            CallSystem._answerIceCandidates = [];
        }
        
        this._pendingIceCandidates = [];
        this._responseIceCandidates = [];
        if (this._batchTimer) {
            clearTimeout(this._batchTimer);
            this._batchTimer = null;
        }
        if (this._responseBatchTimer) {
            clearTimeout(this._responseBatchTimer);
            this._responseBatchTimer = null;
        }
        
        console.log('✅ اكتمل مسح بيانات المحادثة:', chatId);
    },
    
    
    // ==================== القسم 38: escapeHtml ====================
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
};

// ==================== القسم 39: تشغيل النظام ====================
ChatSystem.init();

// ==================== القسم 41: التنظيف الشامل عند تحميل الصفحة ====================
function performGlobalCleanup() {
    console.log('🧹 بدء التنظيف الشامل للموقع...');
    
    if (typeof CallSystem !== 'undefined' && CallSystem.cleanupDynamicElements) {
        CallSystem.cleanupDynamicElements();
    }
    
    document.querySelectorAll('img, video, audio').forEach(el => {
        if (el.src && el.src.startsWith('blob:')) {
            URL.revokeObjectURL(el.src);
            el.src = '';
        }
    });
    
    const modals = ['incomingCall', 'audioCallUI', 'videoCallUI', 'locationSwipeModal', 'imagePreviewModal', 'videoPreviewModal'];
    modals.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            if (id === 'imagePreviewModal') {
                const img = document.getElementById('previewImage');
                if (img) img.src = '';
            }
            if (id === 'videoPreviewModal') {
                const video = document.getElementById('previewVideo');
                if (video) { video.pause(); video.src = ''; }
            }
            if (id === 'audioCallUI' || id === 'videoCallUI') {
                const rv = document.getElementById('remoteVideo');
                if (rv) rv.srcObject = null;
                const lv = document.getElementById('localVideo');
                if (lv) lv.srcObject = null;
            }
        }
    });
    
    const attachmentMenu = document.getElementById('attachmentMenu');
    if (attachmentMenu) attachmentMenu.style.display = 'none';
    
    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiPicker) emojiPicker.style.display = 'none';
    
    document.body.classList.remove('in-call');
    
    if (typeof CallSystem !== 'undefined') {
        if (CallSystem._callBatchTimer) {
            clearTimeout(CallSystem._callBatchTimer);
            CallSystem._callBatchTimer = null;
        }
        if (CallSystem._answerBatchTimer) {
            clearTimeout(CallSystem._answerBatchTimer);
            CallSystem._answerBatchTimer = null;
        }
        if (CallSystem.keepAliveInterval) {
            clearInterval(CallSystem.keepAliveInterval);
            CallSystem.keepAliveInterval = null;
        }
        if (CallSystem.keepAliveIntervalCall) {
            clearInterval(CallSystem.keepAliveIntervalCall);
            CallSystem.keepAliveIntervalCall = null;
        }
        if (CallSystem._incomingCallTimeout) {
            clearTimeout(CallSystem._incomingCallTimeout);
            CallSystem._incomingCallTimeout = null;
        }
    }
    
    console.log('✅ اكتمل التنظيف الشامل للموقع');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', performGlobalCleanup);
} else {
    performGlobalCleanup();
}

// ✅ الحل النهائي والثابت للمتصفحات والهواتف عند ظهور واختفاء الكيبورد
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

// 🛡️ تأمين شامل: منع سحب الواجهة بالخطأ للأعلى عند لمس الهيدر أو شريط الكتابة
document.addEventListener('touchmove', function(e) {
    if (document.body.classList.contains('conversation-open')) {
        const isMessagesContainer = e.target.closest('.messages-container');
        if (!isMessagesContainer) {
            e.preventDefault();
        }
    }
}, { passive: false });

// 🛡️ جدار حماية صارم: منع تكبير أو تصغير الموقع نهائياً بالإصبعين أو النقر المزدوج
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
