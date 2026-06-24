// ========== download-debugger.js ==========
// أداة تشخيص متقدمة لمشكلة التحميل

(function() {
    'use strict';
    
    // ✅ إنشاء لوحة التشخيص
    const debugPanel = document.createElement('div');
    debugPanel.id = 'downloadDebugPanel';
    debugPanel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        width: 420px;
        max-height: 80vh;
        background: rgba(0, 0, 0, 0.95);
        color: #00ff00;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        padding: 12px;
        border-radius: 10px;
        border: 2px solid #ff6600;
        box-shadow: 0 0 30px rgba(255, 102, 0, 0.3);
        z-index: 999999;
        overflow-y: auto;
        direction: ltr;
        text-align: left;
        transition: all 0.3s ease;
        resize: both;
        min-width: 300px;
    `;
    
    // ✅ شريط التحكم
    const controlBar = document.createElement('div');
    controlBar.style.cssText = `
        display: flex;
        gap: 6px;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid #ff6600;
        flex-wrap: wrap;
        position: sticky;
        top: 0;
        background: rgba(0,0,0,0.95);
        z-index: 10;
    `;
    
    // ✅ أزرار التحكم
    const buttons = [
        { text: '📋 نسخ', color: '#ff6600', action: copyLogs },
        { text: '🗑️ مسح', color: '#333', action: clearLogs },
        { text: '📐 تصغير', color: '#2196F3', action: toggleSize },
        { text: '👁️ إخفاء', color: '#f44336', action: toggleHide },
        { text: '⬆️ لأعلى', color: '#4CAF50', action: moveUp },
        { text: '⬇️ لأسفل', color: '#4CAF50', action: moveDown },
        { text: '📊 تحليل', color: '#9C27B0', action: analyzeDownloads },
        { text: '🔍 فحص', color: '#FF9800', action: scanAllButtons }
    ];
    
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        button.style.cssText = `
            background: ${btn.color};
            border: none;
            color: white;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 10px;
            cursor: pointer;
            font-family: inherit;
            transition: all 0.2s;
        `;
        button.onmouseover = () => { button.style.opacity = '0.8'; };
        button.onmouseout = () => { button.style.opacity = '1'; };
        button.onclick = btn.action;
        controlBar.appendChild(button);
    });
    
    debugPanel.appendChild(controlBar);
    
    // ✅ حاوية السجلات
    const logContainer = document.createElement('div');
    logContainer.id = 'debugLogs';
    logContainer.style.cssText = `
        max-height: 400px;
        overflow-y: auto;
        font-size: 10px;
        line-height: 1.6;
    `;
    debugPanel.appendChild(logContainer);
    document.body.appendChild(debugPanel);
    
    // ✅ متغيرات الحالة
    let allLogs = [];
    let isMinimized = false;
    let isHidden = false;
    let position = 10;
    let originalHeight = '80vh';
    
    // ✅ دالة إضافة سجل
    window.addDebugLog = function(msg, type = 'info', data = null) {
        const line = document.createElement('div');
        const time = new Date().toLocaleTimeString();
        let color = '#cccccc';
        let prefix = 'ℹ️';
        
        switch(type) {
            case 'error': color = '#ff4444'; prefix = '❌'; break;
            case 'success': color = '#44ff44'; prefix = '✅'; break;
            case 'warn': color = '#ffaa44'; prefix = '⚠️'; break;
            case 'download': color = '#44aaff'; prefix = '📥'; break;
            case 'data': color = '#ff66ff'; prefix = '📊'; break;
            default: color = '#cccccc'; prefix = 'ℹ️';
        }
        
        let logMsg = `${time} ${prefix} ${msg}`;
        if (data) {
            logMsg += `\n📦 ${JSON.stringify(data, null, 2)}`;
        }
        
        line.textContent = logMsg;
        line.style.color = color;
        line.style.borderBottom = '1px solid #222';
        line.style.padding = '4px 0';
        line.style.whiteSpace = 'pre-wrap';
        line.style.wordBreak = 'break-all';
        line.style.fontSize = '10px';
        
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
        allLogs.push(logMsg);
        
        // ✅ الحفاظ على 200 سجل فقط
        while (logContainer.children.length > 200) {
            logContainer.removeChild(logContainer.children[0]);
        }
        
        // ✅ نسخ إلى Console أيضاً
        console.log(`[DEBUG] ${msg}`, data || '');
    };
    
    // ✅ دوال الأزرار
    function copyLogs() {
        const text = allLogs.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            addDebugLog('✅ تم نسخ ' + allLogs.length + ' سطر', 'success');
        }).catch(() => {
            // ✅ نسخ احتياطي
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            addDebugLog('✅ تم نسخ ' + allLogs.length + ' سطر (طريقة احتياطية)', 'success');
        });
    }
    
    function clearLogs() {
        logContainer.innerHTML = '';
        allLogs = [];
        addDebugLog('🗑️ تم مسح السجل', 'warn');
    }
    
    function toggleSize() {
        if (isMinimized) {
            debugPanel.style.maxHeight = originalHeight;
            debugPanel.style.minHeight = '100px';
            isMinimized = false;
        } else {
            originalHeight = debugPanel.style.maxHeight || '80vh';
            debugPanel.style.maxHeight = '40px';
            debugPanel.style.minHeight = '40px';
            isMinimized = true;
        }
    }
    
    function toggleHide() {
        if (isHidden) {
            debugPanel.style.display = 'block';
            isHidden = false;
        } else {
            debugPanel.style.display = 'none';
            isHidden = true;
        }
    }
    
    function moveUp() {
        position = Math.max(0, position - 20);
        debugPanel.style.top = position + 'px';
        addDebugLog(`⬆️ تم نقل اللوحة للأعلى (${position}px)`, 'info');
    }
    
    function moveDown() {
        position = Math.min(window.innerHeight - 100, position + 20);
        debugPanel.style.top = position + 'px';
        addDebugLog(`⬇️ تم نقل اللوحة للأسفل (${position}px)`, 'info');
    }
    
    // ✅ تحليل أزرار التحميل
    function analyzeDownloads() {
        addDebugLog('🔍 بدء تحليل أزرار التحميل...', 'warn');
        
        const downloadBtns = document.querySelectorAll('.download-file-btn, [data-file-id], .file-download-btn');
        addDebugLog(`📊 تم العثور على ${downloadBtns.length} زر تحميل`, 'data');
        
        downloadBtns.forEach((btn, index) => {
            const fileId = btn.dataset.fileId || btn.getAttribute('data-file-id') || 'غير معروف';
            const fileName = btn.dataset.fileName || btn.getAttribute('data-file-name') || 'غير معروف';
            const hasData = !!btn.dataset.fileData;
            const dataLength = btn.dataset.fileData?.length || 0;
            const hasClickListener = !!btn._listeners || !!btn.onclick;
            
            addDebugLog(`📌 زر #${index + 1}:`, 'data', {
                fileId: fileId,
                fileName: fileName,
                hasData: hasData,
                dataLength: dataLength,
                hasClickListener: hasClickListener,
                dataset: btn.dataset,
                id: btn.id || 'بدون id'
            });
        });
        
        // ✅ فحص FileManager
        if (typeof FileManager !== 'undefined') {
            const files = FileManager._files || new Map();
            addDebugLog(`📊 FileManager يحتوي على ${files.size} ملف`, 'data');
            for (const [id, file] of files) {
                addDebugLog(`📄 ملف في FileManager: ${id}`, 'data', {
                    fileName: file.fileName,
                    type: file.type,
                    dataLength: file.data?.length || 0,
                    hasData: !!file.data
                });
            }
        } else {
            addDebugLog('⚠️ FileManager غير موجود', 'warn');
        }
    }
    
    // ✅ فحص جميع الأزرار في الصفحة
    function scanAllButtons() {
        addDebugLog('🔍 فحص جميع أزرار التحميل في الصفحة...', 'warn');
        
        const allBtns = document.querySelectorAll('button, a, [role="button"], .download-file-btn');
        let downloadCount = 0;
        
        allBtns.forEach((btn, index) => {
            // ✅ البحث عن أزرار التحميل
            const isDownload = btn.classList.contains('download-file-btn') || 
                              btn.querySelector('.fa-download') || 
                              btn.getAttribute('data-file-id') ||
                              btn.getAttribute('onclick')?.includes('download');
            
            if (isDownload) {
                downloadCount++;
                const fileId = btn.dataset.fileId || btn.getAttribute('data-file-id') || 'غير معروف';
                const fileName = btn.dataset.fileName || btn.getAttribute('data-file-name') || 'غير معروف';
                const hasData = !!btn.dataset.fileData;
                const hasFullBase64 = !!btn.dataset.fullBase64;
                
                addDebugLog(`🔘 زر تحميل #${downloadCount}:`, 'data', {
                    fileId: fileId,
                    fileName: fileName,
                    hasData: hasData,
                    hasFullBase64: hasFullBase64,
                    classList: btn.className,
                    id: btn.id || 'بدون id',
                    dataset: btn.dataset
                });
            }
        });
        
        addDebugLog(`📊 تم العثور على ${downloadCount} زر تحميل`, 'success');
    }
    
    // ✅ اعتراض زر التحميل الأصلي وتحليل المشكلة
    function interceptDownloadClicks() {
        addDebugLog('🔧 بدء اعتراض أزرار التحميل...', 'warn');
        
        document.addEventListener('click', function(e) {
            const target = e.target.closest('.download-file-btn, [data-file-id], .file-download-btn');
            if (target) {
                addDebugLog('🖱️ تم النقر على زر تحميل', 'download', {
                    id: target.id || 'بدون id',
                    fileId: target.dataset.fileId || target.getAttribute('data-file-id'),
                    fileName: target.dataset.fileName || target.getAttribute('data-file-name'),
                    hasData: !!target.dataset.fileData,
                    dataLength: target.dataset.fileData?.length || 0,
                    dataPrefix: target.dataset.fileData?.substring(0, 50) || 'فارغ',
                    fullBase64: !!target.dataset.fullBase64,
                    fullBase64Length: target.dataset.fullBase64?.length || 0,
                    classList: target.className,
                    parentElement: target.parentElement?.tagName || 'غير معروف'
                });
                
                // ✅ التحقق من البيانات
                if (target.dataset.fileData) {
                    const data = target.dataset.fileData;
                    if (data.startsWith('data:')) {
                        addDebugLog('✅ البيانات موجودة وصالحة (تبدأ بـ data:)', 'success');
                    } else {
                        addDebugLog('⚠️ البيانات موجودة ولكن لا تبدأ بـ data:', 'warn', {
                            prefix: data.substring(0, 30)
                        });
                    }
                } else {
                    addDebugLog('❌ لا توجد بيانات في dataset.fileData', 'error');
                    
                    // ✅ محاولة البحث عن البيانات في أماكن أخرى
                    const fileId = target.dataset.fileId || target.getAttribute('data-file-id');
                    if (fileId && typeof FileManager !== 'undefined') {
                        const file = FileManager.getFile(fileId);
                        if (file) {
                            addDebugLog('✅ تم العثور على البيانات في FileManager', 'success', {
                                fileId: fileId,
                                fileName: file.fileName,
                                dataLength: file.data?.length || 0
                            });
                        } else {
                            addDebugLog('❌ لم يتم العثور على البيانات في FileManager', 'error');
                        }
                    }
                    
                    // ✅ البحث في msg.data
                    const msgElement = target.closest('.message');
                    if (msgElement) {
                        const msgId = msgElement.id?.replace('msg-', '');
                        if (msgId) {
                            addDebugLog(`🔍 البحث عن الرسالة: ${msgId}`, 'info');
                            // محاولة العثور على الرسالة في ChatSystem
                            if (typeof ChatSystem !== 'undefined' && ChatSystem.messages) {
                                for (const [chatId, messages] of Object.entries(ChatSystem.messages)) {
                                    const found = messages.find(m => m.id === msgId);
                                    if (found) {
                                        addDebugLog('✅ تم العثور على الرسالة في ChatSystem', 'success', {
                                            chatId: chatId,
                                            type: found.type,
                                            hasData: !!found.data,
                                            hasFullBase64: !!found._fullBase64,
                                            fileName: found.fileName
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }, true);
    }
    
    // ✅ تشغيل الاعتراض
    interceptDownloadClicks();
    
    // ✅ تشغيل الفحص التلقائي بعد 2 ثانية
    setTimeout(() => {
        addDebugLog('🔍 تشغيل الفحص التلقائي...', 'warn');
        scanAllButtons();
    }, 2000);
    
    // ✅ إضافة دالة للفحص اليدوي
    window.scanDownloads = scanAllButtons;
    window.analyzeDownloads = analyzeDownloads;
    
    addDebugLog('🛠️ أداة تشخيص التحميل جاهزة!', 'success');
    addDebugLog('💡 اضغط على أي زر تحميل لتحليل المشكلة', 'info');
    addDebugLog('📊 زر "تحليل" لعرض تفاصيل الأزرار', 'info');
    addDebugLog('🔍 زر "فحص" لمسح جميع الأزرار', 'info');
})();
