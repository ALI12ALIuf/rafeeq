// ========== chat-system.js =========
// نظام الدردشة الموحد الفوري والمؤمن E2EE + نظام الحضور والتحكم الحي بالوسائط

// ==================== القسم 2: تعريف ChatSystem ====================
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
    
// ==================== القسم 2.5: دالة تحديث واجهة زر التفعيل الفوري ====================
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
    
    console.log(`🎛️ تحديث واجهة زر الميزات الفوري: checked=${this.featuresEnabled}`);
},

// ==================== القسم 25: displayMessages & toggleFeaturesMode ====================
displayMessages(friendId) { 
    const c = document.getElementById('messagesContainer'); 
    if (!c) return; 
    c.innerHTML = ''; 
    (this.messages[friendId] || []).forEach(m => this.displayMessage(m)); 
},

toggleFeaturesMode(enabled) {
    this.featuresEnabled = enabled;
    this.updateFeatureToggleUI();

    // إرسال حالة تفعيل الميزات حياً عبر الأنبوب الموحد فوراً بدون وسيط سحابي
    if (typeof CallSystem !== 'undefined' && CallSystem.dc && typeof CallSystem.dc.send === 'function' && CallSystem.dc.readyState === 'open') {
        try {
            CallSystem.dc.send(JSON.stringify({
                type: 'feature-toggle',
                enabled: enabled
            }));
            console.log(`📡 تم إرسال حالة وضع الميزات للطرف الآخر حياً: ${enabled}`);
        } catch (e) {
            console.error("❌ فشل إرسال إشارة الميزات عبر قناة البيانات:", e);
        }
    } else {
        if (enabled) {
            alert("🔒 تنبيه: يجب بدء اتصال (صوتي أو مرئي) مع الطرف الآخر أولاً لتفعيل نقل الملفات والصور حياً!");
            this.featuresEnabled = false;
            this.updateFeatureToggleUI();
        }
    }
},

// ==================== القسم 26: دالة استقبال وعرض الملفات الحية (تُستدعى تلقائياً من webrtc-call.js) ====================
async displayReceivedFile(blob, fileName, isImage) {
    if (!this.currentChat) return;
    
    try {
        console.log(`📥 جاري معالجة الملف المستلم حياً وبدون كاش: ${fileName}`);
        
        // تحويل الملف المستلم إلى Base64 لعرضه فوراً في شاشة الدردشة
        const fileReader = new FileReader();
        fileReader.onload = (e) => {
            const b64 = e.target.result;
            const msgId = Date.now().toString();
            const currentIsoTime = new Date().toISOString();
            
            // تحديد نوع الرسالة المستلمة بناءً على طبيعة الملف لتوجه للعرض الصحيح
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
            
            // عرض الرسالة حياً في الشاشة
            this.displayMessage(receivedMsg);
            
            // حفظ الرسالة بذاكرة المتصفح المؤقتة (نصياً) توافقاً مع نظامك الآمن
            this.saveMessage(this.currentChat, receivedMsg);
        };
        fileReader.readAsDataURL(blob);
        
    } catch (err) {
        console.error("❌ فشل معالجة وعرض الملف المستلم:", err);
    }
},

// ==================== القسم 31: دوال الإرسال الفورية والموحدة عبر الأنبوب (صور، فيديو، ملفات، بصمات) ====================
async sendImageFile(file) {
    if (!this.currentChat) return;

    if (!this.featuresEnabled || !CallSystem.dc || CallSystem.dc.readyState !== 'open') {
        alert('🔒 لا يمكن الإرسال - يرجى فتح مكالمة وتفعيل زر الميزات أولاً للاتصال بالطرف الآخر!');
        return;
    }

    try {
        console.log(`📸 جاري نقل صورة مباشرة عبر الأنبوب الموحد: ${file.name}`);
        
        // نقل الملف مباشرة عبر الأنبوب (true تعني أن الملف صورة)
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
        console.error("❌ فشل نقل الصورة:", error);
        alert('فشل إرسال الصورة عبر القناة المباشرة'); 
    }
},

async sendVideoFile(file) { 
    if (!this.currentChat) return;
    
    if (!this.featuresEnabled || !CallSystem.dc || CallSystem.dc.readyState !== 'open') {
        alert('🔒 لا يمكن الإرسال - يرجى فتح مكالمة وتفعيل زر الميزات أولاً للاتصال بالطرف الآخر!');
        return;
    }
    
    // جدار الحماية والتحقق الحصين من الفيديو الخاص بك
    try {
        await SecureChatSystem.validateVideo(file);
    } catch (error) {
        alert(error.message);
        return;
    }
    
    try {
        console.log(`🎬 جاري نقل فيديو مباشر عبر الأنبوب الموحد: ${file.name} | ${(file.size/1024/1024).toFixed(1)}MB`);
        
        // نقل الفيديو مباشرة عبر الأنبوب الموحد
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
        console.error("❌ فشل نقل أو معالجة الفيديو:", error);
        alert('فشل إرسال الفيديو عبر القناة المباشرة'); 
    }
},

async sendGeneralFile(file) {
    if (!this.currentChat) return;

    if (!this.featuresEnabled || !CallSystem.dc || CallSystem.dc.readyState !== 'open') {
        alert('🔒 لا يمكن الإرسال - يرجى فتح مكالمة وتفعيل زر الميزات أولاً للاتصال بالطرف الآخر!');
        return;
    }

    try {
        console.log(`📂 جاري نقل ملف عبر الأنبوب الموحد: ${file.name}`);
        
        // إرسال الملف العام عبر الأنبوب الموحد
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
        console.error("❌ فشل نقل الملف:", error);
        alert('فشل إرسال الملف عبر القناة المباشرة'); 
    }
},

async sendVoiceNote(blob, duration) {
    if (!this.currentChat) return;

    if (!this.featuresEnabled || !CallSystem.dc || CallSystem.dc.readyState !== 'open') {
        console.warn('🔒 لم يتم إرسال البصمة المباشرة لأن قناة الميزات مغلقة');
        return;
    }

    try {
        const file = new File([blob], `voice_${Date.now()}.ogg`, { type: blob.type });
        console.log(`🎙️ جاري نقل بصمة صوتية مباشرة عبر الأنبوب الموحد...`);
        
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
        console.error("❌ فشل نقل البصمة الصوتية حياً:", error);
    }
},

_ensureChannelReady() {
    // الأنبوب الموحد يدار بالكامل تلقائياً وفورياً، نرجع true دائماً لإلغاء التعليق والتجميد القديم
    return true;
},

// ==================== ميثودات العرض والحفظ والمسح المعتمدة بتطبيقك الأصلي ====================
displayMessage(msg) {
    const c = document.getElementById('messagesContainer');
    if (!c) return;

    const div = document.createElement('div');
    div.className = `message-wrapper ${msg.sender === 'me' ? 'outgoing' : 'incoming'}`;
    div.id = `msg-${msg.id}`;

    let contentHtml = '';
    
    // دعم العرض الفوري لكل أنواع الميزات المشفرة في الذاكرة دون خادم
    if (msg.type === 'image') {
        contentHtml = `<div class="media-bubble"><img src="${msg.data}" alt="Image" class="chat-inline-img" onclick="ChatSystem.openLightBox('${msg.data}')"></div>`;
    } else if (msg.type === 'video') {
        contentHtml = `<div class="media-bubble"><video src="${msg.data}" controls class="chat-inline-video"></video></div>`;
    } else if (msg.type === 'voice') {
        contentHtml = `<div class="voice-bubble"><audio src="${msg.data}" controls></audio></div>`;
    } else if (msg.type === 'file') {
        contentHtml = `<div class="file-bubble"><a href="${msg.data}" download="${msg.fileName || 'file'}">📂 ${msg.fileName || 'تحميل الملف'}</a></div>`;
    } else {
        // الرسالة النصية العادية
        contentHtml = `<div class="text-bubble">${msg.data}</div>`;
    }

    div.innerHTML = contentHtml;
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
},

saveMessage(chatId, msg) {
    if (!this.messages[chatId]) this.messages[chatId] = [];
    this.messages[chatId].push(msg);
}
};

// ==================== حلول ثبات الواجهة الرسومية عند ظهور الكيبورد في الموبايل ====================
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

// 🛡️ طبقة الحماية لمنع سحب الواجهة بالخطأ عند لمس الهيدر أو شريط الكتابة
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
