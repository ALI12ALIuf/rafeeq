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
            no_friends: 'لا يوجد أصدقاء',
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
            unblock_user: 'إلغاء حظر المستخدم',
            arabic: 'العربية',
            english: 'English',
            
            name: 'الاسم',
            avatar: 'الصورة الرمزية',
            change_avatar: 'تغيير',
            choose_avatar: 'اختر صورتك الرمزية',
            
            male: 'رجل',
            female: 'امرأة',
            boy: 'ولد',
            girl: 'بنت',
            father: 'أب',
            mother: 'أم',
            grandfather: 'جد',
            grandmother: 'جدة',
            
            no_trips: 'لا توجد رحلات',
            no_trips_desc: 'لم تقم بأي رحلة بعد',
            no_followers: 'لا يوجد متابعين',
            no_followers_desc: 'لم يتابعك أحد بعد',
            no_following: 'لا تتابع أحداً',
            no_following_desc: 'لم تتابع أي شخص بعد',
            
            search_placeholder: 'البحث عن الأصدقاء',
            search_no_user: 'لا يوجد مستخدم',
            search_yourself: 'هذا حسابك الشخصي',
            search_error: 'حدث خطأ بالبحث حاول مرة ثانية',
            searching: 'جاري البحث...',
            
            friend_requests: 'طلبات الصداقة',
            no_friend_requests: 'لا توجد طلبات صداقة',
            no_friend_requests_desc: 'لم يرسل لك أحد طلب صداقة بعد',
            request_sent: 'تم إرسال طلب الصداقة بنجاح',
            request_error: 'حدث خطأ في إرسال الطلب',
            request_pending: 'طلب معلق',
            already_friends: 'أصدقاء بالفعل',
            accept_request: 'قبول الطلب',
            reject_request: 'رفض الطلب',
            request_accepted: 'تم قبول طلب الصداقة بنجاح',
            request_rejected: 'تم رفض الطلب',
            friends: 'أصدقاء',
            friends_count: 'الأصدقاء',
            friend_added: 'تمت إضافة الصديق بنجاح',
            friend_removed: 'تم إزالة الصديق',
            friend_request_exists: 'لقد أرسلت طلب صداقة لهذا المستخدم مسبقاً',
            cannot_add_self: 'لا يمكنك إضافة نفسك كصديق'
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
            unblock_user: 'Unblock User',
            arabic: 'Arabic',
            english: 'English',
            
            name: 'Name',
            avatar: 'Avatar',
            change_avatar: 'Change',
            choose_avatar: 'Choose Avatar',
            
            male: 'Male',
            female: 'Female',
            boy: 'Boy',
            girl: 'Girl',
            father: 'Father',
            mother: 'Mother',
            grandfather: 'Grandfather',
            grandmother: 'Grandmother',
            
            no_trips: 'No Trips',
            no_trips_desc: "You haven't taken any trips yet",
            no_followers: 'No Followers',
            no_followers_desc: "No one is following you yet",
            no_following: 'Not Following',
            no_following_desc: "You aren't following anyone yet",
            
            search_placeholder: 'Search for friends',
            search_no_user: 'No user found',
            search_yourself: 'This is your account',
            search_error: 'Search error, please try again',
            searching: 'Searching...',
            
            friend_requests: 'Friend Requests',
            no_friend_requests: 'No friend requests',
            no_friend_requests_desc: 'No one has sent you a friend request yet',
            request_sent: 'Friend request sent successfully',
            request_error: 'Error sending friend request',
            request_pending: 'Request pending',
            already_friends: 'Already friends',
            accept_request: 'Accept request',
            reject_request: 'Reject request',
            request_accepted: 'Friend request accepted successfully',
            request_rejected: 'Request rejected',
            friends: 'Friends',
            friends_count: 'Friends',
            friend_added: 'Friend added successfully',
            friend_removed: 'Friend removed',
            friend_request_exists: 'You have already sent a friend request to this user',
            cannot_add_self: 'You cannot add yourself as a friend'
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
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });
        
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });
        
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });
        
        localStorage.setItem('language', this.currentLang);
        document.dispatchEvent(new Event('languageChanged'));
    },
    
    setupLanguageObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.hasAttribute && node.hasAttribute('data-i18n')) {
                            const key = node.getAttribute('data-i18n');
                            node.textContent = this.t(key);
                        }
                        if (node.hasAttribute && node.hasAttribute('data-i18n-placeholder')) {
                            const key = node.getAttribute('data-i18n-placeholder');
                            node.placeholder = this.t(key);
                        }
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
        observer.observe(document.body, { childList: true, subtree: true });
    }
};

i18n.init();

window.changeLanguage = function(lang) {
    if (i18n.translations[lang]) {
        i18n.currentLang = lang;
        i18n.applyLanguage();
        closeModal();
    }
};
