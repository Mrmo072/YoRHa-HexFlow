import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useInstructionData } from '../useInstructionData';
import { api } from '../../api';

// Mock API
vi.mock('../../api', () => ({
    api: {
        getInstructions: vi.fn(),
        getOperatorTemplates: vi.fn(),
        createInstruction: vi.fn(),
        updateInstruction: vi.fn(),
        deleteInstruction: vi.fn()
    }
}));

describe('useInstructionData', () => {
    const mockInstructions = [
        { id: 'inst-1', device_code: 'DEV-001', code: 'CMD-001', name: 'Test 1', type: 'STATIC', fields: [] },
        { id: 'inst-2', device_code: 'DEV-002', code: 'CMD-002', name: 'Test 2', type: 'STATIC', fields: [] }
    ];
    const mockTemplates = [
        { op_code: 'HEX_RAW', label: 'Hex' }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        api.getInstructions.mockResolvedValue(mockInstructions);
        api.getOperatorTemplates.mockResolvedValue(mockTemplates);
    });

    it('should load initial data on mount', async () => {
        const { result } = renderHook(() => useInstructionData());

        // Initial state
        expect(result.current.isLoading).toBe(true);

        // Wait for async load
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        // Verify data
        expect(result.current.instructions).toHaveLength(2);
        expect(result.current.operatorTemplates).toHaveProperty('HEX_RAW');
        expect(result.current.activeInstructionId).toBe('inst-1'); // Default to first
    });

    it('should handle API failure gracefully', async () => {
        api.getInstructions.mockRejectedValue(new Error('Network Error'));
        const { result } = renderHook(() => useInstructionData());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.statusMsg).toContain('离线模式');
    });

    it('should keep instructions available when operator templates fail to load', async () => {
        api.getOperatorTemplates.mockRejectedValue(new Error('Template Error'));

        const { result } = renderHook(() => useInstructionData());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
            expect(result.current.isOperatorTemplatesLoading).toBe(false);
        });

        expect(result.current.instructions).toHaveLength(2);
        expect(result.current.activeInstructionId).toBe('inst-1');
        expect(result.current.operatorTemplates).toEqual({});
        expect(result.current.operatorTemplatesError).toBe('模块模板加载失败');
    });

    it('should add new instruction', async () => {
        const { result } = renderHook(() => useInstructionData());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        const newInst = { id: 'inst-3', name: 'New Inst' };
        api.createInstruction.mockResolvedValue(newInst);

        await act(async () => {
            await result.current.addInstruction();
        });

        expect(api.createInstruction).toHaveBeenCalled();
        expect(result.current.instructions).toHaveLength(3);
        expect(result.current.activeInstructionId).toBe('inst-3');
    });

    it('should delete instruction', async () => {
        const { result } = renderHook(() => useInstructionData());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        api.deleteInstruction.mockResolvedValue({});

        await act(async () => {
            await result.current.deleteInstruction('inst-1');
        });

        expect(api.deleteInstruction).toHaveBeenCalledWith('inst-1');
        expect(result.current.instructions).toHaveLength(1);
        expect(result.current.activeInstructionId).toBe('inst-2'); // Should switch to next available
    });

    it('should track unsaved changes on local update', async () => {
        const { result } = renderHook(() => useInstructionData());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.hasUnsavedChanges).toBe(false);

        // Simulate modification
        const updated = { ...mockInstructions[0], name: 'Modified' };
        act(() => {
            result.current.updateLocalInstruction(updated);
        });

        expect(result.current.instructions[0].name).toBe('Modified');
        expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it('should save changes successfully', async () => {
        const { result } = renderHook(() => useInstructionData());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        api.updateInstruction.mockResolvedValue({});

        await act(async () => {
            await result.current.saveChanges();
        });

        // Should call API with ID and Payload
        expect(api.updateInstruction).toHaveBeenCalledWith('inst-1', expect.objectContaining({
            device_code: 'DEV-001',
            code: 'CMD-001',
            name: 'Test 1',
            type: 'STATIC',
            fields: []
        }));
        expect(result.current.hasUnsavedChanges).toBe(false);
        expect(result.current.statusMsg).toBe('已保存');
    });

    it('should revert changes to original state (reload)', async () => {
        const { result } = renderHook(() => useInstructionData());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // Modify first
        const updated = { ...mockInstructions[0], name: 'Modified' };
        act(() => {
            result.current.updateLocalInstruction(updated);
        });
        expect(result.current.instructions[0].name).toBe('Modified');

        // Revert (Reload)
        await act(async () => {
            result.current.revertChanges();
        });

        expect(api.getInstructions).toHaveBeenCalledTimes(2); // Mounting + Revert
        // API mock returns original mockInstructions, so state should reset
        // Wait for async state update
        await waitFor(() => {
            const current = result.current.instructions.find(i => i.id === 'inst-1');
            expect(current.name).toBe('Test 1');
        });
    });

    it('should clear invalid active selection after filtering reload', async () => {
        const { result } = renderHook(() => useInstructionData());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        act(() => {
            result.current.setActiveInstructionId('inst-2');
        });

        api.getInstructions.mockResolvedValueOnce([{ id: 'inst-1', device_code: 'DEV-001', code: 'CMD-001', name: 'Test 1', type: 'STATIC', fields: [] }]);

        await act(async () => {
            await result.current.loadInstructions('inst-1');
        });

        expect(result.current.activeInstructionId).toBe('inst-1');
    });
});
