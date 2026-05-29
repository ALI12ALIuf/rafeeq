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
        let signalSent115 = false; // ✅ لمنع إرسال الإشارة أكثر من مرة
        const statusEl = document.getElementById('conversationStatus');
        
        const updateCountdown = () => {
            if (statusEl) {
                statusEl.innerHTML = `🟡 غير متصل مؤقتاً (${secondsLeft})`;
                statusEl.className = 'conversation-status offline-temp';
            }
            
            // ✅ عند الوصول إلى 115 ثانية، أرسل إشارة الخروج إلى الطرف الآخر
            if (secondsLeft === 115 && !signalSent115 && this.featuresEnabled) {
                signalSent115 = true;
                console.log('⏰ 115 ثانية - إرسال إشارة الخروج إلى الطرف الآخر');
                
                if (CallSystem.dc && CallSystem.dc.readyState === 'open') {
                    try {
                        CallSystem.dc.send(JSON.stringify({ 
                            type: 'force_close_conversation_at_115',
                            timestamp: Date.now()
                        }));
                        console.log('✅ تم إرسال إشارة الخروج إلى الطرف الآخر');
                    } catch(e) {
                        console.error('❌ فشل إرسال إشارة الخروج:', e);
                    }
                }
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
                console.log('🔴 120 ثانية - إخراج المستخدم من المحادثة');
                
                // ✅ إخراج المستخدم من المحادثة
                this.closeChat();
                
                // ✅ إلغاء الميزات محلياً
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
                
                // ✅ تحديث زر التفعيل
                const toggleInput = document.getElementById('featureToggleInput');
                if (toggleInput) toggleInput.checked = false;
                
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
