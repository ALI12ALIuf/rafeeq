// ========== 2. chat-system.js - النسخة الكاملة للمشروع (E2EE والمحافظة على الخصوصية) ==========
// إدارة الدردشة والتشفير + الحضور والـ Presence الفوري + استقبال ونقل ميزات الأنبوب الموحد والخصوصية الحصينة

const ChatSystem = {
    currentChat: null, 
    messages: {},
    friendInConversation: false,
    _pendingConversationStatus: {},
    
    featuresEnabled: false,
    featureRequestPending: false,
    featureRequestReceived: false,
    featureBlinkInterval: null,
    
    offlineStartTime: null,
    offlineTimer: null,
    offlineCountdownInterval: null,
    
// ==================== القسم 2.5: دالة تحديث زر التفعيل (مركزية) ====================
updateFeatureToggleUI() {
    const toggleInput = document.getElementById('featureToggleInput');
    if (!toggleInput) return;
    
    // تحديث حالة الزر (checked) بناءً على featuresEnabled
    toggleInput.checked = this.featuresEnabled;
    
    // الزر يكون مفعلاً دائماً (يمكن الضغط عليه لإرسال طلب التفعيل) بغض النظر عن friendInConversation
    toggleInput.disabled = false;
    
    // تحديث الشفافية (الزر دائماً مرئي بالكامل)
    const featureSwitchLabel = document.getElementById('featureSwitchLabel');
    if (featureSwitchLabel) {
        featureSwitchLabel.style.opacity = '1';
        featureSwitchLabel.style.pointerEvents = 'auto';
    }
    
    console.log(`🎛️ تحديث زر التفعيل للمشروع: checked=${this.featuresEnabled}, disabled=false`);
},
    
// ==================== القسم 3: init الموثقة بالمشروع ====================
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
            console.log(`✅ تم تنظيف الوسائط العالقة من محادثة ${friendId}`);
        }
    }
    console.log('🧹 تم تنظيف وإبقاء الرسائل النصية فقط في localStorage حمايةً للخصوصية');
},
    
// ==================== القسم 4: setupBeforeUnloadListener ====================
setupBeforeUnloadListener() {
    window.addEventListener('beforeunload', () => {
        if (this.currentChat && this.featuresEnabled) {
            console.log('🚪 الصفحة تغلق - سيتم إلغاء الميزات محلياً');
        }
    });
},

// ==================== القسم 5: setupFeatureButton وتجهيز الأزرار لربط قنوات البيانات بالكامل ====================
setupFeatureButton() {
    const toggleContainer = document.getElementById('featureToggleContainer');
    const kickBtn = document.getElementById('kickBtn');
    const toggleInput = document.getElementById('featureToggleInput');
    
    if (!toggleContainer || !kickBtn || !toggleInput) {
        console.log('⚠️ لم يتم العثور على الأزرار الأساسية في قوالب الـ HTML للدردشة');
        return;
    }
    
    if (!document.getElementById('featureToggleStyles')) {
        const style = document.createElement('style');
        style.id = 'featureToggleStyles';
        style.textContent = `
            .feature-toggle-container { display: inline-flex; align-items: center; gap: 8px; margin: 0 5px; direction: ltr; }
            .feature-toggle-label { font-size: 0.7rem; color: #888; }
            .feature-switch { position: relative; display: inline-block; width: 52px; height: 26px; }
            .feature-switch input { opacity: 0; width: 0; height: 0; }
            .feature-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #f44336; transition: 0.3s; border-radius: 26px; }
            .feature-slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background-color: white; transition: 0.3s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
            input:checked + .feature-slider { background-color: #4CAF50; }
            input:checked + .feature-slider:before { transform: translateX(26px); }
            @keyframes featureBlink { 0% { background-color: #f44336; } 50% { background-color: #2196F3; } 100% { background-color: #f44336; } }
            .feature-switch.blinking .feature-slider { animation: featureBlink 0.8s ease-in-out infinite; }
            .kick-btn { background: none; border: none; color: #f44336; font-size: 1.3rem; cursor: pointer; width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; transition: all 0.3s ease; opacity: 0.5; pointer-events: none; }
            .kick-btn.active { opacity: 1; pointer-events: auto; }
            .kick-btn.active:hover { background: rgba(244, 67, 54, 0.1); transform: scale(1.05); }
            .kick-btn.active:active { transform: scale(0.95); }
        `;
        document.head.appendChild(style);
    }
    
    toggleContainer.style.display = 'inline-flex';
    kickBtn.style.display = 'inline-flex';
    
    window.featureToggleInput = toggleInput;
    
    toggleInput.onclick = (e) => {
        console.log('🔘 تم الضغط على زر التفعيل للتحكم بالميزات الحية');
        
        if (this.featuresEnabled) {
            console.log('⚠️ الميزات مفعلة، جاري إلغاء التفعيل والأنبوب الموحد');
            this.disableFeatures();
            return;
        }
        
        if (this.featureRequestReceived) {
            this.acceptFeatureRequest();
        } else if (this.featureRequestPending) {
            alert('تم إرسال طلب سابق، انتظر رد الطرف الآخر عاجلاً');
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
    console.log('✅ تم ربط وتهيئة أزرار التفعيل والطرد بنجاح.');
},

updateKickButtonState() {
    const kickBtn = document.getElementById('kickBtn');
    if (!kickBtn) return;
    
    const canUse = (this.friendInConversation && this.featuresEnabled);
    if (canUse) {
        kickBtn.classList.add('active');
        kickBtn.title = 'طرد المستخدم من المحادثة فوراً وقسرياً';
    } else {
        kickBtn.classList.remove('active');
        kickBtn.title = this.featuresEnabled ? 'غير متاح - الطرف الآخر ليس في المحادثة حالياً' : 'غير متاح - يرجى تفعيل الميزات أولاً';
    }
},

// ==================== القسم 5.1: إنهاء المحادثة وطرد الطرف الآخر عبر قنوات البيانات ====================
async kickUserFromConversation() {
    if (!this.currentChat) {
        console.log('❌ لا توجد محادثة نشطة لإنهاء جلستها الآمنة');
        return;
    }
    
    if (!this.featuresEnabled || !this.friendInConversation) {
        console.log('❌ لا يمكن إنهاء المحادثة - الميزات معطلة أو الطرف الثاني خارج بيئة الغرفة');
        return;
    }
    
    console.log('👢 تنفيذ الطرد القسري وإغلاق الشات مع:', this.currentChat);
    
    if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
        try {
            CallSystem.dc.send(JSON.stringify({ 
                type: 'force_close_conversation',
                timestamp: Date.now()
            }));
            console.log('✅ تم تمرير إشارة الطرد والإغلاق بنجاح عبر الأنبوب الموحد');
        } catch(e) {
            console.error('❌ فشل تمرير إشارة الطرد القسري للطرف الثاني:', e);
        }
    } else {
        console.log('❌ الأنبوب الموحد مغلق، تعذر تمرير إشارة الطرد الحية');
    }
    
    this.closeChat();
},   

// ==================== القسم 6: دالة ومؤقت الوميض للأزرار (30 ثانية) ====================
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
            console.log('⏰ انتهت مهلة الانتظار والأمان (30 ثانية)، تم تصفير وإلغاء الطلب المعلق تلقائياً');
        }
    }, 500);
},  

// ==================== القسم 7: إرسال طلب تفعيل الميزات المشفر بالتشفير الطرفي E2EE ====================
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
        console.log('📨 تم تغليف وبث طلب تفعيل الميزات E2EE عبر الخادم للمستقبل');
    } catch(e) {
        this.featureRequestPending = false;
        this.startFeatureBlink();
        console.log('❌ فشل إرسال وثيقة طلب التفعيل الآمنة');
    }
},

// ==================== القسم 8: استقبال ومعالجة إشعار طلب التفعيل من السيرفر السحابي ====================
async handleFeatureRequest(fromId) {
    console.log('🔔 handleFeatureRequest - تم استقبال طلب تفعيل ميزات من:', fromId);
    this.featureRequestReceived = true;
    this.startFeatureBlink();
    console.log('📞 شخص يريد تفعيل الميزات - اضغط على الدائرة الحمراء النشطة لقبول القناة المباشرة بالكامل');
}, 

// ==================== القسم 9: قبول طلب التفعيل الميزات وفتح الأنبوب الموحد تلقائياً فوراً ====================
async acceptFeatureRequest() {
    console.log('🔍 acceptFeatureRequest - بدء تنفيذ وتطبيق الربط الفوري');
    
    if (!this.featureRequestReceived && !this.featureRequestPending) {
        console.log('⚠️ لا يوجد طلب معلق للمزامنة');
        return;
    }
    
    this.featuresEnabled = true;
    this.featureRequestPending = false;
    this.featureRequestReceived = false;
    
    if (this.currentChat) {
        this.friendInConversation = true;
        console.log('✅ تم تفعيل حضور الطرف الآخر داخلياً بنجاح');
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
            console.log('🔧 محاولة بناء وربط الأنبوب الموحد لقناة البيانات المباشرة...');
            await CallSystem.ensureDataChannelOnly(this.currentChat);
        } catch(e) {
            console.error('❌ خطأ فادح في ربط الأنبوب الموحد أثناء التفعيل المباشر:', e);
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
        console.log('✅ تم بث قبول تفعيل الميزات E2EE بنجاح');
    } catch(e) {
        console.error('❌ خطأ في تشفير وبث استجابة القبول للمستقبل:', e);
    }
    
    this.updateAllButtons();
    console.log('✅ تم تفعيل وضع الميزات الشامل للدردشة حياً.');
},

// ==================== القسم 10: معالجة استجابات التفعيل القادمة من السيرفر بالكامل ====================
async handleFeatureResponse(fromId, action) {
    console.log('📨 handleFeatureResponse - from:', fromId, 'action:', action);
    
    if (action === 'accepted') {
        this.featuresEnabled = true;
        this.featureRequestPending = false;
        this.featureRequestReceived = false;
        
        if (this.currentChat === fromId) {
            this.friendInConversation = true;
            console.log('✅ تم تأكيد تفعيل الحضور بعد استلام موافقة الطرف الآخر المشفرة');
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
                console.log('🔧 محاولة فتح وتأسيس الأنبوب الموحد فور استلام تأكيد الاستجابة...');
                await CallSystem.ensureDataChannelOnly(this.currentChat);
            } catch(e) {
                console.error('❌ خطأ في فتح قنوات البيانات والوسائط:', e);
            }
        }
        
        this.updateAllButtons();
        console.log('✅ تم تفعيل الميزات والاتصال المباشر بنجاح!');
        
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
        console.log('❌ تم رفض طلب تفعيل الميزات من الطرف الآخر مع الأسف');
        
    } else if (action === 'disable') {
        console.log('🔴 استلام إشارة إيقاف الميزات الحية من الطرف الآخر');
        this.disableFeatures();
    }
},

// ==================== القسم 10.1: دالة الإلغاء الشامل للميزات والأنبوب وقنوات الاتصال العالقة ====================
async disableFeatures() {
    console.log('🔴 disableFeatures - جاري إيقاف الميزات والأنبوب الموحد للمشروع');
    
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
    
    if (typeof CallSystem !== 'undefined') {
        CallSystem.cleanupConnections();
    }
    
    this.updateAllButtons();
    console.log('✅ تم إبطال مفعول الميزات وتطهير قنوات المتصفح بنجاح');
},

// ==================== القسم 12: إعادة تعيين وضع الميزات محلياً فوراً ====================
resetFeatures() {
    console.log('🔄 resetFeatures - تصفير الميزات محلياً لوجود حدث طارئ أو قطع اتصال');
    this.featuresEnabled = false;
    this.featureRequestPending = false;
    this.featureRequestReceived = false;
    
    if (this.featureBlinkInterval) clearInterval(this.featureBlinkInterval);
    
    const toggleInput = document.getElementById('featureToggleInput');
    const switchLabel = document.getElementById('featureSwitchLabel');
    
    if (toggleInput) toggleInput.checked = false;
    if (switchLabel) switchLabel.classList.remove('blinking');
    
    this.updateAllButtons();
},

// ==================== القسم 13: التعامل الفوري مع خروج الطرف الآخر من بيئة المحادثة ====================
handleFeatureCancel() {
    console.log('🔓 handleFeatureCancel - تم استلام إشعار خروج الطرف الآخر، إلغاء الميزات فوراً');
    this.resetFeatures();
    if (typeof CallSystem !== 'undefined') {
        CallSystem.cleanupConnections();
    }
},

// ==================== القسم 14: تحديث وفك قفل الأزرار المعتمدة بالواجهة الرسومية الأصلية لمشروعك ====================
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
            btn.title = this.featuresEnabled ? 'غير متاح - الطرف الآخر ليس في المحادثة حالياً' : 'يرجى تفعيل الميزات أولاً 🔒';
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
        }
    });
    
    this.updateKickButtonState();
    this.updateFeatureToggleUI();
},

// ==================== القسم 25: دالة عرض ومسح الحاوية للرسائل ====================
displayMessages(friendId) { 
    const c = document.getElementById('messagesContainer'); 
    if (!c) return; 
    c.innerHTML = ''; 
    (this.messages[friendId] || []).forEach(m => this.displayMessage(m)); 
},

// ==================== القسم 26: دالة معالجة واستقبال وعرض الباينري الحي كـ Blobs من webrtc-call.js ====================
async displayReceivedFile(blob, fileName, isImage) {
    if (!this.currentChat) return;
    
    try {
        console.log(`📥 جاري معالجة وقراءة دفق باينري المستلم حياً وبدون كاش خادم: ${fileName}`);
        
        // تحويل ومعالجة فورية للملف إلى صيغة نصية مؤقتة لعرضه دون حفظه في قرص الجهاز أو السيرفر نهائياً
        const fileReader = new FileReader();
        fileReader.onload = (e) => {
            const b64 = e.target.result;
            const msgId = Date.now().toString();
            const currentIsoTime = new Date().toISOString();
            
            let fileType = 'file';
            if (isImage) fileType = 'image';
            else if (fileName.endsWith('.mp4') || fileName.endsWith('.webm') || fileName.endsWith('.mov')) fileType = 'video';
            else if (fileName.endsWith('.ogg') || fileName.endsWith('.wav') || fileName.endsWith('.mp3')) fileType = 'voice';

            const receivedMsg = {
                id: msgId,
                type: fileType,
                data: b64,
                fileName: fileName,
                sender: 'friend',
                time: currentIsoTime,
                status: 'delivered'
            };
            
            // ضخ الرسالة والوسيط فوراً بالواجهة الرسومية للمستقبل
            this.displayMessage(receivedMsg);
            
            // حفظ بذاكرة الجلسة النصية المؤقتة للمشروع للحذف الكلي عند الخروج
            this.saveMessage(this.currentChat, receivedMsg);
        };
        fileReader.readAsDataURL(blob);
        
    } catch (err) {
        console.error("❌ فشل معالجة الدفق للملف الحي المستلم:", err);
    }
},

// ==================== القسم 31: دوال نقل الوسائط والميزات الفورية (بث كـ Blobs حياً عبر الأنبوب الموحد) ====================
async sendImageFile(file) {
    if (!this.currentChat) return;

    if (!this.featuresEnabled || !CallSystem.dc || CallSystem.dc.readyState !== 'open') {
        alert('🔒 لا يمكن الإرسال - يرجى الانتظار وتفعيل زر الميزات المباشر أولاً!');
        return;
    }

    try {
        console.log(`📸 جاري بث الصورة حية عبر الأنبوب الموحد: ${file.name}`);
        
        // إرسال كـ Blob حي للطرف الآخر عبر الأنبوب (true تعني صورة)
        await CallSystem.sendFileUnified(file, true); 
        
        const b64 = await SecureChatSystem.fileToBase64(file); 
        const msgId = Date.now().toString();
        
        const localMsg = { 
            id: msgId, 
            type: 'image', 
            data: b64, 
            sender: 'me', 
            time: new Date().toISOString(), 
            status: 'sent' 
        };
        
        this.displayMessage(localMsg);
        this.saveMessage(this.currentChat, localMsg);
        
    } catch (error) { 
        console.error("❌ فشل شحن وبث الصورة الحية:", error);
        alert('فشل إرسال الصورة عبر القناة المباشرة'); 
    }
},

async sendVideoFile(file) { 
    if (!this.currentChat) return;
    
    if (!this.featuresEnabled || !CallSystem.dc || CallSystem.dc.readyState !== 'open') {
        alert('🔒 لا يمكن الإرسال - يرجى الانتظار وتفعيل زر الميزات المباشر أولاً!');
        return;
    }
    
    // جدار الحماية والتحقق الأصلي الكامل المدمج بمشروعك لمنع الثغرات
    try {
        await SecureChatSystem.validateVideo(file);
    } catch (error) {
        alert(error.message);
        return;
    }
    
    try {
        console.log(`🎬 جاري بث الفيديو حياً ومباشرة عبر الأنبوب الموحد: ${file.name}`);
        
        await CallSystem.sendFileUnified(file, false); 
        
        const b64 = await SecureChatSystem.fileToBase64(file); 
        const msgId = Date.now().toString();
        
        const localMsg = { 
            id: msgId, 
            type: 'video', 
            data: b64, 
            fileName: file.name, 
            sender: 'me', 
            time: new Date().toISOString(), 
            status: 'sent' 
        };
        
        this.displayMessage(localMsg);
        this.saveMessage(this.currentChat, localMsg);
        
    } catch (error) { 
        console.error("❌ فشل نقل أو بث مقطع الفيديو:", error);
        alert('فشل إرسال الفيديو عبر القناة المباشرة'); 
    }
},

async sendGeneralFile(file) {
    if (!this.currentChat) return;

    if (!this.featuresEnabled || !CallSystem.dc || CallSystem.dc.readyState !== 'open') {
        alert('🔒 لا يمكن الإرسال - يرجى الانتظار وتفعيل زر الميزات المباشر أولاً!');
        return;
    }

    try {
        console.log(`📂 جاري بث المستند عبر الأنبوب الموحد للمشروع: ${file.name}`);
        
        await CallSystem.sendFileUnified(file, false); 
        
        const b64 = await SecureChatSystem.fileToBase64(file); 
        const msgId = Date.now().toString();
        
        const localMsg = { 
            id: msgId, 
            type: 'file', 
            data: b64, 
            fileName: file.name,
            sender: 'me', 
            time: new Date().toISOString(), 
            status: 'sent' 
        };
        
        this.displayMessage(localMsg);
        this.saveMessage(this.currentChat, localMsg);
        
    } catch (error) { 
        console.error("❌ فشل بث المستند المشفر حياً عبر الأنبوب:", error);
        alert('فشل إرسال الملف عبر القناة المباشرة'); 
    }
},

async sendVoiceNote(blob, duration) {
    if (!this.currentChat) return;

    if (!this.featuresEnabled || !CallSystem.dc || CallSystem.dc.readyState !== 'open') {
        console.warn('🔒 تم حظر بث البصمة الصوتية لأن الأنبوب مغلق حالياً');
        return;
    }

    try {
        const file = new File([blob], `voice_${Date.now()}.ogg`, { type: blob.type });
        console.log(`🎙️ جاري بث البصمة الصوتية حياً للطرف الآخر وبدون وسيط...`);
        
        await CallSystem.sendFileUnified(file, false);
        
        const b64 = await SecureChatSystem.fileToBase64(file);
        const msgId = Date.now().toString();
        
        const localMsg = {
            id: msgId,
            type: 'voice',
            data: b64,
            duration: duration,
            sender: 'me',
            time: new Date().toISOString(),
            status: 'sent'
        };
        
        this.displayMessage(localMsg);
        this.saveMessage(this.currentChat, localMsg);
        
    } catch (error) {
        console.error("❌ فشل نقل وبث البصمة الصوتية حياً:", error);
    }
},

_ensureChannelReady() {
    // الأنبوب الموحد الجديد صار مؤمناً ومداراً بالكامل تلقائياً، نلغي الانتظار ونرجع true لمنع أي تجمد للبيانات
    return true;
},

// ==================== ميثودات العرض والحفظ المعتمدة بتطبيقك الأصلي لحماية البيانات وفك ترميزها ====================
displayMessage(msg) {
    const c = document.getElementById('messagesContainer');
    if (!c) return;

    const div = document.createElement('div');
    div.className = `message-wrapper ${msg.sender === 'me' ? 'outgoing' : 'incoming'}`;
    div.id = `msg-${msg.id}`;

    let contentHtml = '';
    
    if (msg.type === 'image') {
        contentHtml = `<div class="media-bubble"><img src="${msg.data}" alt="Image" class="chat-inline-img" onclick="ChatSystem.openLightBox('${msg.data}')"></div>`;
    } else if (msg.type === 'video') {
        contentHtml = `<div class="media-bubble"><video src="${msg.data}" controls class="chat-inline-video"></video></div>`;
    } else if (msg.type === 'voice') {
        contentHtml = `<div class="voice-bubble"><audio src="${msg.data}" controls></audio></div>`;
    } else if (msg.type === 'file') {
        contentHtml = `<div class="file-bubble"><a href="${msg.data}" download="${msg.fileName || 'file'}">📂 ${msg.fileName || 'تحميل الملف'}</a></div>`;
    } else {
        contentHtml = `<div class="text-bubble">${msg.data}</div>`;
    }

    div.innerHTML = contentHtml;
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
},

saveMessage(chatId, msg) {
    if (!this.messages[chatId]) this.messages[chatId] = [];
    this.messages[chatId].push(msg);
},

closeChat() {
    console.log('🧹 إغلاق وتطهير بيئة الشات الحالية محلياً بالكامل');
    this.currentChat = null;
    this.friendInConversation = false;
    this.resetFeatures();
    document.body.classList.remove('conversation-open');
    const c = document.getElementById('messagesContainer');
    if (c) c.innerHTML = '';
}
};

// ==================== حل ثبات الواجهة الرسومية عند ظهور الكيبورد في الموبايل لعدم حدوث تشظي ====================
function initVisualViewportFix() {
    if (!window.visualViewport) return;
    
    const handler = () => {
        const vh = window.visualViewport.height;
        document.documentElement.style.setProperty('--visual-vh', `${vh}px`);
        
        const chatContainer = document.querySelector('.chat-container');
        if (chatContainer) {
            chatContainer.style.height = `${vh}px`;
        }
        setTimeout(() => {
            const mc = document.getElementById('messagesContainer');
            if (mc) mc.scrollTop = mc.scrollHeight;
        }, 80);
    };
    
    window.visualViewport.addEventListener('resize', handler);
    window.visualViewport.addEventListener('scroll', handler);
    handler();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVisualViewportFix);
} else {
    initVisualViewportFix();
}

// 🛡️ طبقة حماية المشروع: منع سحب الواجهة بالخطأ للأعلى عند لمس الهيدر أو القوائم
document.addEventListener('touchmove', function(e) {
    if (document.body.classList.contains('conversation-open')) {
        const isMessagesContainer = e.target.closest('.messages-container');
        if (!isMessagesContainer) {
            e.preventDefault();
        }
    }
}, { passive: false });

// 🛡️ جدار حماية المشروع: منع تكبير أو تصغير الموقع نهائياً بالإصبعين لضمان استقرار التصميم
document.addEventListener('touchstart', function (e) {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

// منع التكبير عند النقر المزدوج السريع (Double-tap to zoom)
let lastTouchEnd = 0;
document.addEventListener('touchend', function (e) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);
