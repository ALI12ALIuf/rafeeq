// ========== sw.js ==========
// Service Worker لإدارة الملفات المخزنة محلياً

const CACHE_NAME = 'rafeeq-files-v1';

self.addEventListener('install', (event) => {
    console.log('📦 Service Worker - جاري التثبيت...');
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('✅ تم فتح الـ Cache');
            return cache;
        })
    );
});

self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker - تم التفعيل');
    event.waitUntil(clients.claim());
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'STORE_FILE') {
        const { fileId, blob, fileName, mimeType } = event.data.payload;
        
        console.log(`📥 تخزين ملف في SW: ${fileName} (${fileId})`);
        
        const response = new Response(blob, {
            headers: {
                'Content-Type': mimeType || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
                'X-File-Name': encodeURIComponent(fileName),
                'X-File-Id': fileId
            }
        });
        
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.put(`/files/${fileId}`, response);
            }).then(() => {
                event.ports[0].postMessage({ 
                    status: 'stored', 
                    fileId: fileId,
                    url: `/files/${fileId}`
                });
                console.log(`✅ تم تخزين الملف بنجاح: ${fileId}`);
            }).catch((error) => {
                console.error('❌ فشل تخزين الملف:', error);
                event.ports[0].postMessage({ 
                    status: 'error', 
                    error: error.message 
                });
            })
        );
    }
    
    if (event.data && event.data.type === 'DELETE_FILE') {
        const { fileId } = event.data.payload;
        
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.delete(`/files/${fileId}`);
            }).then(() => {
                console.log(`🗑️ تم حذف الملف: ${fileId}`);
                event.ports[0].postMessage({ 
                    status: 'deleted', 
                    fileId: fileId 
                });
            })
        );
    }
    
    if (event.data && event.data.type === 'CLEAR_ALL_FILES') {
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.keys().then((keys) => {
                    return Promise.all(
                        keys.filter((key) => key.url.startsWith('/files/'))
                            .map((key) => cache.delete(key))
                    );
                });
            }).then(() => {
                console.log('🗑️ تم حذف جميع الملفات');
                event.ports[0].postMessage({ status: 'cleared' });
            })
        );
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    if (url.pathname.startsWith('/files/')) {
        const fileId = url.pathname.split('/files/')[1];
        
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(`/files/${fileId}`).then((response) => {
                    if (response) {
                        console.log(`📤 إرجاع الملف من SW: ${fileId}`);
                        
                        const headers = new Headers(response.headers);
                        headers.set('Access-Control-Allow-Origin', '*');
                        headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
                        
                        return new Response(response.body, {
                            status: 200,
                            statusText: 'OK',
                            headers: headers
                        });
                    } else {
                        console.warn(`⚠️ الملف غير موجود في SW: ${fileId}`);
                        return new Response('File not found', { 
                            status: 404,
                            headers: { 'Content-Type': 'text/plain' }
                        });
                    }
                });
            })
        );
    }
});

console.log('✅ Service Worker جاهز للعمل');
