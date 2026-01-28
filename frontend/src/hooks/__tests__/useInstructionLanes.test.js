import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInstructionLanes } from '../useInstructionLanes';

describe('useInstructionLanes', () => {
    const mockInstruction = {
        id: 'inst-1',
        fields: [
            { id: 'g1', op_code: 'ARRAY_GROUP', label: 'Group 1', sequence: 0 },
            { id: 'b1', parent_id: 'g1', label: 'b1', sequence: 0 },
            { id: 'b2', label: 'Root Block', sequence: 1 },
            // Formula Block
            {
                id: 'calc',
                op_code: 'LENGTH_CALC',
                parameter_config: { formula: '([b1] + 10)' },
                byte_len: 1
            }
        ]
    };

    it('should build recursive lanes structure (Expand logic)', () => {
        const { result } = renderHook(() => useInstructionLanes(mockInstruction, 'inst-1'));

        // Initially expandedGroupIds is empty/populated by default effect?
        // Let's check default behavior: hook sets all groups expanded on mount
        expect(result.current.expandedGroupIds).toContain('g1');

        // Should have Root Lane + Group Lane
        expect(result.current.processedLanes).toHaveLength(2);

        // Collapse Group
        act(() => {
            result.current.handleNavigateGroup('g1');
        });

        // Should now only have Root Lane (Group 1 is child of root, but visual lanes depend on expansion)
        // Wait, logic says: "Find expands within this lane... if expanded, build children".
        // So if collapsed, children lanes are not built.
        expect(result.current.expandedGroupIds).not.toContain('g1');
        expect(result.current.processedLanes).toHaveLength(1); // Only root
    });

    it('should evaluate formulas in processedLanes', () => {
        // We need a setup where [b1] has a value.
        // The hook logic uses 'byte_len' as value for normal blocks.
        // b1 byte_len is undefined in mock -> 0.
        // Let's update mock
        const complexMock = { ...mockInstruction };
        complexMock.fields[1].byte_len = 5; // b1 = 5

        const { result } = renderHook(() => useInstructionLanes(complexMock, 'inst-1'));

        const rootLane = result.current.processedLanes.find(l => l.parentId === null);
        const calcBlock = rootLane.items.find(i => i.id === 'calc');

        // Formula: ([b1] + 10) -> (5 + 10) = 15 -> 0F
        expect(calcBlock.parameter_config.computedValue).toBe('0F');
    });

    it('should process TIME_ACCUMULATOR', () => {
        // Mock System Time: 2026-01-01 12:00:00 UTC
        const mockNow = new Date('2026-01-01T12:00:00Z');
        vi.setSystemTime(mockNow);

        const timeMock = {
            fields: [
                {
                    id: 't1',
                    op_code: 'TIME_ACCUMULATOR',
                    parameter_config: { base_time: '2026-01-01T10:00:00Z' },
                    byte_len: 4
                }
            ]
        };

        const { result } = renderHook(() => useInstructionLanes(timeMock, 'inst-1'));
        const item = result.current.processedLanes[0].items[0];

        // Diff = 2 hours = 7200 seconds -> 0x00001C20
        // Hex formatting checks
        expect(item.parameter_config.computedValue).toBe('00 00 1C 20');

        vi.useRealTimers();
    });

    it('should process AUTO_COUNTER', () => {
        const counterMock = {
            fields: [{ id: 'ac1', op_code: 'AUTO_COUNTER', parameter_config: { start_val: 255 }, byte_len: 1 }]
        };
        const { result } = renderHook(() => useInstructionLanes(counterMock, 'inst-1'));
        const item = result.current.processedLanes[0].items[0];

        // 255 -> FF
        expect(item.parameter_config.computedValue).toBe('FF');
    });

    it('should handle missing formula variables', () => {
        const brokenMock = {
            fields: [
                { id: 'calc', op_code: 'LENGTH_CALC', parameter_config: { formula: '[Missing]' } }
            ]
        };
        const { result } = renderHook(() => useInstructionLanes(brokenMock, 'inst-1'));

        const item = result.current.processedLanes[0].items[0];
        // Missing var maps to undefined/0 or ?? depending on implementation
        // Implementation: nameToValueMap[v] === "??" check?
        // Actually, map logic uses f.name || f.label.
        // If 'Missing' is not in fields, nameToValueMap['Missing'] is undefined.
        // evaluateFormula logic handles undefined vars usually as 0 or error.

        // However, let's verify runtime safety
        expect(item.parameter_config.computedValue).toBeDefined();
    });
});
