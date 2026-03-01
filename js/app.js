// إدارة التنقل بين الصفحات
document.addEventListener('DOMContentLoaded', () => {
    console.log('App loaded, setting up navigation...');
    
    // إعداد أزرار التنقل
    setupNavigation();
    
    // إعداد القائمة الجانبية
    setupSideMenu();
    
    // إعداد النوافذ المنبثقة
    setupModals();
    
    // تحميل القصص والمحادثات
    loadStories();
    loadChats();
});

// إعداد التنقل
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const menuLinks = document.querySelectorAll('.menu-items a');
    const pages = document.querySelectorAll('.page');
    
    if (!navItems.length || !pages.length) {
        console.log('Navigation elements not found yet');
        return;
    }
    
    function switchPage(pageId) {
        console.log('Switching to page:', pageId);
        
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
        
        // إغلاق القائمة الجانبية
        const sideMenu = document.getElementById('sideMenu');
        if (sideMenu) sideMenu.classList.remove('open');
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
    const menuBtn = document.getElementById('menuBtn');
    const sideMenu = document.getElementById('sideMenu');
    
    if (menuBtn && sideMenu) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sideMenu.classList.toggle('open');
        });
    }
    
    // إغلاق القائمة عند النقر خارجها
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('sideMenu');
        const btn = document.getElementById('menuBtn');
        if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
            menu.classList.remove('open');
        }
    });
}

// إعداد القائمة الجانبية
function setupSideMenu() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof logout === 'function') {
                logout();
            }
        });
    }
}

// إعداد النوافذ المنبثقة
function setupModals() {
    // دالة فتح نافذة اللغة
    window.openLanguageModal = function() {
        const modal = document.getElementById('languageModal');
        if (modal) modal.classList.add('active');
    };
    
    // دالة فتح نافذة البحث
    window.openSearchModal = function() {
        const modal = document.getElementById('searchModal');
        if (modal) modal.classList.add('active');
    };
    
    // دالة إغلاق النوافذ
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
    
    // عنصر اللغة في الإعدادات
    const langItems = document.querySelectorAll('.settings-item');
    langItems.forEach(item => {
        if (item.querySelector('[data-i18n="language"]')) {
            item.addEventListener('click', openLanguageModal);
        }
    });
}

// التبديل بين تبويبات الملف الشخصي
window.switchProfileTab = function(tab) {
    console.log('Switching profile tab to:', tab);
    
    const tabs = document.querySelectorAll('.profile-tabs .tab-btn');
    const panes = document.querySelectorAll('.profile-tab-content .tab-pane');
    
    tabs.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(tab));
    });
    
    panes.forEach(pane => {
        pane.classList.toggle('active', pane.id === tab + 'Tab');
    });
};

// فتح الدردشة
window.openChat = function(userId) {
    alert('الدردشة المباشرة قيد التطوير');
};

// تحميل القصص
function loadStories() {
    const container = document.getElementById('storiesContainer');
    if (!container) return;
    
    const stories = [
        { name: 'قصتك', avatar: 'https://ui-avatars.com/api/?name=You&background=2196F3&color=fff' },
        { name: 'محمد', avatar: 'https://ui-avatars.com/api/?name=محمد&background=4CAF50&color=fff' },
        { name: 'أحمد', avatar: 'https://ui-avatars.com/api/?name=أحمد&background=FF9800&color=fff' },
        { name: 'سارة', avatar: 'https://ui-avatars.com/api/?name=سارة&background=E91E63&color=fff' },
    ];
    
    container.innerHTML = stories.map(story => `
        <div class="story-item" style="display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 70px;">
            <img src="${story.avatar}" class="story-avatar" style="width: 60px; height: 60px; border-radius: 50%; border: 2px solid var(--primary); padding: 2px; object-fit: cover;">
            <span class="story-name" style="font-size: 0.8rem; color: var(--text-light);">${story.name}</span>
        </div>
    `).join('');
}

// تحميل المحادثات
function loadChats() {
    const container = document.getElementById('chatsList');
    if (!container) return;
    
    // سيتم تنفيذها لاحقاً مع WebRTC
}

// لا حاجة لهذه الدالة - الأيقونات ستبقى ثابتة بفضل CSS
// function updateIconsDirection() { ... }

// استقبال حدث تغيير اللغة - لا نقوم بأي شيء
document.addEventListener('languageChanged', function() {
    console.log('Language changed, icons remain fixed');
    // لا تغيير في الأيقونات
});
