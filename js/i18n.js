// ========== نظام الترجمة المبسط ==========

const i18n = {
    currentLang: localStorage.getItem('language') || 'ar',
    
    translations: {
        ar: {
            // عام
            app_name: 'رفيق P2P',
            home: 'الرئيسية',
            chat: 'الدردشة',
            profile: 'الملف',
            settings: 'الإعدادات',
            
            // الدردشة
            type_message: 'اكتب رسالة مشفرة...',
            send: 'إرسال',
            image: 'صورة',
            file: 'ملف',
            voice: 'بصمة صوت',
            encrypting: 'مشفر 🔒',
            p2p_encrypted: 'P2P مشفر',
            connecting: 'جاري الاتصال...',
            offline: 'غير متصل',
            
            // البحث والأصدقاء
            search_placeholder: 'بحث عن مستخدم بالمعرف...',
            search_no_user: 'لا يوجد مستخدم',
            search_yourself: 'هذا حسابك الشخصي',
            add_friend: 'إضافة صديق',
            friend_added: 'تم إضافة الصديق بنجاح',
            friends: 'الأصدقاء',
            no_friends: 'لا يوجد أصدقاء',
            no_friends_desc: 'ابحث عن مستخدم باستخدام المعرف الخاص به',
            
            // تسجيل الدخول
            login_with_google: 'المتابعة بحساب جوجل',
            login_desc: 'تواصل مشفر بالكامل',
            login_note: '🔒 جميع الرسائل مشفرة من طرف إلى طرف\nالسيرفر لا يرى أي محتوى',
            logout: 'تسجيل الخروج',
            
            // الحالات
            online: 'متصل',
            offline_status: 'غير متصل',
            last_seen: 'آخر ظهور',
            
            // الإعدادات
            theme: 'المظهر',
            language: 'اللغة',
            dark_mode: 'الوضع الداكن',
            light_mode: 'الوضع الفاتح',
            arabic: 'العربية',
            english: 'English',
            
            // الأخطاء
            error_occurred: 'حدث خطأ',
            connection_error: 'خطأ في الاتصال',
            encryption_error: 'خطأ في التشفير',
            
            // نوافذ منبثقة
            cancel: 'إلغاء',
            save: 'حفظ',
            delete: 'حذف',
            confirm: 'تأكيد',
            
            // حالة التشفير
            encryption_status: 'حالة التشفير',
            encryption_algorithm: 'AES-256-GCM + ECDH',
            key_exchange: 'تبادل المفاتيح',
            perfect_forward_secrecy: 'سرية تامة للأمام',
            
            // الملفات
            image_sent: '📷 صورة',
            file_sent: '📎 ملف',
            voice_sent: '🎤 بصمة صوتية',
            recording: 'جاري التسجيل...',
            stop_recording: 'إيقاف',
            
            // ترحيب
            welcome_title: 'تواصل مشفر بالكامل',
            welcome_desc: 'اختر محادثة لبدء التشفير من طرف إلى طرف'
        },
        
        en: {
            // General
            app_name: 'Rafeeq P2P',
            home: 'Home',
            chat: 'Chat',
            profile: 'Profile',
            settings: 'Settings',
            
            // Chat
            type_message: 'Type encrypted message...',
            send: 'Send',
            image: 'Image',
            file: 'File',
            voice: 'Voice note',
            encrypting: 'Encrypted 🔒',
            p2p_encrypted: 'P2P Encrypted',
            connecting: 'Connecting...',
            offline: 'Offline',
            
            // Search & Friends
            search_placeholder: 'Search user by ID...',
            search_no_user: 'No user found',
            search_yourself: 'This is your account',
            add_friend: 'Add Friend',
            friend_added: 'Friend added successfully',
            friends: 'Friends',
            no_friends: 'No friends yet',
            no_friends_desc: 'Search for a user using their ID',
            
            // Login
            login_with_google: 'Continue with Google',
            login_desc: 'Fully encrypted communication',
            login_note: '🔒 All messages are end-to-end encrypted\nThe server never sees any content',
            logout: 'Logout',
            
            // Status
            online: 'Online',
            offline_status: 'Offline',
            last_seen: 'Last seen',
            
            // Settings
            theme: 'Theme',
            language: 'Language',
            dark_mode: 'Dark Mode',
            light_mode: 'Light Mode',
            arabic: 'Arabic',
            english: 'English',
            
            // Errors
            error_occurred: 'An error occurred',
            connection_error: 'Connection error',
            encryption_error: 'Encryption error',
            
            // Modals
            cancel: 'Cancel',
            save: 'Save',
            delete: 'Delete',
            confirm: 'Confirm',
            
            // Encryption status
            encryption_status: 'Encryption Status',
            encryption_algorithm: 'AES-256-GCM + ECDH',
            key_exchange: 'Key Exchange',
            perfect_forward_secrecy: 'Perfect Forward Secrecy',
            
            // Files
            image_sent: '📷 Image',
            file_sent: '📎 File',
            voice_sent: '🎤 Voice note',
            recording: 'Recording...',
            stop_recording: 'Stop',
            
            // Welcome
            welcome_title: 'Fully Encrypted Communication',
            welcome_desc: 'Select a chat to start end-to-end encryption'
        }
    },
    
    init() {
        console.log('🌐 i18n initialized with language:', this.currentLang);
        this.applyLanguage();
        this.setupLanguageObserver();
    },
    
    t(key) {
        return this.translations[this.currentLang]?.[key] || key;
    },
    
    applyLanguage() {
        // تحديث النصوص في العناصر التي تحمل data-i18n
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = this.t(key);
            } else {
                el.textContent = this.t(key);
            }
        });
        
        // تحديث خاصية placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });
        
        // تحديث خاصية title
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });
        
        // تحديث اتجاه النص (RTL/LTR)
        if (this.currentLang === 'ar') {
            document.documentElement.setAttribute('dir', 'rtl');
            document.documentElement.setAttribute('lang', 'ar');
        } else {
            document.documentElement.setAttribute('dir', 'ltr');
            document.documentElement.setAttribute('lang', 'en');
        }
        
        localStorage.setItem('language', this.currentLang);
        document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: this.currentLang } }));
    },
    
    setupLanguageObserver() {
        // مراقبة إضافة عناصر جديدة للترجمة التلقائية
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        this.translateNode(node);
                    }
                });
            });
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    },
    
    translateNode(node) {
        // ترجمة العنصر نفسه
        if (node.hasAttribute && node.hasAttribute('data-i18n')) {
            const key = node.getAttribute('data-i18n');
            if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
                node.placeholder = this.t(key);
            } else {
                node.textContent = this.t(key);
            }
        }
        
        // ترجمة العناصر الفرعية
        if (node.querySelectorAll) {
            node.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = this.t(key);
                } else {
                    el.textContent = this.t(key);
                }
            });
            
            node.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                el.placeholder = this.t(key);
            });
        }
    },
    
    // تغيير اللغة
    setLanguage(lang) {
        if (this.translations[lang]) {
            this.currentLang = lang;
            this.applyLanguage();
            return true;
        }
        return false;
    },
    
    // الحصول على اللغة الحالية
    getLanguage() {
        return this.currentLang;
    }
};

// تهيئة النظام
i18n.init();

// دوال عامة للاستخدام
window.changeLanguage = function(lang) {
    if (i18n.setLanguage(lang)) {
        console.log('Language changed to:', lang);
        // إغلاق النافذة المنبثقة إذا كانت مفتوحة
        const modal = document.getElementById('languageModal');
        if (modal) modal.style.display = 'none';
    }
};

window.getCurrentLanguage = function() {
    return i18n.getLanguage();
};

console.log('✅ i18n system initialized');
