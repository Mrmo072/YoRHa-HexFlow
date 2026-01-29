import { useState, useEffect, useMemo, useCallback } from 'react';
import { InstructionEncoder } from '../utils/InstructionEncoder';

export function useInstructionForm(instruction) {
    const [inputs, setInputs] = useState({});

    // Initialize defaults when instruction ID changes
    useEffect(() => {
        if (instruction?.id) {
            // Important: We only reset if the ID actually changed to a new one
            // or if it's the first initialization.
            const defaults = InstructionEncoder.getInitialValues(instruction);
            setInputs(defaults);
        } else if (!instruction) {
            setInputs({});
        }
    }, [instruction?.id]); // Only trigger on ID change

    // Handle single field update
    const handleInputChange = useCallback((fieldId, value) => {
        setInputs(prev => ({
            ...prev,
            [fieldId]: value
        }));
    }, []);

    // Reactive Calculations
    // We memoize the results so we don't re-run on purely visual renders,
    // only when inputs or instruction changes.
    const { computedValues, hexPreview, byteMap } = useMemo(() => {
        if (!instruction) return { computedValues: {}, hexPreview: '', byteMap: [] };

        const computed = InstructionEncoder.resolveDependencies(instruction, inputs);
        const { hexString, byteMap: map } = InstructionEncoder.encodeInstruction(instruction, inputs, computed);

        return {
            computedValues: computed,
            hexPreview: hexString,
            byteMap: map
        };
    }, [instruction, inputs]);

    return {
        inputs,
        handleInputChange,
        computedValues,
        hexPreview,
        byteMap,
        setInputs // Exposed for reset/bulk set if needed
    };
}
