// نظام الثيم
const theme = {
    currentTheme: localStorage.getItem('theme') || 'light',
    
    init() {
        this.applyTheme();
        this.setupThemeToggle();
    },
    
    applyTheme() {
        document.body.className = `theme-${this.currentTheme}`;
        localStorage.setItem('theme', this.currentTheme);
        
        // تحديث لون شريط العنوان
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.content = this.currentTheme === 'light' ? '#2196F3' : '#1a1a1a';
        }
    },
    
    toggle() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme();
    },
    
    setupThemeToggle() {
        const toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('change', (e) => {
                this.currentTheme = e.target.checked ? 'dark' : 'light';
                this.applyTheme();
            });
            
            // ضبط حالة الزر
            toggleBtn.checked = this.currentTheme === 'dark';
        }
    }
};

theme.init();
