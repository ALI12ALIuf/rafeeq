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

// ==================== متغيرات التسجيل الصوتي ====================
let voiceRecorder = {
    mediaRecorder: null,
    audioChunks: [],
    audioBlob: null,        // ✅ تخزين البصمة المسجلة
    audioUrl: null,         // ✅ رابط البصمة للتشغيل
    audioElement: null,     // ✅ عنصر الصوت للتشغيل
    startTime: null,
    timerInterval: null,
    maxDuration: 300,       // 5 دقائق
    isRecording: false,
    isCancelled: false,
    isPlaying: false,
};

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
    
    if (hasText) {
        window.sendMessage();
    } else if (featuresEnabled) {
        window.startVoiceRecording();
    }
};

// ==================== دالة تحديث العدادات ====================
function updateVoiceTimers(elapsed) {
    const remaining = Math.max(0, voiceRecorder.maxDuration - elapsed);
    const progress = Math.min(100, (elapsed / voiceRecorder.maxDuration) * 100);
    
    // عداد تنازلي
    const countdownEl = document.getElementById('countdownTimer');
    if (countdownEl) {
        const mins = Math.floor(remaining / 60);
        const secs = Math.floor(remaining % 60);
        countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        if (remaining <= 30 && remaining > 0) {
            countdownEl.classList.add('warning');
        } else {
            countdownEl.classList.remove('warning');
        }
    }
    
    // عداد تصاعدي
    const elapsedEl = document.getElementById('elapsedTimer');
    if (elapsedEl) {
        const mins = Math.floor(elapsed / 60);
        const secs = Math.floor(elapsed % 60);
        elapsedEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        // ✅ وميض العداد التصاعدي أيضاً
        if (remaining <= 30 && remaining > 0) {
            elapsedEl.classList.add('warning');
        } else {
            elapsedEl.classList.remove('warning');
        }
    }
    
    // شريط التقدم
    const progressBar = document.getElementById('progressBarVoice');
    if (progressBar) {
        progressBar.style.width = Math.min(100, progress) + '%';
        if (progress >= 90) {
            progressBar.style.background = '#f44336';
            progressBar.classList.add('warning');
        } else {
            progressBar.style.background = '#4CAF50';
            progressBar.classList.remove('warning');
        }
    }
}

// ==================== تشغيل/إيقاف البصمة المسجلة ====================
function togglePlayVoice() {
    const playBtn = document.getElementById('playVoiceBtn');
    if (!playBtn) return;
    
    if (!voiceRecorder.audioBlob) {
        alert('لا توجد بصمة للتشغيل');
        return;
    }
    
    if (voiceRecorder.isPlaying) {
        if (voiceRecorder.audioElement) {
            voiceRecorder.audioElement.pause();
            voiceRecorder.audioElement.currentTime = 0;
        }
        voiceRecorder.isPlaying = false;
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.classList.remove('playing');
        return;
    }
    
    const audio = new Audio(voiceRecorder.audioUrl);
    voiceRecorder.audioElement = audio;
    
    audio.onplay = () => {
        voiceRecorder.isPlaying = true;
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        playBtn.classList.add('playing');
    };
    
    audio.onended = () => {
        voiceRecorder.isPlaying = false;
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.classList.remove('playing');
    };
    
    audio.onerror = () => {
        voiceRecorder.isPlaying = false;
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.classList.remove('playing');
        alert('حدث خطأ في تشغيل البصمة');
    };
    
    audio.play().catch(() => {
        voiceRecorder.isPlaying = false;
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.classList.remove('playing');
    });
}

// ==================== إيقاف التسجيل ====================
function stopVoiceRecording() {
    if (voiceRecorder.mediaRecorder && voiceRecorder.mediaRecorder.state === 'recording') {
        voiceRecorder.mediaRecorder.stop();
    }
    if (voiceRecorder.timerInterval) {
        clearInterval(voiceRecorder.timerInterval);
        voiceRecorder.timerInterval = null;
    }
    // ✅ لا نستدعي resetVoiceUI هنا، بل نتركها للـ onstop
}

// ==================== إلغاء التسجيل ====================
function cancelVoiceRecording() {
    voiceRecorder.isCancelled = true;
    if (voiceRecorder.mediaRecorder && voiceRecorder.mediaRecorder.state === 'recording') {
        voiceRecorder.mediaRecorder.stop();
    }
    if (voiceRecorder.timerInterval) {
        clearInterval(voiceRecorder.timerInterval);
        voiceRecorder.timerInterval = null;
    }
    // ✅ سيتم استدعاء resetVoiceUI من onstop
}

// ==================== إعادة تعيين واجهة التسجيل ====================
function resetVoiceUI() {
    const ui = document.getElementById('voiceRecorderUI');
    const btn = document.getElementById('actionBtn');
    const input = document.getElementById('messageInput');
    const countdownEl = document.getElementById('countdownTimer');
    const elapsedEl = document.getElementById('elapsedTimer');
    const progressBar = document.getElementById('progressBarVoice');
    const playBtn = document.getElementById('playVoiceBtn');
    const sendBtn = document.getElementById('sendVoiceBtn');
    
    // إخفاء واجهة التسجيل
    if (ui) ui.style.display = 'none';
    
    // ✅ إعادة النص إلى حقل الإدخال
    if (input) {
        input.placeholder = 'اكتب رسالتك...';
        input.style.opacity = '1';
    }
    
    // ✅ إخفاء زر التشغيل
    if (playBtn) {
        playBtn.style.display = 'none';
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.classList.remove('playing');
    }
    
    // ✅ إعادة تعيين زر الإرسال
    if (sendBtn) {
        sendBtn.style.background = '#4CAF50';
        sendBtn.style.opacity = '1';
        sendBtn.style.pointerEvents = 'auto';
    }
    
    // إعادة تعيين العدادات
    if (countdownEl) {
        countdownEl.textContent = '5:00';
        countdownEl.classList.remove('warning');
    }
    if (elapsedEl) {
        elapsedEl.textContent = '0:00';
        elapsedEl.classList.remove('warning');
    }
    if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.style.background = '#4CAF50';
        progressBar.classList.remove('warning');
    }
    
    // إظهار زر البصمة
    if (btn) {
        btn.style.display = 'flex';
        btn.classList.remove('recording');
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        btn.title = 'بصمة صوتية';
        btn.onclick = window.handleActionButton;
        window.toggleSendButton();
    }
    
    // تنظيف كائنات الصوت
    if (voiceRecorder.audioElement) {
        voiceRecorder.audioElement.pause();
        voiceRecorder.audioElement = null;
    }
    if (voiceRecorder.audioUrl) {
        URL.revokeObjectURL(voiceRecorder.audioUrl);
        voiceRecorder.audioUrl = null;
    }
    voiceRecorder.audioBlob = null;
    voiceRecorder.isPlaying = false;
    voiceRecorder.isRecording = false;
    voiceRecorder.audioChunks = [];
    voiceRecorder.isCancelled = false;
}

// ==================== دالة تسجيل البصمة الصوتية ====================
window.startVoiceRecording = function() {
    const featuresEnabled = typeof ChatSystem !== 'undefined' && ChatSystem.featuresEnabled;
    if (!featuresEnabled) {
        alert('الميزات غير مفعلة');
        return;
    }
    
    if (!navigator.mediaDevices?.getUserMedia) {
        alert('المتصفح لا يدعم تسجيل الصوت');
        return;
    }
    
    const btn = document.getElementById('actionBtn');
    const input = document.getElementById('messageInput');
    if (!btn) return;
    if (btn.classList.contains('send-mode')) return;
    
    // ✅ إخفاء زر البصمة وإظهار واجهة التسجيل
    btn.style.display = 'none';
    const ui = document.getElementById('voiceRecorderUI');
    if (ui) ui.style.display = 'flex';
    
    // ✅ إخفاء النص في حقل الإدخال أثناء التسجيل
    if (input) {
        input.placeholder = '';
        input.style.opacity = '0.3';
    }
    
    // ✅ إخفاء زر التشغيل أثناء التسجيل
    const playBtn = document.getElementById('playVoiceBtn');
    if (playBtn) {
        playBtn.style.display = 'none';
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.classList.remove('playing');
    }
    
    // ✅ تعطيل زر الإرسال مؤقتاً
    const sendBtn = document.getElementById('sendVoiceBtn');
    if (sendBtn) {
        sendBtn.style.background = '#888';
        sendBtn.style.opacity = '0.5';
        sendBtn.style.pointerEvents = 'none';
    }
    
    // ✅ إعادة تعيين المتغيرات
    voiceRecorder.audioChunks = [];
    voiceRecorder.isRecording = true;
    voiceRecorder.isCancelled = false;
    voiceRecorder.startTime = Date.now();
    voiceRecorder.audioBlob = null;
    voiceRecorder.audioUrl = null;
    
    // ✅ تحديث العدادات
    updateVoiceTimers(0);
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            const mr = new MediaRecorder(stream);
            voiceRecorder.mediaRecorder = mr;
            
            mr.ondataavailable = e => {
                if (e.data.size > 0) voiceRecorder.audioChunks.push(e.data);
            };
            
            mr.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                
                if (voiceRecorder.timerInterval) {
                    clearInterval(voiceRecorder.timerInterval);
                    voiceRecorder.timerInterval = null;
                }
                
                // ✅ حفظ البصمة للتشغيل (إذا لم يتم الإلغاء)
                if (!voiceRecorder.isCancelled && voiceRecorder.audioChunks.length > 0) {
                    const blob = new Blob(voiceRecorder.audioChunks, { type: 'audio/webm' });
                    if (blob.size > 0) {
                        voiceRecorder.audioBlob = blob;
                        voiceRecorder.audioUrl = URL.createObjectURL(blob);
                        
                        // ✅ إظهار زر التشغيل
                        const playBtn = document.getElementById('playVoiceBtn');
                        if (playBtn) {
                            playBtn.style.display = 'flex';
                            playBtn.innerHTML = '<i class="fas fa-play"></i>';
                        }
                        
                        // ✅ تفعيل زر الإرسال
                        const sendBtn = document.getElementById('sendVoiceBtn');
                        if (sendBtn) {
                            sendBtn.style.background = '#4CAF50';
                            sendBtn.style.opacity = '1';
                            sendBtn.style.pointerEvents = 'auto';
                        }
                    }
                } else {
                    // ✅ إذا تم الإلغاء → إعادة تعيين الواجهة
                    resetVoiceUI();
                    return;
                }
                
                // ✅ إخفاء واجهة التسجيل وإظهار زر البصمة
                if (ui) ui.style.display = 'none';
                btn.style.display = 'flex';
                btn.classList.remove('recording');
                btn.innerHTML = '<i class="fas fa-microphone"></i>';
                btn.title = 'بصمة صوتية';
                btn.onclick = window.handleActionButton;
                
                // ✅ إعادة النص إلى حقل الإدخال
                if (input) {
                    input.placeholder = 'اكتب رسالتك...';
                    input.style.opacity = '1';
                }
                
                voiceRecorder.isRecording = false;
                window.toggleSendButton();
            };
            
            mr.start();
            
            // ✅ بدء المؤقت
            voiceRecorder.timerInterval = setInterval(() => {
                const elapsed = (Date.now() - voiceRecorder.startTime) / 1000;
                updateVoiceTimers(elapsed);
                
                if (elapsed >= voiceRecorder.maxDuration) {
                    stopVoiceRecording();
                }
            }, 100);
        })
        .catch(() => {
            alert('يرجى السماح بالوصول إلى الميكروفون');
            resetVoiceUI();
        });
};

// ==================== ربط أزرار واجهة التسجيل ====================
document.addEventListener('DOMContentLoaded', function() {
    const cancelBtn = document.getElementById('cancelVoiceBtn');
    const sendBtn = document.getElementById('sendVoiceBtn');
    const playBtn = document.getElementById('playVoiceBtn');
    
    if (cancelBtn) {
        cancelBtn.onclick = function() {
            cancelVoiceRecording();
        };
    }
    
    if (sendBtn) {
        sendBtn.onclick = function() {
            // ✅ إذا كانت البصمة موجودة → إيقاف التسجيل وإرسالها
            if (voiceRecorder.audioBlob) {
                // إرسال البصمة
                if (voiceRecorder.audioBlob.size > 0) {
                    ChatSystem.sendVoiceNote(voiceRecorder.audioBlob);
                }
                resetVoiceUI();
            } else {
                stopVoiceRecording();
            }
        };
    }
    
    // ✅ ربط زر التشغيل
    if (playBtn) {
        playBtn.onclick = function() {
            togglePlayVoice();
        };
    }
});


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
