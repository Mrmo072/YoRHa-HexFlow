import React, { useState } from 'react';
import InstructionListSidebar from '../components/InstructionListSidebar';
import InstructionRunner from '../components/InstructionForm/InstructionRunner';
import { useInstructionData } from '../hooks/useInstructionData';

export default function InstructionProcessor() {
    // We rely solely on the hook to fetch from DB, matching the Management page behavior
    const {
        instructions,
        activeInstructionId,
        setActiveInstructionId,
        currentInstruction,
        loadInstructions
    } = useInstructionData();


    const [searchTerm, setSearchTerm] = useState('');

    // Handle "Send" action (mock for now, or real API call)
    const handleSend = async (payload) => {
        console.log(`[Processor] Sending Payload: ${payload}`);
        // TODO: Call backend API if needed
        // await api.sendRaw(payload);
    };

    return (
        <div className="flex-1 flex overflow-hidden relative">
            <InstructionListSidebar
                instructions={instructions}
                activeInstructionId={activeInstructionId}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onSearch={loadInstructions}
                onSelect={setActiveInstructionId}
                // We pass no-op for Add/Delete to make it "Read Only" or just hide buttons via CSS if we wanted to be stricter.
                // But passing empty functions prevents crashes if clicked.
                onAdd={() => { }}
                onDelete={() => { }}
                hasUnsavedChanges={false}
            />

            <section className="flex-1 relative bg-nier-bg flex flex-col overflow-hidden">
                {activeInstructionId ? (
                    <InstructionRunner
                        instruction={currentInstruction}
                        onSend={handleSend}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-nier-dark/30 font-mono tracking-widest animate-pulse">
                        SELECT A PROTOCOL FROM KNOWLEDGE BASE
                    </div>
                )}
            </section>
        </div>
    );
}
