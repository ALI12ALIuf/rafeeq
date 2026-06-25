// ========== file-manager.js ==========
// نظام إدارة الملفات (يعمل في الذاكرة فقط - للخصوصية)

const FileManager = {
    _files: new Map(),
    _maxFiles: 50,
    
    // ✅ حفظ ملف
    saveFile(id, dataUrl, metadata) {
        if (!dataUrl || !dataUrl.startsWith('data:')) {
            console.error('❌ بيانات غير صالحة:', id);
            return false;
        }
        
        // إذا تجاوز العدد، نحذف أقدم ملف
        if (this._files.size >= this._maxFiles) {
            const oldestKey = this._files.keys().next().value;
            this._files.delete(oldestKey);
            console.log(`🗑️ تم حذف أقدم ملف: ${oldestKey}`);
        }
        
        this._files.set(id, {
            dataUrl: dataUrl,
            fileName: metadata.fileName || 'ملف',
            type: metadata.type || 'file',
            sender: metadata.sender || 'friend',
            time: new Date().toISOString()
        });
        
        console.log(`💾 تم حفظ الملف: ${id}`);
        return true;
    },
    
    // ✅ استرجاع ملف
    getFile(id) {
        const file = this._files.get(id);
        if (file) {
            return file;
        }
        console.warn(`⚠️ الملف غير موجود: ${id}`);
        return null;
    },
    
    // ✅ الحصول على dataUrl مباشرة
    getFileDataUrl(id) {
        const file = this._files.get(id);
        return file ? file.dataUrl : null;
    },
    
    // ✅ التحقق من وجود ملف
    hasFile(id) {
        return this._files.has(id);
    },
    
    // ✅ حذف ملف
    deleteFile(id) {
        return this._files.delete(id);
    },
    
    // ✅ حذف جميع الملفات
    clearAll() {
        const count = this._files.size;
        this._files.clear();
        console.log(`🗑️ تم حذف ${count} ملف من الذاكرة`);
        return count;
    }
};

window.FileManager = FileManager;
console.log('✅ FileManager جاهز (يعمل في الذاكرة فقط)');
