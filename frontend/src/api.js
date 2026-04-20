const API_BASE = 'http://localhost:8000';

const handleResponse = async (response) => {
    const data = await response.json();
    if (!response.ok) {
        const error = new Error(data.detail || 'API request failed');
        error.response = {
            status: response.status,
            data: data
        };
        throw error;
    }
    return data;
};

export const api = {
    // Protocols
    getProtocols: async () => {
        const response = await fetch(`${API_BASE}/protocols/`);
        return handleResponse(response);
    },

    createProtocol: async (data) => {
        const response = await fetch(`${API_BASE}/protocols/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return handleResponse(response);
    },

    updateProtocol: async (id, data) => {
        const response = await fetch(`${API_BASE}/protocols/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return handleResponse(response);
    },

    deleteProtocol: async (id) => {
        const response = await fetch(`${API_BASE}/protocols/${id}`, {
            method: 'DELETE'
        });
        return handleResponse(response);
    },

    // Instructions
    getInstructions: async (search = '') => {
        const response = await fetch(`${API_BASE}/instructions/?search=${encodeURIComponent(search)}`);
        return handleResponse(response);
    },

    getInstruction: async (id) => {
        const response = await fetch(`${API_BASE}/instructions/${id}`);
        return handleResponse(response);
    },

    createInstruction: async (data) => {
        const response = await fetch(`${API_BASE}/instructions/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return handleResponse(response);
    },

    updateInstruction: async (id, data) => {
        const response = await fetch(`${API_BASE}/instructions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return handleResponse(response);
    },

    deleteInstruction: async (id) => {
        const response = await fetch(`${API_BASE}/instructions/${id}`, {
            method: 'DELETE'
        });
        return handleResponse(response);
    },

    // Operators
    getOperatorTemplates: async () => {
        const response = await fetch(`${API_BASE}/operator_templates/`);
        return handleResponse(response);
    }
};
