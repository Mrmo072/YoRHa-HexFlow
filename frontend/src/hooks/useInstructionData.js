import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../api';

export function useInstructionData(onWebUpdate) {
    const [instructions, setInstructions] = useState([]);
    const [activeInstructionId, setActiveInstructionId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [operatorTemplates, setOperatorTemplates] = useState({});
    const isMountedRef = useRef(true);
    const instructionsRef = useRef([]);
    const activeInstructionIdRef = useRef(null);
    const statusTimerRef = useRef(null);

    // Computed property for easy access
    const currentInstruction = useMemo(
        () => instructions.find(i => i.id === activeInstructionId) || null,
        [instructions, activeInstructionId]
    );

    useEffect(() => {
        activeInstructionIdRef.current = activeInstructionId;
    }, [activeInstructionId]);

    useEffect(() => {
        instructionsRef.current = instructions;
    }, [instructions]);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            if (statusTimerRef.current) {
                clearTimeout(statusTimerRef.current);
            }
        };
    }, []);

    const showStatus = useCallback((message, durationMs = 0) => {
        if (!isMountedRef.current) return;

        if (statusTimerRef.current) {
            clearTimeout(statusTimerRef.current);
            statusTimerRef.current = null;
        }

        setStatusMsg(message);

        if (durationMs > 0) {
            statusTimerRef.current = setTimeout(() => {
                if (isMountedRef.current) {
                    setStatusMsg('');
                }
            }, durationMs);
        }
    }, []);

    const reconcileActiveInstruction = useCallback((nextInstructions, preferredId = activeInstructionIdRef.current) => {
        const nextActiveId = nextInstructions.some(i => i.id === preferredId)
            ? preferredId
            : (nextInstructions[0]?.id ?? null);
        setActiveInstructionId(nextActiveId);
        return nextActiveId;
    }, []);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [instData, opData] = await Promise.all([
                api.getInstructions(),
                api.getOperatorTemplates()
            ]);
            if (!isMountedRef.current) return;
            setInstructions(instData);

            const opMap = {};
            opData.forEach(op => opMap[op.op_code] = op);
            setOperatorTemplates(opMap);
            reconcileActiveInstruction(instData);
            if (onWebUpdate) onWebUpdate(instData);
        } catch (err) {
            console.error("Failed to load data", err);
            showStatus('离线模式 / 数据库错误');
        } finally {
            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    }, [onWebUpdate, reconcileActiveInstruction, showStatus]);

    // Load Initial Data
    useEffect(() => {
        loadData();
    }, [loadData]);

    const loadInstructions = useCallback(async (search = '') => {
        setIsLoading(true);
        try {
            const data = await api.getInstructions(search);
            if (!isMountedRef.current) return;
            setInstructions(data);
            reconcileActiveInstruction(data);
            setHasUnsavedChanges(false);
        } catch (err) {
            console.error(err);
            showStatus('指令列表加载失败');
        } finally {
            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    }, [reconcileActiveInstruction, showStatus]);

    const updateLocalInstruction = useCallback((updatedInst) => {
        setInstructions(prev => prev.map(i => i.id === updatedInst.id ? updatedInst : i));
        setHasUnsavedChanges(true);
    }, []);

    // CRUD ACTIONS
    const addInstruction = async (openConfirmCallback) => {
        const doAdd = async () => {
            const newInstPayload = {
                device_code: 'DEV-001',
                name: `New Instruction ${Math.floor(Math.random() * 1000)}`,
                code: `CMD - ${Math.floor(Math.random() * 1000)} `,
                type: 'STATIC',
                fields: []
            };
            try {
                const created = await api.createInstruction(newInstPayload);
                if (!isMountedRef.current) return;
                setInstructions(prev => [...prev, created]);
                setActiveInstructionId(created.id);
                setHasUnsavedChanges(false);
            } catch (e) {
                if (e.response && e.response.status === 400) {
                    showStatus(e.response.data.detail);
                }
            }
        };

        if (hasUnsavedChanges && openConfirmCallback) {
            return openConfirmCallback("检测到未保存的更改。\n是否覆盖？", doAdd);
        } else {
            return doAdd();
        }
    };

    const deleteInstruction = async (id, openConfirmCallback) => {
        const doDelete = async () => {
            try {
                await api.deleteInstruction(id);
                if (!isMountedRef.current) return;
                const rem = instructionsRef.current.filter(i => i.id !== id);
                setInstructions(rem);
                reconcileActiveInstruction(rem, activeInstructionIdRef.current === id ? null : activeInstructionIdRef.current);
                setHasUnsavedChanges(false);
            } catch (e) { }
        };

        if (openConfirmCallback) {
            return openConfirmCallback("警告：确认永久删除此指令？", doDelete);
        } else {
            return doDelete();
        }
    };

    const saveChanges = async (openConfirmCallback) => {
        if (!currentInstruction) return;
        try {
            showStatus('保存中...');
            await api.updateInstruction(currentInstruction.id, currentInstruction);
            showStatus('已保存', 1000);
            setHasUnsavedChanges(false);
            if (onWebUpdate) onWebUpdate(instructions);
        } catch (e) {
            console.error(e);
            if (e.response && e.response.status === 400 && openConfirmCallback) {
                showStatus(e.response.data.detail);
                openConfirmCallback(`保存失败：\n${e.response.data.detail}`, () => { });
            } else {
                showStatus('保存失败');
            }
        }
    };

    const revertChanges = (openConfirmCallback) => {
        if (openConfirmCallback) {
            openConfirmCallback("放弃所有更改并重新加载？", () => loadInstructions());
        } else {
            loadInstructions();
        }
    };

    return {
        instructions,
        activeInstructionId,
        setActiveInstructionId,
        currentInstruction,
        operatorTemplates,
        isLoading,
        statusMsg,
        setStatusMsg,
        hasUnsavedChanges,
        setHasUnsavedChanges,
        setInstructions, // For functional updates like block deletion
        loadData,
        loadInstructions,
        updateLocalInstruction,
        addInstruction,
        deleteInstruction,
        saveChanges,
        revertChanges
    };
}
