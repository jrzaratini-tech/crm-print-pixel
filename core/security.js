(function () {
    'use strict';

    const blockedTags = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'STYLE', 'LINK', 'META']);
    const urlAttributes = new Set(['href', 'src', 'xlink:href', 'action', 'formaction']);

    function sanitizeHtml(html) {
        const template = document.createElement('template');
        template.innerHTML = String(html);

        template.content.querySelectorAll('*').forEach(element => {
            if (blockedTags.has(element.tagName)) {
                element.remove();
                return;
            }

            Array.from(element.attributes).forEach(attribute => {
                const name = attribute.name.toLowerCase();
                const value = attribute.value.trim();
                if (name.startsWith('on') || name === 'srcdoc') {
                    element.removeAttribute(attribute.name);
                    return;
                }
                if (urlAttributes.has(name) && /^(?:javascript|vbscript|data:text\/html)/i.test(value)) {
                    element.removeAttribute(attribute.name);
                }
            });
        });

        return template.innerHTML;
    }

    window.crmSanitizeHtml = sanitizeHtml;

    async function clearLegacyOfflineState() {
        if (!('serviceWorker' in navigator)) return;
        const registrations = await navigator.serviceWorker.getRegistrations();
        const hadController = Boolean(navigator.serviceWorker.controller);
        const legacyRegistrations = registrations.filter(registration => {
            try {
                const pathname = new URL(registration.scope).pathname;
                return !pathname.startsWith('/mobile/') && !pathname.startsWith('/colaborador/');
            } catch {
                return true;
            }
        });
        await Promise.all(legacyRegistrations.map(registration => registration.unregister()));
        if ('caches' in window) {
            await caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))));
        }
        if (hadController && !sessionStorage.getItem('crmLegacyWorkerCleared')) {
            sessionStorage.setItem('crmLegacyWorkerCleared', 'true');
            location.reload();
        }
    }

    window.crmSecurityReady = clearLegacyOfflineState().catch(error => {
        console.warn('Não foi possível limpar o cache offline legado:', error);
    });

    const nativeFetch = window.fetch.bind(window);
    window.fetch = (...args) => window.crmSecurityReady.then(() => nativeFetch(...args));
})();
