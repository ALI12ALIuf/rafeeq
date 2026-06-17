// ========== ui-functions.js - النسخة المعدلة (مع دوال إغلاق المعاينات) ==========
// وظائف الواجهة العامة

// ==================== القسم 1: مكدس تتبع الصفحات للرجوع المتسلسل ====================
window._pageStack = [];

function pushPage(pageType, pageId) {
    window._pageStack.push({ type: pageType, id: pageId });
}

function popPage() {
    if (window._pageStack.length > 0) {
        return window._pageStack.pop();
    }
    return null;
}

function clearStack() {
    window._pageStack = [];
}

// ==================== القسم 2: تحميل المحادثات ====================
async function loadChats() { 
    if (!window.auth || !window.auth.currentUser) return; 
    const list = document.getElementById('chatsList'); 
    if (!list) return; 
    try { 
        const udoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); 
        if (!udoc.exists) return; 
        const friends = udoc.data().friends || []; 
        if (!friends.length) { 
            list.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3><p>أضف أصدقاء لبدء المحادثة</p></div>`; 
            return; 
        } 
        let html = ''; 
        for (const fid of friends) { 
            try { 
                const fdoc = await window.db.collection('users').doc(fid).get(); 
                if (fdoc.exists) { 
                    const f = fdoc.data(); 
                    const key = `chat_${fid}`; 
                    let lm = 'اضغط لبدء المحادثة', lt = ''; 
                    try { 
                        const h = JSON.parse(localStorage.getItem(key)) || []; 
                        if (h.length > 0) { 
                            const l = h[h.length - 1]; 
                            if (l.type === 'text') lm = l.text.length > 30 ? l.text.substring(0, 30) + '...' : l.text; 
                            else if (l.type === 'image') lm = '📷 صورة'; 
                            else if (l.type === 'voice') lm = '🎤 بصمة صوتية'; 
                            else if (l.type === 'video') lm = '🎥 فيديو'; 
                            else if (l.type === 'file') lm = '📎 ملف'; 
                            lt = new Date(l.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); 
                        } 
                    } catch (e) {} 
                    html += `<div class="chat-item" onclick="openChat('${fid}')"><div class="chat-avatar-emoji">${window.getEmojiForUser(f)}</div><div class="chat-info"><h4>${f.name || 'مستخدم'}</h4><p class="last-message">${lm}</p></div><div class="chat-meta"><span class="chat-time">${lt || ''}</span></div></div>`; 
                } 
            } catch (e) {} 
        } 
        list.innerHTML = html || `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد محادثات نشطة</h3><p>ابدأ بإضافة أصدقاء جدد</p></div>`; 
    } catch (e) {} 
}

// ==================== القسم 3: إعداد مستمعي الواجهة ====================
function setupChatListeners() { 
    document.addEventListener('click', e => { 
        const m = document.getElementById('attachmentMenu'); 
        const ab = document.querySelector('.attach-btn'); 
        if (m && ab && !m.contains(e.target) && !ab.contains(e.target)) {
            m.style.display = 'none'; 
        }
    }); 
}

// ==================== القسم 4: فتح محادثة ====================
window.openChat = friendId => {
    if (document.getElementById('friendsPage') && document.getElementById('friendsPage').style.display === 'block') {
        pushPage('subpage', 'friendsPage');
    } else if (document.getElementById('friendRequestsPage') && document.getElementById('friendRequestsPage').style.display === 'block') {
        pushPage('subpage', 'friendRequestsPage');
    } else if (document.getElementById('tripsPage') && document.getElementById('tripsPage').style.display === 'block') {
        pushPage('subpage', 'tripsPage');
    } else if (document.querySelector('.profile-page') && getComputedStyle(document.querySelector('.profile-page')).display === 'block') {
        pushPage('page', 'profile');
    } else {
        pushPage('page', 'chat');
    }
    
    window.db.collection('users').doc(friendId).get().then(doc => {
        if (doc.exists) {
            const f = doc.data();
            ChatSystem.openChat(friendId, f.name, window.getEmojiForUser ? window.getEmojiForUser(f) : '👤');
        }
    }).catch(() => {});
};

// ==================== القسم 5: وظائف إرسال الرسائل ====================
window.sendMessage = () => { 
    const inp = document.getElementById('messageInput'); 
    if (inp && inp.value.trim()) {
        ChatSystem.sendMessage(inp.value.trim()).then(s => { 
            if (s) { 
                inp.value = ''; 
                inp.style.height = 'auto';
                // ✅ تحديث الزر بعد الإرسال (يعود إلى وضع البصمة)
                if (typeof window.toggleSendButton === 'function') {
                    window.toggleSendButton();
                }
            } 
        }); 
    }
};

window.handleMessageKeyPress = e => { 
    if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        // ✅ استخدام الزر الموحد
        if (typeof window.handleActionButton === 'function') {
            window.handleActionButton();
        } else {
            window.sendMessage();
        }
    } 
};

// ==================== القسم 5.1: زر الإجراء (بصمة/إرسال) ====================

// ✅ متغيرات التسجيل
let _recordingTimer = null;
let _recordingStartTime = null;
let _isRecording = false;
let _recordingBlob = null; // ✅ تخزين البصمة المؤقتة
const MAX_RECORDING_DURATION = 300; // 5 دقائق
const WARNING_THRESHOLD = 280; // 4:40 (تبقى 20 ثانية)

// دالة تبديل الزر بين البصمة والإرسال
window.toggleSendButton = function() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('actionBtn');
    if (!input || !btn) return;
    
    const featuresEnabled = typeof ChatSystem !== 'undefined' && ChatSystem.featuresEnabled;
    
    if (!featuresEnabled) {
        btn.className = 'send-mode';
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        btn.title = 'إرسال';
        btn.style.display = 'flex';
        return;
    }
    
    // ✅ إذا كانت هناك بصمة مسجلة → زر إرسال
    if (_recordingBlob) {
        btn.className = 'send-mode';
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        btn.title = 'إرسال البصمة';
        btn.style.display = 'flex';
        return;
    }
    
    const hasText = input.value.trim().length > 0;
    
    if (hasText) {
        btn.className = 'send-mode';
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        btn.title = 'إرسال';
    } else {
        btn.className = 'voice-btn';
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        btn.title = 'بصمة صوتية';
    }
    btn.style.display = 'flex';
};

// دالة معالجة الضغط على الزر
window.handleActionButton = function() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('actionBtn');
    if (!input || !btn) return;
    
    const featuresEnabled = typeof ChatSystem !== 'undefined' && ChatSystem.featuresEnabled;
    const hasText = input.value.trim().length > 0;
    
    // ✅ إذا كانت هناك بصمة مسجلة → إرسالها
    if (_recordingBlob) {
        ChatSystem.sendVoiceNote(_recordingBlob);
        _recordingBlob = null;
        // إخفاء العداد
        const timer = document.getElementById('recordingTimer');
        if (timer) timer.style.display = 'none';
        const cancelBtn = document.getElementById('cancelRecordingBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
        const inputField = document.getElementById('messageInput');
        if (inputField) {
            inputField.placeholder = 'اكتب رسالتك...';
            inputField.disabled = false;
            inputField.value = '';
            inputField.focus();
        }
        window.toggleSendButton();
        return;
    }
    
    if (hasText) {
        window.sendMessage();
    } else if (featuresEnabled) {
        window.startVoiceRecording();
    }
};

// ✅ دالة إيقاف العداد
function stopRecordingTimer() {
    if (_recordingTimer) {
        clearInterval(_recordingTimer);
        _recordingTimer = null;
    }
}

// ✅ دالة بدء العداد التصاعدي
function startRecordingTimer() {
    if (_recordingTimer) stopRecordingTimer();
    
    _recordingTimer = setInterval(() => {
        if (!_isRecording || !_recordingStartTime) {
            stopRecordingTimer();
            return;
        }
        
        const elapsed = Math.floor((Date.now() - _recordingStartTime) / 1000);
        const remaining = Math.max(0, MAX_RECORDING_DURATION - elapsed);
        
        // ✅ العداد التصاعدي (الوقت المنقضي)
        const elapsedMins = Math.floor(elapsed / 60);
        const elapsedSecs = elapsed % 60;
        const elapsedStr = `${elapsedMins}:${elapsedSecs.toString().padStart(2, '0')}`;
        
        // ✅ العداد الثابت (5:00)
        const remStr = '5:00';
        
        const timeEl = document.getElementById('recordingTime');
        const remainEl = document.getElementById('recordingRemaining');
        const timer = document.getElementById('recordingTimer');
        
        if (timeEl) timeEl.textContent = elapsedStr;
        if (remainEl) remainEl.textContent = remStr;
        
        // ✅ التحذير عند 4:40 (تبقى 20 ثانية) - يرمش أزرق/أحمر
        if (remaining <= 20 && timer) {
            timer.classList.add('warning');
        } else if (timer) {
            timer.classList.remove('warning');
        }
        
        // ✅ عند انتهاء المدة، إيقاف التسجيل (لا نرسل تلقائياً)
        if (remaining <= 0) {
            stopVoiceRecording(false);
        }
    }, 1000);
}

// ✅ دالة إيقاف التسجيل
function stopVoiceRecording(cancel = false) {
    if (!_isRecording) return;
    
    const btn = document.getElementById('actionBtn');
    const timer = document.getElementById('recordingTimer');
    const cancelBtn = document.getElementById('cancelRecordingBtn');
    const input = document.getElementById('messageInput');
    
    _isRecording = false;
    stopRecordingTimer();
    
    if (btn) {
        btn.classList.remove('recording');
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        btn.title = 'بصمة صوتية';
        btn.onclick = window.handleActionButton;
    }
    if (timer) timer.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (input) {
        input.placeholder = 'اكتب رسالتك...';
        input.disabled = false;
        input.focus();
    }
    
    // ✅ إذا كان إلغاء، مسح البصمة المؤقتة
    if (cancel) {
        _recordingBlob = null;
    }
    
    window.toggleSendButton();
}

// دالة تسجيل البصمة الصوتية
window.startVoiceRecording = function() {
    const featuresEnabled = typeof ChatSystem !== 'undefined' && ChatSystem.featuresEnabled;
    if (!featuresEnabled) {
        alert('الميزات غير مفعلة');
        return;
    }
    
    if (_isRecording) {
        stopVoiceRecording(true);
        return;
    }
    
    if (!navigator.mediaDevices?.getUserMedia) {
        alert('المتصفح لا يدعم تسجيل الصوت');
        return;
    }
    
    const btn = document.getElementById('actionBtn');
    if (!btn) return;
    if (btn.classList.contains('send-mode')) return;
    
    // ✅ إظهار العداد وزر الإلغاء
    const timer = document.getElementById('recordingTimer');
    const cancelBtn = document.getElementById('cancelRecordingBtn');
    const input = document.getElementById('messageInput');
    
    if (timer) {
        timer.style.display = 'block';
        timer.classList.remove('warning');
        document.getElementById('recordingTime').textContent = '0:00';
        document.getElementById('recordingRemaining').textContent = '5:00';
    }
    if (cancelBtn) {
        cancelBtn.style.display = 'flex';
        cancelBtn.onclick = function(e) {
            e.stopPropagation();
            stopVoiceRecording(true);
        };
    }
    if (input) {
        input.placeholder = '';
        input.disabled = true;
    }
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(s => {
            const mr = new MediaRecorder(s);
            const ch = [];
            
            btn.classList.add('recording');
            btn.innerHTML = '<i class="fas fa-stop"></i>';
            btn.title = 'إيقاف التسجيل';
            _isRecording = true;
            _recordingStartTime = Date.now();
            _recordingBlob = null;
            
            startRecordingTimer();
            
            mr.ondataavailable = e => {
                if (e.data.size > 0) ch.push(e.data);
            };
            
            mr.onstop = () => {
                stopRecordingTimer();
                s.getTracks().forEach(t => t.stop());
                const blob = new Blob(ch, { type: 'audio/webm' });
                
                // ✅ تخزين البصمة مؤقتاً (لا نرسلها تلقائياً)
                if (blob.size > 0) {
                    _recordingBlob = blob;
                }
                
                // ✅ إخفاء العداد وزر الإلغاء
                if (timer) timer.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'none';
                if (input) {
                    input.placeholder = 'اكتب رسالتك...';
                    input.disabled = false;
                    input.focus();
                }
                
                btn.classList.remove('recording');
                btn.innerHTML = '<i class="fas fa-microphone"></i>';
                btn.title = 'بصمة صوتية';
                btn.onclick = window.handleActionButton;
                _isRecording = false;
                
                // ✅ إذا كانت البصمة موجودة، تغيير الزر إلى إرسال
                if (_recordingBlob) {
                    btn.className = 'send-mode';
                    btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
                    btn.title = 'إرسال البصمة';
                    // إظهار العداد مع رسالة تأكيد
                    if (timer) {
                        timer.style.display = 'block';
                        timer.classList.remove('warning');
                        document.getElementById('recordingTime').textContent = '✅';
                        document.getElementById('recordingRemaining').textContent = 'جاهز للإرسال';
                        setTimeout(() => {
                            if (timer && !_isRecording) {
                                timer.style.display = 'none';
                            }
                        }, 2000);
                    }
                }
                
                window.toggleSendButton();
            };
            
            mr.start();
            
            btn.onclick = function() {
                if (mr.state === 'recording') {
                    mr.stop();
                    btn.onclick = window.handleActionButton;
                }
            };
            
            // ✅ إيقاف تلقائي بعد 5 دقائق (بدون إرسال)
            setTimeout(() => {
                if (mr.state === 'recording') {
                    mr.stop();
                    btn.onclick = window.handleActionButton;
                }
            }, MAX_RECORDING_DURATION * 1000);
        })
        .catch(() => {
            if (timer) timer.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (input) {
                input.placeholder = 'اكتب رسالتك...';
                input.disabled = false;
            }
            _isRecording = false;
            alert('يرجى السماح بالوصول إلى الميكروفون');
        });
};


// ==================== القسم 6: قائمة المرفقات ====================
window.showAttachmentMenu = () => { 
    const m = document.getElementById('attachmentMenu'); 
    if (m) {
        m.style.display = m.style.display === 'none' ? 'flex' : 'none'; 
    }
};

// ==================== القسم 7: إرسال الملفات ====================
window.sendImage = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = 'image/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) ChatSystem.sendImage(f); 
    }; 
    i.click(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

window.sendVideo = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = 'video/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) ChatSystem.sendVideoFile(f); 
    }; 
    i.click(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

window.sendFile = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = '*/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) ChatSystem.sendFile(f); 
    }; 
    i.click(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

// ==================== القسم 8: مشاركة الموقع ====================
window.shareLocation = () => { 
    ChatSystem.shareLocationDirect(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

// ==================== القسم 9: إغلاق المحادثة ====================
window.closeConversation = () => { 
    CallSystem.endCall(); 
    ChatSystem.closeChat();
    
    setTimeout(() => {
        const lastPage = popPage();
        
        document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
        document.querySelectorAll('.profile-subpage').forEach(s => s.style.display = 'none');
        document.body.classList.remove('profile-subpage-open');
        
        if (lastPage && lastPage.type === 'subpage') {
            document.body.classList.add('profile-subpage-open');
            document.querySelector('.profile-page').style.display = 'none';
            if (lastPage.id && document.getElementById(lastPage.id)) {
                document.getElementById(lastPage.id).style.display = 'block';
            }
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'profile') n.classList.add('active'); });
        } else if (lastPage && lastPage.type === 'page' && lastPage.id === 'profile') {
            document.querySelector('.profile-page').classList.add('active');
            document.querySelector('.profile-page').style.display = 'block';
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'profile') n.classList.add('active'); });
        } else {
            document.querySelector('.chat-page').classList.add('active');
            document.querySelector('.chat-page').style.display = 'block';
            loadChats();
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'chat') n.classList.add('active'); });
        }
    }, 200);
};

// ==================== القسم 10: تعديل الملف الشخصي ====================
window.openEditProfileModal = () => { 
    const nameInput = document.getElementById('editName'); 
    const currentName = document.getElementById('profileName')?.textContent; 
    const currentEmoji = document.getElementById('profileAvatarEmoji')?.textContent; 
    if (nameInput) nameInput.value = currentName || ''; 
    const avatarPreview = document.getElementById('currentAvatarEmoji'); 
    if (avatarPreview) avatarPreview.textContent = currentEmoji || '👤'; 
    document.getElementById('editProfileModal')?.classList.add('active'); 
};

window.saveProfile = () => { 
    const n = document.getElementById('editName')?.value?.trim(); 
    if (!n || n.length > 25) { 
        alert('الاسم مطلوب ولا يزيد عن 25 حرف'); 
        return; 
    } 
    if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ name: n }).then(() => { 
        const nameEl = document.getElementById('profileName'); 
        if (nameEl) nameEl.textContent = n; 
        closeModal(); 
    }).catch(() => alert('فشل حفظ التغييرات')); 
};

// ==================== القسم 11: الصفحات الفرعية ====================
window.showUserTrips = () => {
    pushPage('page', 'profile');
    document.body.classList.add('profile-subpage-open');
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('tripsPage').style.display = 'block';
};

window.showFriendsList = () => {
    pushPage('page', 'profile');
    document.body.classList.add('profile-subpage-open');
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('friendsPage').style.display = 'block';
};

window.showFriendRequests = () => {
    pushPage('page', 'profile');
    document.body.classList.add('profile-subpage-open');
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('friendRequestsPage').style.display = 'block';
};

// ==================== القسم 12: الرجوع من صفحة فرعية ====================
window.goBack = () => {
    const lastPage = popPage();
    
    document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none');
    document.body.classList.remove('profile-subpage-open');
    
    if (lastPage && lastPage.type === 'page' && lastPage.id === 'profile') {
        document.querySelector('.profile-page').style.display = 'block';
        document.querySelector('.profile-page').classList.add('active');
    } else {
        document.querySelector('.profile-page').style.display = 'block';
        document.querySelector('.profile-page').classList.add('active');
    }
};

// ==================== القسم 13: الصورة الرمزية ====================
window.selectAvatar = t => { 
    const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; 
    const e = m[t] || '👤'; 
    const profileAvatar = document.getElementById('profileAvatarEmoji'), currentAvatar = document.getElementById('currentAvatarEmoji'); 
    if (profileAvatar) profileAvatar.textContent = e; 
    if (currentAvatar) currentAvatar.textContent = e; 
    if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ avatarType: t }).then(() => closeModal()).catch(() => {}); 
};

window.openAvatarModal = () => document.getElementById('avatarModal')?.classList.add('active');

window.getEmojiForUser = u => { 
    const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; 
    return m[u?.avatarType] || '👤'; 
};

// ==================== القسم 14: دوال إغلاق المعاينات (المضافة) ====================
window.closeImagePreview = function() {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    if (modal) modal.style.display = 'none';
    if (img) { img.src = ''; img.style.transform = 'none'; }
};

window.closeVideoPreview = function() {
    const modal = document.getElementById('videoPreviewModal');
    const video = document.getElementById('previewVideo');
    if (modal) modal.style.display = 'none';
    if (video) { video.pause(); video.src = ''; }
};

window.downloadPreviewImage = function() {
    const img = document.getElementById('previewImage');
    if (!img || !img.src) return;
    const link = document.createElement('a');
    link.href = img.src;
    link.download = 'image.jpg';
    link.click();
};

window.downloadPreviewVideo = function() {
    const video = document.getElementById('previewVideo');
    if (!video || !video.src) return;
    const link = document.createElement('a');
    link.href = video.src;
    link.download = 'video.mp4';
    link.click();
};

// ==================== القسم 15: دوال مساعدة ====================
function formatNumber(num) { 
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'; 
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; 
    return num.toString(); 
}

async function updateTripsCount() { 
    if (!window.auth || !window.auth.currentUser) return; 
    try { 
        const s = await window.db.collection('trips').where('userId', '==', window.auth.currentUser.uid).where('status', '==', 'ended').get(); 
        const c = document.getElementById('tripsCount'); 
        if (c) c.textContent = formatNumber(s.size); 
    } catch (error) {} 
}

function ensureSinglePage() { 
    document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); 
    document.querySelectorAll('.page').forEach(p => { 
        p.style.display = p.classList.contains('active') ? 'block' : 'none'; 
    }); 
}

function setupNavigation() { 
    const nav = document.querySelectorAll('.nav-item'); 
    const pages = document.querySelectorAll('.page'); 
    if (!nav.length || !pages.length) return; 
    function switchPage(id) { 
        clearStack(); 
        pages.forEach(p => p.classList.remove('active')); 
        const t = document.querySelector(`.page.${id}-page`); 
        if (t) { 
            t.classList.add('active'); 
            t.style.display = 'block'; 
        } 
        pages.forEach(p => { 
            if (!p.classList.contains('active')) p.style.display = 'none'; 
        }); 
        document.querySelectorAll('.profile-subpage').forEach(s => s.style.display = 'none'); 
        document.body.classList.remove('profile-subpage-open'); 
        document.body.classList.remove('conversation-open'); 
        if (id === 'chat') loadChats(); 
        nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); 
    } 
    nav.forEach(n => n.addEventListener('click', () => switchPage(n.dataset.page))); 
}

function setupModals() { 
    window.openLanguageModal = () => document.getElementById('languageModal')?.classList.add('active'); 
    window.closeModal = () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); 
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { 
        if (e.target === m) m.classList.remove('active'); 
    })); 
    document.querySelectorAll('.settings-item').forEach(i => { 
        if (i.querySelector('[data-i18n="language"]')) i.addEventListener('click', window.openLanguageModal); 
    }); 
}

// ==================== القسم 16: أحداث الصفحة ====================
document.addEventListener('DOMContentLoaded', () => { 
    ensureSinglePage(); 
    setupNavigation(); 
    setupModals(); 
    loadChats(); 
    setupChatListeners(); 
    updateTripsCount(); 
});

window.addEventListener('authReady', async () => { 
    if (window.auth?.currentUser) await SecureChatSystem.init(); 
});

if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();

window.addEventListener('error', (event) => { 
    console.error('❌ خطأ عام:', event.error); 
});

window.addEventListener('unhandledrejection', (event) => { 
    console.error('❌ خطأ غير معالج:', event.reason); 
});
