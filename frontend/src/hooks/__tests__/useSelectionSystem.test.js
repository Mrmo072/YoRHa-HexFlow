import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelectionSystem } from '../useSelectionSystem';

describe('useSelectionSystem', () => {
    it('should manage selectedId state', () => {
        const { result } = renderHook(() => useSelectionSystem());
        expect(result.current.selectedId).toBeNull();

        act(() => {
            result.current.setSelectedId('block-1');
        });
        expect(result.current.selectedId).toBe('block-1');
    });

    it('should handle picking mode mechanics', () => {
        const { result } = renderHook(() => useSelectionSystem());

        // Enter Picking Mode
        act(() => {
            result.current.setPickingMode({
                isActive: true,
                currentRefs: ['ref-1'],
                onUpdateRefs: vi.fn()
            });
        });

        expect(result.current.pickingMode.isActive).toBe(true);

        // Toggle Ref (Select)
        act(() => {
            result.current.handlePickBlock('ref-2');
        });
        expect(result.current.pickingMode.currentRefs).toContain('ref-2');

        // Toggle Ref (Deselect)
        act(() => {
            result.current.handlePickBlock('ref-1');
        });
        expect(result.current.pickingMode.currentRefs).not.toContain('ref-1');
    });

    it('should cancel selection on ESC key', () => {
        const { result } = renderHook(() => useSelectionSystem());

        act(() => {
            result.current.setSelectedId('block-1');
        });

        // Simulate ESC
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });

        expect(result.current.selectedId).toBeNull();
    });

    it('should cancel picking mode on ESC key', () => {
        const { result } = renderHook(() => useSelectionSystem());

        act(() => {
            result.current.setPickingMode({ isActive: true });
        });

        // Simulate ESC
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });

        expect(result.current.pickingMode.isActive).toBe(false);
    });
});
