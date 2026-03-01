// إدارة التنقل بين الصفحات
document.addEventListener('DOMContentLoaded', () => {
    // إخفاء شاشة التحميل بعد 2 ثانية (إذا لم يسجل الدخول)
    setTimeout(() => {
        if (!auth.currentUser) {
            document.getElementById('splash').classList.add('hide');
            setTimeout(() => {
                document.getElementById('splash').style.display = 'none';
                document.getElementById('app').style.display = 'flex';
            }, 500);
        }
    }, 2000);
    
    // إعداد أزرار التنقل
    setupNavigation();
    
    // إعداد القائمة الجانبية
    setupSideMenu();
    
    // إعداد نوافذ البحث واللغة
    setupModals();
});

// إعداد التنقل
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const menuLinks = document.querySelectorAll('.menu-items a');
    const pages = document.querySelectorAll('.page');
    
    function switchPage(pageId) {
        // إخفاء كل الصفحات
        pages.forEach(page => page.classList.remove('active'));
        
        // إظهار الصفحة المطلوبة
        const targetPage = document.querySelector(`.page.${pageId}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        // تحديث حالة الأزرار
        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });
        
        // إغلاق القائمة الجانبية على الجوال
        document.getElementById('sideMenu').classList.remove('open');
    }
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            switchPage(item.dataset.page);
        });
    });
    
    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            if (page) {
                switchPage(page);
            }
        });
    });
    
    // زر القائمة الجانبية
    document.getElementById('menuBtn').addEventListener('click', () => {
        document.getElementById('sideMenu').classList.toggle('open');
    });
    
    // إغلاق القائمة عند النقر خارجها
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('sideMenu');
        const menuBtn = document.getElementById('menuBtn');
        if (!menu.contains(e.target) && !menuBtn.contains(e.target)) {
            menu.classList.remove('open');
        }
    });
}

// إعداد القائمة الجانبية
function setupSideMenu() {
    // تحديث الصورة والاسم إذا كان المستخدم مسجلاً
    if (auth.currentUser) {
        const menuAvatar = document.getElementById('menuAvatar');
        const menuName = document.getElementById('menuName');
        menuAvatar.src = auth.currentUser.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(auth.currentUser.displayName || 'User');
        menuName.textContent = auth.currentUser.displayName || 'مستخدم';
    }
    
    // زر تسجيل الخروج
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
}

// إعداد النوافذ المنبثقة
function setupModals() {
    window.openLanguageModal = function() {
        document.getElementById('languageModal').classList.add('active');
    };
    
    window.openSearchModal = function() {
        document.getElementById('searchModal').classList.add('active');
    };
    
    window.closeModal = function() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    };
    
    // إغلاق النوافذ عند النقر خارجها
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    // زر البحث في صفحة الدردشة
    const searchBtn = document.querySelector('.search-box button');
    if (searchBtn) {
        searchBtn.addEventListener('click', openSearchModal);
    }
    
    // زر اللغة في الإعدادات
    const langBtn = document.querySelector('[data-i18n="language"]')?.parentElement;
    if (langBtn) {
        langBtn.addEventListener('click', openLanguageModal);
    }
}

// التبديل بين تبويبات الملف الشخصي
function switchProfileTab(tab) {
    document.querySelectorAll('.profile-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(tab));
    });
    
    document.querySelectorAll('.profile-tab-content .tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === tab + 'Tab');
    });
}

// فتح الدردشة
function openChat(userId) {
    // سيتم تنفيذها لاحقاً مع WebRTC
    alert('الدردشة المباشرة قيد التطوير');
}

// تحميل القصص
function loadStories() {
    const container = document.getElementById('storiesContainer');
    const stories = [
        { name: 'قصتك', avatar: auth.currentUser?.photoURL || 'https://ui-avatars.com/api/?name=You' },
        { name: 'محمد', avatar: 'https://ui-avatars.com/api/?name=محمد' },
        { name: 'أحمد', avatar: 'https://ui-avatars.com/api/?name=أحمد' },
        { name: 'سارة', avatar: 'https://ui-avatars.com/api/?name=سارة' },
    ];
    
    container.innerHTML = stories.map(story => `
        <div class="story-item">
            <img src="${story.avatar}" class="story-avatar">
            <span class="story-name">${story.name}</span>
        </div>
    `).join('');
}

// تحميل المحادثات
function loadChats() {
    // سيتم تنفيذها لاحقاً
}

// عند تحميل الصفحة
loadStories();
loadChats();
