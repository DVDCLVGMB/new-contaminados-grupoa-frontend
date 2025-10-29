let CURRENT_BASE_URL = 'https://contaminados.akamai.meseguercr.com';

export const apiConfig = {
    setBaseUrl: (newUrl) => {
        if (newUrl && typeof newUrl === 'string' && newUrl.trim()) {
            const cleanUrl = newUrl.trim().replace(/\/+$/, '');
            
            // Validar formato básico de URL
            if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
                CURRENT_BASE_URL = cleanUrl;
                console.log('API Base URL actualizada:', CURRENT_BASE_URL);
                
                // Limpiar caché cuando cambia la URL
                if (typeof window !== 'undefined' && window._cache) {
                    window._cache.clear();
                }
                return true;
            } else {
                console.warn('URL debe comenzar con http:// o https://');
                return false;
            }
        }
        return false;
    },
    
    getBaseUrl: () => {
        // Intentar cargar desde almacenamiento si esta disponible
        if (typeof window !== 'undefined') {
            try {
                const storedUrl = localStorage.getItem('userUrl') || 
                                 sessionStorage.getItem('userUrl');
                if (storedUrl && storedUrl.trim()) {
                    const cleanUrl = storedUrl.trim().replace(/\/+$/, '');
                    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
                        CURRENT_BASE_URL = cleanUrl;
                    }
                }
            } catch (error) {
                console.warn('Error cargando stored URL:', error);
            }
        }
        return CURRENT_BASE_URL;
    }
};

// Hacer disponible globalmente
if (typeof window !== 'undefined') {
    window.gameAPIs = apiConfig;
}