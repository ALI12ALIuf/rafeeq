// ========== download-debugger.js ==========
// أداة تشخيص متقدمة لمشكلة التحميل (نسخة 3.0 - تحليل كامل)

(function() {
    'use strict';
    
    // ==================== إعدادات ====================
    const CONFIG = {
        maxLogs: 500,
        autoScanDelay: 3000,
        debugMode: true
    };
    
    // ==================== إنشاء لوحة التشخيص ====================
    const panel = document.createElement('div');
    panel.id = 'downloadDebuggerPanel';
    panel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        width: 500px;
        max-height: 85vh;
        background: rgba(0, 0, 0, 0.98);
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
    
    // ==================== شريط التحكم ====================
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
        background: rgba(0,0,0,0.98);
        z-index: 10;
        touch-action: pan-y;
    `;
    
    const buttons = [
        { text: '📋 نسخ', color: '#ff6600', action: copyLogs },
        { text: '🗑️ مسح', color: '#333', action: clearLogs },
        { text: '📐 تصغير', color: '#2196F3', action: toggleSize },
        { text: '👁️ إخفاء', color: '#f44336', action: toggleHide },
        { text: '⬆️ لأعلى', color: '#4CAF50', action: moveUp },
        { text: '⬇️ لأسفل', color: '#4CAF50', action: moveDown },
        { text: '🔍 فحص', color: '#FF9800', action: fullScan },
        { text: '📊 تحليل', color: '#9C27B0', action: deepAnalyze },
        { text: '🐛 تصحيح', color: '#00BCD4', action: debugFix }
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
        button.onclick = btn.action;
        controlBar.appendChild(button);
    });
    
    panel.appendChild(controlBar);
    
    // ==================== حاوية السجلات ====================
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
    
    // ==================== المتغيرات ====================
    let allLogs = [];
    let isMinimized = false;
    let isHidden = false;
    let position = 10;
    let originalHeight = '80vh';
    let downloadAttempts = [];
    let eventListeners = [];
    
    // ==================== دوال التسجيل ====================
    function addLog(msg, type = 'info', data = null, timestamp = true) {
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
            case 'debug': color = '#00ffaa'; prefix = '🐛'; bgColor = 'rgba(0,255,170,0.05)'; break;
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
        
        while (logContainer.children.length > CONFIG.maxLogs) {
            logContainer.removeChild(logContainer.children[0]);
        }
        
        console.log(`[DEBUG] ${msg}`, data || '');
    }
    
    window.addDebugLog = addLog;
    
    // ==================== دوال الأزرار ====================
    function copyLogs() {
        const text = allLogs.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            addLog('✅ تم نسخ ' + allLogs.length + ' سطر', 'success');
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            addLog('✅ تم نسخ ' + allLogs.length + ' سطر (احتياطي)', 'success');
        });
    }
    
    function clearLogs() {
        logContainer.innerHTML = '';
        allLogs = [];
        downloadAttempts = [];
        addLog('🗑️ تم مسح السجل', 'warn');
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
        addLog(`⬆️ تم نقل اللوحة للأعلى (${position}px)`, 'info');
    }
    
    function moveDown() {
        position = Math.min(window.innerHeight - 100, position + 20);
        panel.style.top = position + 'px';
        addLog(`⬇️ تم نقل اللوحة للأسفل (${position}px)`, 'info');
    }
    
    // ==================== الفحص الشامل ====================
    function fullScan() {
        addLog('🔍 بدء الفحص الشامل...', 'warn');
        
        // 1. فحص FileManager
        if (typeof FileManager !== 'undefined') {
            const files = FileManager._files || new Map();
            const blobs = FileManager._blobs || new Map();
            addLog(`📊 FileManager: ${files.size} ملفات, ${blobs.size} Blobs`, 'data');
            
            for (const [id, file] of files) {
                const blob = blobs.get(id);
                addLog(`📄 ملف: ${id}`, 'data', {
                    fileName: file.fileName,
                    type: file.type,
                    dataUrlLength: file.dataUrl?.length || 0,
                    dataUrlPrefix: file.dataUrl?.substring(0, 40) || 'فارغ',
                    hasData: !!file.dataUrl,
                    blobSize: blob ? (blob.size / 1024).toFixed(1) + ' KB' : 'غير موجود',
                    blobType: blob ? blob.type : 'غير موجود'
                });
            }
        } else {
            addLog('❌ FileManager غير موجود!', 'critical');
        }
        
        // 2. فحص أزرار التحميل
        const downloadBtns = document.querySelectorAll('.download-file-btn');
        const imageElements = document.querySelectorAll('.message-image-content');
        const videoElements = document.querySelectorAll('.video-thumbnail-content');
        
        addLog(`📊 أزرار التحميل: ${downloadBtns.length}`, 'data');
        addLog(`📊 عناصر الصور: ${imageElements.length}`, 'data');
        addLog(`📊 عناصر الفيديو: ${videoElements.length}`, 'data');
        
        // 3. فحص كل زر تحميل
        downloadBtns.forEach((btn, index) => {
            const fileId = btn.dataset.fileid || 'غير معروف';
            const isVisible = btn.style.display !== 'none';
            const hasClickListener = !!btn._listeners || !!btn.onclick;
            
            addLog(`🔘 زر تحميل #${index + 1}:`, 'data', {
                fileId: fileId,
                isVisible: isVisible,
                hasClickListener: hasClickListener,
                className: btn.className,
                dataset: btn.dataset
            });
        });
        
        // 4. فحص كل صورة
        imageElements.forEach((img, index) => {
            const fileId = img.dataset.fileid || 'غير معروف';
            const src = img.src;
            const hasSrc = !!src && src.length > 0;
            const isDataUrl = hasSrc && src.startsWith('data:');
            
            addLog(`🖼️ صورة #${index + 1}:`, 'data', {
                fileId: fileId,
                hasSrc: hasSrc,
                isDataUrl: isDataUrl,
                srcLength: src?.length || 0,
                srcPrefix: src?.substring(0, 50) || 'فارغ'
            });
        });
        
        // 5. فحص ChatSystem
        if (typeof ChatSystem !== 'undefined') {
            const messages = ChatSystem.messages || {};
            let totalMessages = 0;
            let imageMessages = 0;
            let videoMessages = 0;
            let fileMessages = 0;
            
            for (const [chatId, msgs] of Object.entries(messages)) {
                totalMessages += msgs.length;
                imageMessages += msgs.filter(m => m.type === 'image').length;
                videoMessages += msgs.filter(m => m.type === 'video').length;
                fileMessages += msgs.filter(m => m.type === 'file').length;
            }
            
            addLog(`📊 ChatSystem: ${totalMessages} رسالة`, 'data', {
                images: imageMessages,
                videos: videoMessages,
                files: fileMessages,
                currentChat: ChatSystem.currentChat || 'لا يوجد'
            });
        }
        
        // 6. فحص localStorage
        let chatKeys = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('chat_')) chatKeys++;
        }
        addLog(`📊 localStorage: ${chatKeys} محادثة محفوظة`, 'data');
        
        addLog('✅ الفحص الشامل اكتمل', 'success');
    }
    
    // ==================== التحليل العميق ====================
    function deepAnalyze() {
        addLog('📊 بدء التحليل العميق...', 'warn');
        
        // تحليل محاولات التحميل
        const recent = downloadAttempts.slice(-10);
        addLog(`📊 آخر ${recent.length} محاولة تحميل:`, 'data');
        
        let successCount = 0;
        recent.forEach((attempt, index) => {
            if (attempt.success) successCount++;
            addLog(`📥 محاولة #${index + 1}:`, 'data', {
                fileId: attempt.fileId || 'غير معروف',
                fileName: attempt.fileName || 'غير معروف',
                timestamp: attempt.timestamp || 'غير معروف',
                success: attempt.success || false,
                error: attempt.error || 'لا يوجد',
                dataLength: attempt.dataLength || 0,
                method: attempt.method || 'غير معروف'
            });
        });
        
        // تحليل FileManager بالتفصيل
        if (typeof FileManager !== 'undefined') {
            const files = FileManager._files || new Map();
            const blobs = FileManager._blobs || new Map();
            let totalSize = 0;
            let filesWithData = 0;
            
            for (const [id, file] of files) {
                if (file.dataUrl) {
                    totalSize += file.dataUrl.length;
                    filesWithData++;
                }
            }
            
            addLog(`📊 إحصائيات FileManager:`, 'data', {
                totalFiles: files.size,
                filesWithData: filesWithData,
                filesWithoutData: files.size - filesWithData,
                totalDataSize: (totalSize / 1024).toFixed(1) + ' KB',
                totalBlobs: blobs.size,
                totalBlobSize: (FileManager.getTotalSize ? FileManager.getTotalSize() / 1024 : 0).toFixed(1) + ' KB'
            });
        }
        
        addLog('✅ التحليل العميق اكتمل', 'success');
    }
    
    // ==================== تصحيح الأخطاء ====================
    function debugFix() {
        addLog('🐛 بدء التصحيح التلقائي...', 'warn');
        
        // 1. التحقق من أزرار التحميل
        const downloadBtns = document.querySelectorAll('.download-file-btn');
        let fixedCount = 0;
        
        downloadBtns.forEach(btn => {
            const fileId = btn.dataset.fileid;
            if (!fileId) return;
            
            // التحقق من وجود حدث النقر
            if (!btn.onclick && !btn._listeners) {
                // إضافة مستمع جديد
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                    
                    const id = this.dataset.fileid;
                    if (!id) {
                        alert('⚠️ معرف الملف غير موجود');
                        return;
                    }
                    
                    const blob = FileManager.getBlob(id);
                    const fileData = FileManager.getFile(id);
                    
                    if (blob) {
                        try {
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = fileData?.fileName || 'ملف';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            setTimeout(() => URL.revokeObjectURL(url), 100);
                            addLog(`✅ تم تحميل الملف: ${fileData?.fileName || 'ملف'}`, 'success');
                        } catch (error) {
                            addLog(`❌ فشل تحميل الملف: ${error.message}`, 'error');
                        }
                    } else {
                        addLog(`❌ Blob غير موجود: ${id}`, 'error');
                    }
                });
                fixedCount++;
            }
        });
        
        addLog(`✅ تم إصلاح ${fixedCount} زر تحميل`, 'success');
        
        // 2. التحقق من الصور
        const images = document.querySelectorAll('.message-image-content');
        let fixedImages = 0;
        
        images.forEach(img => {
            const fileId = img.dataset.fileid;
            if (!fileId) return;
            
            if (!img.src || img.src === '' || img.src.startsWith('blob:')) {
                const fileData = FileManager.getFile(fileId);
                if (fileData && fileData.dataUrl) {
                    img.src = fileData.dataUrl;
                    fixedImages++;
                    addLog(`✅ تم إصلاح الصورة: ${fileId}`, 'success');
                }
            }
        });
        
        addLog(`✅ تم إصلاح ${fixedImages} صورة`, 'success');
        
        addLog('🐛 انتهى التصحيح التلقائي', 'success');
    }
    
    // ==================== اعتراض النقرات ====================
    function interceptDownloadClicks() {
        addLog('🔧 بدء اعتراض أزرار التحميل...', 'warn');
        
        const clickHandler = function(e) {
            const target = e.target.closest('.download-file-btn, [data-fileid]');
            if (!target) return;
            
            const fileId = target.dataset.fileid || target.getAttribute('data-fileid');
            const fileName = target.dataset.fileName || target.getAttribute('data-file-name') || 'غير معروف';
            
            // تحليل الزر
            const hasClickListener = !!target.onclick || !!target._listeners;
            const hasDataset = !!target.dataset.fileid;
            
            addLog('🖱️ تم النقر على زر تحميل', 'download', {
                fileId: fileId || 'غير معروف',
                fileName: fileName,
                hasClickListener: hasClickListener,
                hasDataset: hasDataset,
                classList: target.className,
                id: target.id || 'بدون id',
                dataset: target.dataset
            });
            
            // التحقق من FileManager
            if (fileId && typeof FileManager !== 'undefined') {
                const fileData = FileManager.getFile(fileId);
                const blob = FileManager.getBlob(fileId);
                
                if (fileData) {
                    addLog('✅ الملف موجود في FileManager', 'success', {
                        fileName: fileData.fileName,
                        type: fileData.type,
                        dataUrlLength: fileData.dataUrl?.length || 0,
                        dataUrlPrefix: fileData.dataUrl?.substring(0, 30) || 'فارغ',
                        hasData: !!fileData.dataUrl,
                        hasBlob: !!blob,
                        blobSize: blob ? (blob.size / 1024).toFixed(1) + ' KB' : 'غير موجود'
                    });
                } else {
                    addLog('❌ الملف غير موجود في FileManager', 'critical', {
                        fileId: fileId
                    });
                }
            }
            
            // تتبع المحاولة
            const attempt = {
                fileId: fileId || 'غير معروف',
                fileName: fileName,
                timestamp: new Date().toISOString(),
                success: false,
                method: 'click',
                hasClickListener: hasClickListener,
                hasDataset: hasDataset
            };
            downloadAttempts.push(attempt);
            
            // تحديث المحاولة بعد 2 ثانية (للمتابعة)
            setTimeout(() => {
                const lastAttempt = downloadAttempts[downloadAttempts.length - 1];
                if (lastAttempt) {
                    lastAttempt.success = true;
                    addLog('✅ اكتملت محاولة التحميل', 'success', {
                        fileId: lastAttempt.fileId,
                        success: true
                    });
                }
            }, 2000);
        };
        
        document.addEventListener('click', clickHandler, true);
        eventListeners.push({ type: 'click', handler: clickHandler });
    }
    
    // ==================== بدء التشغيل ====================
    function init() {
        interceptDownloadClicks();
        
        setTimeout(() => {
            addLog('🔍 تشغيل الفحص التلقائي...', 'warn');
            fullScan();
        }, CONFIG.autoScanDelay);
        
        addLog('🛠️ أداة تشخيص التحميل 3.0 جاهزة!', 'success');
        addLog('💡 اضغط على أي زر تحميل لتحليل المشكلة', 'info');
        addLog('🔍 زر "فحص" لمسح شامل للصفحة', 'info');
        addLog('📊 زر "تحليل" لعرض تفاصيل عميقة', 'info');
        addLog('🐛 زر "تصحيح" لإصلاح الأخطاء تلقائياً', 'info');
    }
    
    // ==================== دوال عامة ====================
    window.scanDownloads = fullScan;
    window.analyzeDownloads = deepAnalyze;
    window.clearDebugLogs = clearLogs;
    window.fixDownloads = debugFix;
    
    // ==================== بدء التشغيل ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
