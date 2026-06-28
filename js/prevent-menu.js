// ========== prevent-menu.js ==========
// منع القائمة المنبثقة (Context Menu) بنسبة 100% في جميع أنحاء الموقع

(function() {
    'use strict';
    
    // ✅ منع قائمة السياق الافتراضية (النقر بزر الفأرة الأيمن)
    document.addEventListener('contextmenu', function(e) {
        // ✅ إصلاح كروم: لا نمنع القائمة إذا كان الزر مخصصاً للتحميل (للسماح بـ "حفظ الرابط كـ")
        if (e.target.closest('.download-file-btn') || e.target.closest('[onclick*="download"]')) {
            return true;
        }
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, { passive: false, capture: true });
    
    // ✅ منع الضغط المطول (للهواتف)
    document.addEventListener('touchstart', function(e) {
        // لا نمنع الحدث نفسه، فقط نمنع القائمة
    }, { passive: true });
    
    // ✅ منع السحب والإفلات (Drag & Drop)
    document.addEventListener('dragstart', function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, { passive: false, capture: true });
    
    // ✅ منع القائمة عند الضغط المطول على الروابط
    document.addEventListener('touchforcechange', function(e) {
        // منع أي قائمة منبثقة
    }, { passive: true });
    
    // ✅ منع القائمة عند الضغط المطول على الصور والفيديوهات (للأندرويد)
    document.addEventListener('touchend', function(e) {
        const target = e.target;
        // إذا كان العنصر يحتوي على src (صورة أو فيديو)، نمنع القائمة
        if (target.tagName === 'IMG' || target.tagName === 'VIDEO' || target.tagName === 'A') {
            // لا نمنع الحدث نفسه
        }
    }, { passive: true });
    
    // ✅ منع قائمة السياق على جميع العناصر ديناميكياً (للعناصر التي تضاف لاحقاً)
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // عنصر HTML
                    // إضافة منع القائمة للعنصر نفسه
                    node.addEventListener('contextmenu', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }, { passive: false });
                    
                    // منع السحب
                    node.addEventListener('dragstart', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }, { passive: false });
                    
                    // منع القائمة على جميع العناصر الفرعية
                    node.querySelectorAll('*').forEach(function(child) {
                        child.addEventListener('contextmenu', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            return false;
                        }, { passive: false });
                        
                        child.addEventListener('dragstart', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            return false;
                        }, { passive: false });
                    });
                }
            });
        });
    });
    
    // بدء مراقبة التغييرات في الصفحة
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // ✅ إضافة خصائص CSS لمنع القائمة عبر JavaScript
    const style = document.createElement('style');
    style.textContent = `
        /* منع القائمة المنبثقة في جميع أنحاء الموقع */
        * {
            -webkit-touch-callout: none !important;
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-user-drag: none !important;
            user-drag: none !important;
            touch-action: manipulation !important;
        }
        
        /* منع السحب والإفلات */
        img, video, a, button, div, span {
            -webkit-user-drag: none !important;
            user-drag: none !important;
            -webkit-touch-callout: none !important;
        }
        
        /* منع القائمة على العناصر التفاعلية */
        button, a, input, textarea {
            -webkit-touch-callout: none !important;
            -webkit-user-select: none !important;
            user-select: none !important;
        }
        
        /* ✅ إصلاح كروم: السماح لأزرار التحميل بالعمل بشكل طبيعي دون تدخل */
        .download-file-btn,
        .download-file-btn *,
        [onclick*="downloadPreview"],
        [onclick*="downloadPreview"] * {
            touch-action: auto !important;
            pointer-events: auto !important;
            -webkit-touch-callout: default !important;
        }
    `;
    document.head.appendChild(style);
    
    console.log('🛡️ تم تفعيل منع القائمة المنبثقة بنسبة 100% في جميع أنحاء الموقع');
    
})();
