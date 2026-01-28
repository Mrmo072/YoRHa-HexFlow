import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

export function useInstructionData(onWebUpdate) {
    const [instructions, setInstructions] = useState([]);
    const [activeInstructionId, setActiveInstructionId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [operatorTemplates, setOperatorTemplates] = useState({});

    // Computed property for easy access
    const currentInstruction = instructions.find(i => i.id === activeInstructionId);

    // Load Initial Data
    useEffect(() => {
        loadData();
    }, []);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [instData, opData] = await Promise.all([
                api.getInstructions(),
                api.getOperatorTemplates()
            ]);
            setInstructions(instData);

            const opMap = {};
            opData.forEach(op => opMap[op.op_code] = op);
            setOperatorTemplates(opMap);

            if (instData.length > 0) {
                // If no active selection, default to first.
                // We use callback to check current state safely if strictly needed,
                // but for init, checking 'activeInstructionId' from scope is fine 
                // IF we don't depend on it for the fetch itself.
                setActiveInstructionId(prev => prev || instData[0].id);
            }
            if (onWebUpdate) onWebUpdate(instData);
        } catch (err) {
            console.error("Failed to load data", err);
            setStatusMsg('离线模式 / 数据库错误');
        } finally {
            setIsLoading(false);
        }
    }, [onWebUpdate]); // Removed activeInstructionId dependence to prevent loops

    const loadInstructions = useCallback(async (search = '') => {
        setIsLoading(true);
        try {
            const data = await api.getInstructions(search);
            setInstructions(data);
            setHasUnsavedChanges(false);
        } catch (err) { console.error(err); } finally { setIsLoading(false); }
    }, []);

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
                setInstructions(prev => [...prev, created]);
                setActiveInstructionId(created.id);
                setHasUnsavedChanges(false);
            } catch (e) {
                if (e.response && e.response.status === 400) {
                    setStatusMsg(e.response.data.detail);
                }
            }
        };

        if (hasUnsavedChanges && openConfirmCallback) {
            openConfirmCallback("检测到未保存的更改。\n是否覆盖？", doAdd);
        } else {
            doAdd();
        }
    };

    const deleteInstruction = async (id, openConfirmCallback) => {
        const doDelete = async () => {
            try {
                await api.deleteInstruction(id);
                const rem = instructions.filter(i => i.id !== id);
                setInstructions(rem);
                if (activeInstructionId === id) setActiveInstructionId(rem[0]?.id || null);
                setHasUnsavedChanges(false);
            } catch (e) { }
        };

        if (openConfirmCallback) {
            openConfirmCallback("警告：确认永久删除此指令？", doDelete);
        } else {
            doDelete();
        }
    };

    const saveChanges = async (openConfirmCallback) => {
        if (!currentInstruction) return;
        try {
            setStatusMsg('保存中...');
            await api.updateInstruction(currentInstruction.id, currentInstruction);
            setStatusMsg('已保存');
            setHasUnsavedChanges(false);
            if (onWebUpdate) onWebUpdate(instructions);
            setTimeout(() => setStatusMsg(''), 1000);
        } catch (e) {
            console.error(e);
            if (e.response && e.response.status === 400 && openConfirmCallback) {
                setStatusMsg(e.response.data.detail);
                openConfirmCallback(`保存失败：\n${e.response.data.detail}`, () => { });
            } else {
                setStatusMsg('保存失败');
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
