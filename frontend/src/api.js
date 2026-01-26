const API_BASE = 'http://localhost:8000';

export const api = {
    // Instructions
    getInstructions: async (search = '') => {
        const response = await fetch(`${API_BASE}/instructions/?search=${encodeURIComponent(search)}`);
        return response.json();
    },

    getInstruction: async (id) => {
        const response = await fetch(`${API_BASE}/instructions/${id}`);
        return response.json();
    },

    createInstruction: async (data) => {
        const response = await fetch(`${API_BASE}/instructions/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    },

    updateInstruction: async (id, data) => {
        const response = await fetch(`${API_BASE}/instructions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    },

    deleteInstruction: async (id) => {
        const response = await fetch(`${API_BASE}/instructions/${id}`, {
            method: 'DELETE'
        });
        return response.json();
    },

    // Operators
    getOperatorTemplates: async () => {
        const response = await fetch(`${API_BASE}/operator_templates/`);
        return response.json();
    }
};
