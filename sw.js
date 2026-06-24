const CACHE_VERSION = 'v1.0';
const CACHES = {
    static: `static-cache-${CACHE_VERSION}`,
    images: `image-cache-${CACHE_VERSION}`,
    pages: `page-cache-${CACHE_VERSION}`,
    offline: `offline-cache-${CACHE_VERSION}`
};

// অফলাইন অবস্থায় ইউজারকে এই পেজটি দেখানো হবে (যদি তৈরি করা থাকে)
const OFFLINE_URL = '/offline.html';

// ১. Install Event: Service worker ইন্সটল হওয়ার সময় দরকারি ফাইল ক্যাশ করবে
self.addEventListener('install', (event) => {
    self.skipWaiting(); // নতুন ভার্সন এলে সাথে সাথে আপডেট হবে
    event.waitUntil(
        caches.open(CACHES.offline).then((cache) => {
            return cache.addAll([
                // এখানে আপনার ওয়েবসাইটের বেসিক কিছু ফাইলের লিংক দিন
                '/',
                '/index.html',
                OFFLINE_URL
            ]).catch((error) => console.warn('Offline assets cache failed:', error));
        })
    );
});

// ২. Activate Event: পুরোনো ক্যাশ মুছে ফেলে মেমোরি ক্লিয়ার করবে
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // বর্তমান ভার্সনের ক্যাশ ছাড়া বাকি সব ডিলিট করবে
                    if (!Object.values(CACHES).includes(cacheName)) {
                        console.log(`Deleting old cache: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim(); // পেজ রিলোড ছাড়াই নতুন সার্ভিস ওয়ার্কার অ্যাক্টিভ করবে
});

// ৩. Fetch Event: সব ধরনের নেটওয়ার্ক রিকোয়েস্ট হ্যান্ডল করবে
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // A. Image Caching (Cache First Strategy)
    // ইমেজ প্রথমে ক্যাশ থেকে খুঁজবে, না পেলে নেটওয়ার্ক থেকে আনবে এবং ক্যাশে সেভ করবে।
    if (request.destination === 'image') {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                return cachedResponse || fetch(request).then((networkResponse) => {
                    return caches.open(CACHES.images).then((cache) => {
                        cache.put(request, networkResponse.clone());
                        return networkResponse;
                    });
                }).catch(() => {
                    // ইমেজ লোড ফেইল হলে ডিফল্ট কোনো ইমেজ দেখাতে পারেন
                    // return caches.match('/default-image.png');
                });
            })
        );
        return;
    }

    // B. HTML / Page Browsing (Network First Strategy)
    // সবসময় লেটেস্ট পেজ দেখানোর জন্য আগে নেটওয়ার্কে খুঁজবে, ফেইল হলে ক্যাশ দেখাবে।
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).then((networkResponse) => {
                return caches.open(CACHES.pages).then((cache) => {
                    cache.put(request, networkResponse.clone());
                    return networkResponse;
                });
            }).catch(() => {
                return caches.match(request).then((cachedResponse) => {
                    return cachedResponse || caches.match(OFFLINE_URL); // অফলাইন পেজ দেখাবে
                });
            })
        );
        return;
    }

    // C. Static Assets (CSS, JS, Fonts) (Stale-While-Revalidate Strategy)
    // সাথে সাথে ক্যাশ থেকে লোড হবে, কিন্তু ব্যাকগ্রাউন্ডে নেটওয়ার্ক থেকে লেটেস্ট ফাইল এনে ক্যাশ আপডেট করবে।
    if (request.destination === 'style' || request.destination === 'script' || request.destination === 'font') {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                const networkFetch = fetch(request).then((networkResponse) => {
                    caches.open(CACHES.static).then((cache) => {
                        cache.put(request, networkResponse.clone());
                    });
                    return networkResponse;
                });
                return cachedResponse || networkFetch;
            })
        );
        return;
    }
});