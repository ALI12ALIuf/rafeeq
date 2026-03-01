// نظام الترجمة
const i18n = {
    currentLang: localStorage.getItem('language') || 'ar',
    
    translations: {
        ar: {
            app_name: 'رفيق',
            home: 'الرئيسية',
            chat: 'الدردشة',
            profile: 'الملف الشخصي',
            settings: 'الإعدادات',
            followers: 'متابعون',
            following: 'يتابع',
            posts: 'المنشورات',
            trips: 'رحلات',
            your_id: 'معرفك',
            copy: 'نسخ',
            copied: 'تم النسخ',
            search_friends: 'البحث عن أصدقاء',
            type_message: 'اكتب رسالتك...',
            send: 'إرسال',
            image: 'صورة',
            call: 'اتصال',
            logout: 'تسجيل الخروج',
            login: 'تسجيل الدخول',
            login_with_google: 'المتابعة بحساب جوجل',
            login_desc: 'سجل دخولك للوصول إلى جميع الميزات',
            login_note: 'لن يتم مشاركة معلوماتك مع أي طرف ثالث',
            select_language: 'اختر اللغة',
            dark_mode: 'الوضع الداكن',
            light_mode: 'الوضع الفاتح',
            theme: 'المظهر',
            language: 'اللغة',
            add_friend: 'إضافة صديق',
            friend_id: 'معرف الصديق (10 أرقام)',
            send_request: 'إرسال طلب',
            pending_requests: 'طلبات الصداقة',
            accept: 'قبول',
            reject: 'رفض',
            friends_list: 'قائمة الأصدقاء',
            no_friends: 'لا يوجد أصدقاء بعد',
            add_first_friend: 'أضف أول صديق',
            no_requests: 'لا توجد طلبات صداقة',
            connecting: 'جاري الاتصال...',
            online: 'متصل',
            offline: 'غير متصل',
            block: 'حظر',
            unblock: 'إلغاء الحظر',
            remove_friend: 'إزالة الصديق',
            location_sharing: 'مشاركة الموقع',
            share_location: 'شارك موقعك',
            stop_sharing: 'إيقاف المشاركة',
            followers_count: 'المتابعون',
            following_count: 'يتابع',
            trips_count: 'الرحلات',
            edit_profile: 'تعديل الملف الشخصي',
            save: 'حفظ',
            cancel: 'إلغاء',
            bio: 'نبذة عني',
            camera: 'الكاميرا',
            gallery: 'المعرض',
            remove_photo: 'إزالة الصورة',
            report: 'تبليغ',
            block_user: 'حظر المستخدم',
            unblock_user: 'إلغاء حظر المستخدم'
        },
        en: {
            app_name: 'Rafeeq',
            home: 'Home',
            chat: 'Chat',
            profile: 'Profile',
            settings: 'Settings',
            followers: 'Followers',
            following: 'Following',
            posts: 'Posts',
            trips: 'Trips',
            your_id: 'Your ID',
            copy: 'Copy',
            copied: 'Copied',
            search_friends: 'Search friends',
            type_message: 'Type your message...',
            send: 'Send',
            image: 'Image',
            call: 'Call',
            logout: 'Logout',
            login: 'Login',
            login_with_google: 'Continue with Google',
            login_desc: 'Login to access all features',
            login_note: 'Your information will not be shared',
            select_language: 'Select Language',
            dark_mode: 'Dark Mode',
            light_mode: 'Light Mode',
            theme: 'Theme',
            language: 'Language',
            add_friend: 'Add Friend',
            friend_id: 'Friend ID (10 digits)',
            send_request: 'Send Request',
            pending_requests: 'Friend Requests',
            accept: 'Accept',
            reject: 'Reject',
            friends_list: 'Friends List',
            no_friends: 'No friends yet',
            add_first_friend: 'Add your first friend',
            no_requests: 'No friend requests',
            connecting: 'Connecting...',
            online: 'Online',
            offline: 'Offline',
            block: 'Block',
            unblock: 'Unblock',
            remove_friend: 'Remove Friend',
            location_sharing: 'Location Sharing',
            share_location: 'Share Location',
            stop_sharing: 'Stop Sharing',
            followers_count: 'Followers',
            following_count: 'Following',
            trips_count: 'Trips',
            edit_profile: 'Edit Profile',
            save: 'Save',
            cancel: 'Cancel',
            bio: 'Bio',
            camera: 'Camera',
            gallery: 'Gallery',
            remove_photo: 'Remove Photo',
            report: 'Report',
            block_user: 'Block User',
            unblock_user: 'Unblock User'
        }
    },
    
    init() {
        console.log('Initializing i18n with language:', this.currentLang);
        this.applyLanguage();
        this.setupLanguageObserver();
    },
    
    t(key) {
        return this.translations[this.currentLang]?.[key] || key;
    },
    
    applyLanguage() {
        // تغيير اتجاه الصفحة
        document.documentElement.lang = this.currentLang;
        document.documentElement.dir = this.currentLang === 'ar' ? 'rtl' : 'ltr';
        
        // تحديث جميع العناصر التي تحمل data-i18n
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });
        
        // تحديث placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });
        
        // تحديث سمات مثل title
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });
        
        // تحديث نص زر تبديل اللغة
        const langToggle = document.querySelector('.language-option.active');
        if (langToggle) {
            langToggle.textContent = this.currentLang === 'ar' ? 'English' : 'العربية';
        }
        
        localStorage.setItem('language', this.currentLang);
        
        // إعادة تطبيق الثيم بعد تغيير اللغة (لأن بعض العناصر قد تتأثر)
        if (typeof theme !== 'undefined' && theme.applyTheme) {
            theme.applyTheme();
        }
    },
    
    setupLanguageObserver() {
        // مراقبة العناصر الجديدة
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        // تطبيق الترجمة على العنصر الجديد نفسه
                        if (node.hasAttribute && node.hasAttribute('data-i18n')) {
                            const key = node.getAttribute('data-i18n');
                            node.textContent = this.t(key);
                        }
                        if (node.hasAttribute && node.hasAttribute('data-i18n-placeholder')) {
                            const key = node.getAttribute('data-i18n-placeholder');
                            node.placeholder = this.t(key);
                        }
                        
                        // تطبيق الترجمة على العناصر الفرعية
                        if (node.querySelectorAll) {
                            node.querySelectorAll('[data-i18n]').forEach(el => {
                                const key = el.getAttribute('data-i18n');
                                el.textContent = this.t(key);
                            });
                            node.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                                const key = el.getAttribute('data-i18n-placeholder');
                                el.placeholder = this.t(key);
                            });
                        }
                    }
                });
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
};

// تهيئة الترجمة
i18n.init();

// دالة تغيير اللغة
window.changeLanguage = function(lang) {
    if (i18n.translations[lang]) {
        i18n.currentLang = lang;
        i18n.applyLanguage();
        closeModal();
    }
};
