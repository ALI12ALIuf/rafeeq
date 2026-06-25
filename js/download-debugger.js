// ========== download-debugger.js ==========
// أداة تشخيص متقدمة لمشكلة التحميل (نسخة 2.0)

(function() {
    'use strict';
    
    // ✅ إنشاء لوحة التشخيص الرئيسية
    const panel = document.createElement('div');
    panel.id = 'downloadDebuggerPanel';
    panel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        width: 450px;
        max-height: 80vh;
        background: rgba(0, 0, 0, 0.97);
        color: #00ff00;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        padding: 12px;
        border-radius: 12px;
        border: 2px solid #ff6600;
        box-shadow: 0 0 40px rgba(255, 102, 0, 0.4);
        z-index: 999999;
        overflow-y: auto;
        direction: ltr;
        text-align: left;
        transition: all 0.3s ease;
        resize: both;
        min-width: 350px;
        touch-action: pan-y;
    `;
    
    // ✅ شريط التحكم العلوي
    const controlBar = document.createElement('div');
    controlBar.style.cssText = `
        display: flex;
        gap: 6px;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 2px solid #ff6600;
        flex-wrap: wrap;
        position: sticky;
        top: 0;
        background: rgba(0,0,0,0.97);
        z-index: 10;
        touch-action: pan-y;
    `;
    
    // ✅ أزرار التحكم (أكبر حجمًا لللمس)
    const buttons = [
        { text: '📋 نسخ', color: '#ff6600', action: copyLogs },
        { text: '🗑️ مسح', color: '#333', action: clearLogs },
        { text: '📐 تصغير', color: '#2196F3', action: toggleSize },
        { text: '👁️ إخفاء', color: '#f44336', action: toggleHide },
        { text: '⬆️ لأعلى', color: '#4CAF50', action: moveUp },
        { text: '⬇️ لأسفل', color: '#4CAF50', action: moveDown },
        { text: '🔍 فحص', color: '#FF9800', action: fullScan },
        { text: '📊 تحليل', color: '#9C27B0', action: deepAnalyze }
    ];
    
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        button.style.cssText = `
            background: ${btn.color};
            border: none;
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 11px;
            cursor: pointer;
            font-family: inherit;
            transition: all 0.2s;
            touch-action: manipulation;
            min-height: 32px;
            min-width: 50px;
        `;
        button.onmouseover = () => { button.style.opacity = '0.8'; };
        button.onmouseout = () => { button.style.opacity = '1'; };
        button.ontouchstart = () => { button.style.transform = 'scale(0.95)'; };
        button.ontouchend = () => { button.style.transform = 'scale(1)'; };
        button.onclick = btn.action;
        controlBar.appendChild(button);
    });
    
    panel.appendChild(controlBar);
    
    // ✅ حاوية السجلات مع دعم التمرير باللمس
    const logContainer = document.createElement('div');
    logContainer.id = 'debuggerLogs';
    logContainer.style.cssText = `
        max-height: 450px;
        overflow-y: auto;
        font-size: 10px;
        line-height: 1.8;
        touch-action: pan-y;
        -webkit-overflow-scrolling: touch;
        padding: 4px 0;
    `;
    panel.appendChild(logContainer);
    document.body.appendChild(panel);
    
    // ✅ متغيرات الحالة
    let allLogs = [];
    let isMinimized = false;
    let isHidden = false;
    let position = 10;
    let originalHeight = '80vh';
    let downloadAttempts = [];
    
    // ✅ دالة إضافة سجل مع تنسيق محسن
    window.addDebugLog = function(msg, type = 'info', data = null, timestamp = true) {
        const line = document.createElement('div');
        const time = new Date().toLocaleTimeString('ar-EG', { hour12: false });
        let color = '#cccccc';
        let prefix = 'ℹ️';
        let bgColor = 'transparent';
        
        switch(type) {
            case 'error': color = '#ff4444'; prefix = '❌'; bgColor = 'rgba(255,68,68,0.1)'; break;
            case 'success': color = '#44ff44'; prefix = '✅'; bgColor = 'rgba(68,255,68,0.05)'; break;
            case 'warn': color = '#ffaa44'; prefix = '⚠️'; bgColor = 'rgba(255,170,68,0.05)'; break;
            case 'download': color = '#44aaff'; prefix = '📥'; bgColor = 'rgba(68,170,255,0.05)'; break;
            case 'data': color = '#ff66ff'; prefix = '📊'; bgColor = 'rgba(255,102,255,0.05)'; break;
            case 'critical': color = '#ff0066'; prefix = '🔥'; bgColor = 'rgba(255,0,102,0.1)'; break;
            default: color = '#cccccc'; prefix = 'ℹ️';
        }
        
        let logMsg = (timestamp ? `${time} ` : '') + `${prefix} ${msg}`;
        if (data) {
            logMsg += `\n${JSON.stringify(data, null, 2)}`;
        }
        
        line.textContent = logMsg;
        line.style.color = color;
        line.style.backgroundColor = bgColor;
        line.style.borderBottom = '1px solid #222';
        line.style.padding = '4px 6px';
        line.style.whiteSpace = 'pre-wrap';
        line.style.wordBreak = 'break-all';
        line.style.fontSize = '10px';
        line.style.borderRadius = '3px';
        line.style.margin = '1px 0';
        
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
        allLogs.push(logMsg);
        
        // ✅ الحفاظ على 300 سجل فقط
        while (logContainer.children.length > 300) {
            logContainer.removeChild(logContainer.children[0]);
        }
        
        // ✅ نسخ إلى Console
        console.log(`[DEBUG] ${msg}`, data || '');
    };
    
    // ✅ دوال الأزرار
    function copyLogs() {
        const text = allLogs.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            addDebugLog('✅ تم نسخ ' + allLogs.length + ' سطر', 'success');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            addDebugLog('✅ تم نسخ ' + allLogs.length + ' سطر (احتياطي)', 'success');
        });
    }
    
    function clearLogs() {
        logContainer.innerHTML = '';
        allLogs = [];
        downloadAttempts = [];
        addDebugLog('🗑️ تم مسح السجل', 'warn');
    }
    
    function toggleSize() {
        if (isMinimized) {
            panel.style.maxHeight = originalHeight;
            panel.style.minHeight = '100px';
            isMinimized = false;
        } else {
            originalHeight = panel.style.maxHeight || '80vh';
            panel.style.maxHeight = '40px';
            panel.style.minHeight = '40px';
            isMinimized = true;
        }
    }
    
    function toggleHide() {
        if (isHidden) {
            panel.style.display = 'block';
            isHidden = false;
        } else {
            panel.style.display = 'none';
            isHidden = true;
        }
    }
    
    function moveUp() {
        position = Math.max(0, position - 20);
        panel.style.top = position + 'px';
        addDebugLog(`⬆️ تم نقل اللوحة للأعلى (${position}px)`, 'info');
    }
    
    function moveDown() {
        position = Math.min(window.innerHeight - 100, position + 20);
        panel.style.top = position + 'px';
        addDebugLog(`⬇️ تم نقل اللوحة للأسفل (${position}px)`, 'info');
    }
    
    // ✅ فحص شامل
    function fullScan() {
        addDebugLog('🔍 بدء الفحص الشامل...', 'warn');
        
        // 1. فحص FileManager
        if (typeof FileManager !== 'undefined') {
            const files = FileManager._files || new Map();
            addDebugLog(`📊 FileManager: ${files.size} ملفات`, 'data');
            for (const [id, file] of files) {
                addDebugLog(`📄 ملف: ${id}`, 'data', {
                    fileName: file.fileName,
                    type: file.type,
                    dataLength: file.dataUrl?.length || 0,
                    dataPrefix: file.dataUrl?.substring(0, 50) || 'فارغ',
                    hasData: !!file.dataUrl
                });
            }
        } else {
            addDebugLog('❌ FileManager غير موجود!', 'critical');
        }
        
        // 2. فحص أزرار التحميل
        const downloadBtns = document.querySelectorAll('.download-file-btn, [data-fileid]');
        addDebugLog(`📊 أزرار التحميل: ${downloadBtns.length}`, 'data');
        
        downloadBtns.forEach((btn, index) => {
            const fileId = btn.dataset.fileid || btn.getAttribute('data-fileid') || 'غير معروف';
            const parent = btn.closest('.message');
            const msgId = parent?.id?.replace('msg-', '') || 'غير معروف';
            
            addDebugLog(`🔘 زر #${index + 1}:`, 'data', {
                fileId: fileId,
                msgId: msgId,
                hasClickListener: !!btn._listeners || !!btn.onclick,
                isVisible: btn.style.display !== 'none',
                classList: btn.className,
                dataset: btn.dataset
            });
        });
        
        // 3. فحص ChatSystem
        if (typeof ChatSystem !== 'undefined') {
            const messages = ChatSystem.messages || {};
            let totalMessages = 0;
            let fileMessages = 0;
            for (const [chatId, msgs] of Object.entries(messages)) {
                totalMessages += msgs.length;
                fileMessages += msgs.filter(m => m.type === 'file' || m.type === 'image' || m.type === 'video').length;
            }
            addDebugLog(`📊 ChatSystem: ${totalMessages} رسالة (${fileMessages} وسائط)`, 'data');
        }
        
        addDebugLog('✅ الفحص الشامل اكتمل', 'success');
    }
    
    // ✅ تحليل عميق لعملية التحميل
    function deepAnalyze() {
        addDebugLog('📊 بدء التحليل العميق...', 'warn');
        
        // تحليل آخر 10 محاولات تحميل
        const recent = downloadAttempts.slice(-10);
        addDebugLog(`📊 آخر ${recent.length} محاولة تحميل:`, 'data');
        
        recent.forEach((attempt, index) => {
            addDebugLog(`📥 محاولة #${index + 1}:`, 'data', {
                fileId: attempt.fileId || 'غير معروف',
                fileName: attempt.fileName || 'غير معروف',
                timestamp: attempt.timestamp || 'غير معروف',
                success: attempt.success || false,
                error: attempt.error || 'لا يوجد',
                dataLength: attempt.dataLength || 0,
                method: attempt.method || 'غير معروف'
            });
        });
        
        // تحليل حالة FileManager
        if (typeof FileManager !== 'undefined') {
            const files = FileManager._files || new Map();
            let totalSize = 0;
            for (const [id, file] of files) {
                totalSize += file.dataUrl?.length || 0;
            }
            addDebugLog(`📊 حجم البيانات في FileManager: ${(totalSize / 1024).toFixed(1)} KB`, 'data');
        }
        
        addDebugLog('✅ التحليل العميق اكتمل', 'success');
    }
    
    // ✅ اعتراض وتحليل نقرات التحميل
    function interceptDownloadClicks() {
        addDebugLog('🔧 بدء اعتراض أزرار التحميل...', 'warn');
        
        document.addEventListener('click', function(e) {
            const target = e.target.closest('.download-file-btn, [data-fileid]');
            if (!target) return;
            
            const fileId = target.dataset.fileid || target.getAttribute('data-fileid');
            const fileName = target.dataset.fileName || target.getAttribute('data-file-name') || 'غير معروف';
            
            addDebugLog('🖱️ تم النقر على زر تحميل', 'download', {
                fileId: fileId || 'غير معروف',
                fileName: fileName,
                hasData: !!target.dataset.fileData,
                dataLength: target.dataset.fileData?.length || 0,
                dataPrefix: target.dataset.fileData?.substring(0, 30) || 'فارغ',
                hasFullBase64: !!target.dataset.fullBase64,
                classList: target.className,
                id: target.id || 'بدون id',
                dataset: target.dataset
            });
            
            // ✅ التحقق من FileManager
            if (fileId && typeof FileManager !== 'undefined') {
                const fileData = FileManager.getFile(fileId);
                if (fileData) {
                    addDebugLog('✅ تم العثور على الملف في FileManager', 'success', {
                        fileName: fileData.fileName,
                        type: fileData.type,
                        dataLength: fileData.dataUrl?.length || 0,
                        dataPrefix: fileData.dataUrl?.substring(0, 30) || 'فارغ'
                    });
                } else {
                    addDebugLog('❌ الملف غير موجود في FileManager', 'critical', {
                        fileId: fileId
                    });
                }
            }
            
            // ✅ تتبع محاولات التحميل
            downloadAttempts.push({
                fileId: fileId || 'غير معروف',
                fileName: fileName,
                timestamp: new Date().toISOString(),
                success: false,
                method: 'click'
            });
            
        }, true);
    }
    
    // ✅ تشغيل الاعتراض
    interceptDownloadClicks();
    
    // ✅ تنفيذ الفحص التلقائي بعد 3 ثواني
    setTimeout(() => {
        addDebugLog('🔍 تشغيل الفحص التلقائي...', 'warn');
        fullScan();
    }, 3000);
    
    // ✅ إضافة دوال للاستخدام اليدوي
    window.scanDownloads = fullScan;
    window.analyzeDownloads = deepAnalyze;
    window.clearDebugLogs = clearLogs;
    
    // ✅ رسالة الترحيب
    addDebugLog('🛠️ أداة تشخيص التحميل 2.0 جاهزة!', 'success');
    addDebugLog('💡 اضغط على أي زر تحميل لتحليل المشكلة', 'info');
    addDebugLog('🔍 زر "فحص" لمسح شامل للصفحة', 'info');
    addDebugLog('📊 زر "تحليل" لعرض تفاصيل عميقة', 'info');
    addDebugLog('📋 زر "نسخ" لنسخ جميع السجلات', 'info');
    
})();
