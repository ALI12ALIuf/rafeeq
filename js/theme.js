// ========== نظام الثيم (داكن/فاتح) ==========

const ThemeManager = {
    currentTheme: localStorage.getItem('theme') || 'light',
    
    init() {
        console.log('🎨 Theme initialized:', this.currentTheme);
        this.applyTheme();
        this.setupThemeToggle();
    },
    
    applyTheme() {
        document.body.className = `theme-${this.currentTheme}`;
        localStorage.setItem('theme', this.currentTheme);
        
        // تحديث لون شريط الحالة
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.content = this.currentTheme === 'light' ? '#2196F3' : '#1a1a1a';
        }
        
        // تحديث واجهة المستخدم
        const toggle = document.getElementById('themeToggle');
        if (toggle) {
            toggle.checked = this.currentTheme === 'dark';
        }
    },
    
    toggle() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme();
        console.log('Theme toggled to:', this.currentTheme);
    },
    
    setupThemeToggle() {
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('change', (e) => {
                this.currentTheme = e.target.checked ? 'dark' : 'light';
                this.applyTheme();
            });
        }
    }
};

// تهيئة الثيم
ThemeManager.init();

// دالة عامة لتغيير الثيم
window.toggleTheme = function() {
    ThemeManager.toggle();
};
