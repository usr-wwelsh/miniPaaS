const API_BASE = '';

const api = {
    async get(endpoint) {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            credentials: 'include'
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }
        return response.json();
    },

    async post(endpoint, data) {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }
        return response.json();
    },

    async put(endpoint, data) {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }
        return response.json();
    },

    async delete(endpoint) {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }
        return response.json();
    }
};

async function checkAuth() {
    try {
        const user = await api.get('/auth/user');
        if (!user.authenticated) {
            window.location.replace('/');
            return null;
        }
        return user;
    } catch (error) {
        window.location.replace('/');
        return null;
    }
}

async function logout() {
    await api.get('/auth/logout');
    window.location.replace('/');
}

if (window.location.pathname === '/dashboard' || window.location.pathname === '/index.html') {
    checkAuth().then(user => {
        if (user && user.user) {
            document.getElementById('username').textContent = user.user.username;
        }
    });
}
