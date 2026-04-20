import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import Protocol from './pages/Protocol';
import Instruction from './pages/Instruction';
import InstructionProcessor from './pages/InstructionProcessor';
import Orchestration from './pages/Orchestration';
import Terminal from './pages/Terminal';
import DataHub from './pages/DataHub';
import GlitchEffect from './components/visuals/GlitchEffect';
import { api } from './api';

function Layout() {
    const location = useLocation();
    const routeTitleMap = {
        '/protocol': 'Protocol Definition',
        '/instruction': 'Instruction Management',
        '/processing': 'Instruction Processing',
        '/orchestration': 'Orchestration Binding',
        '/terminal': 'Communication Terminal',
        '/datahub': 'Data Hub'
    };
    const currentRouteTitle = routeTitleMap[location.pathname] || 'YoRHa-HexFlow';

    // Global Data State (Lifted)
    const [protocols, setProtocols] = useState([]);
    const [instructions, setInstructions] = useState([]);

    useEffect(() => {
        let alive = true;

        const loadAppData = async () => {
            try {
                const [protocolData, instructionData] = await Promise.all([
                    api.getProtocols(),
                    api.getInstructions()
                ]);
                if (alive) {
                    setProtocols(protocolData);
                    setInstructions(instructionData);
                }
            } catch (error) {
                console.error('Failed to load app-level data', error);
            }
        };

        loadAppData();

        return () => {
            alive = false;
        };
    }, []);

    // Nav Item Helper
    const NavItem = ({ to, label, shortcut }) => (
        <NavLink to={to} className={({ isActive }) => `
            group relative flex items-center justify-between px-4 py-3 text-xs tracking-widest transition-all duration-200
            ${isActive ? 'bg-nier-light text-nier-dark font-bold' : 'text-nier-light opacity-60 hover:opacity-100 hover:bg-nier-light/10'}
        `}>
            {({ isActive }) => (
                <>
                    <span>{label}</span>
                    <span className="opacity-30 group-hover:opacity-100 transition-opacity font-mono">[{shortcut}]</span>

                    {/* Active Indicator */}
                    <span className={`absolute left-0 top-0 bottom-0 w-1 bg-current transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`}></span>
                </>
            )}
        </NavLink>
    );

    return (
        <div className="flex h-screen w-screen bg-nier-dark text-nier-light overflow-hidden relative selection:bg-nier-light selection:text-nier-dark font-sans">
            <GlitchEffect />

            {/* Sidebar Navigation */}
            <nav className="w-64 border-r border-nier-light flex flex-col justify-between bg-nier-dark/95 backdrop-blur-md z-50">
                {/* Brand */}
                <div className="p-6 border-b border-nier-light/30">
                    <h1 className="text-2xl font-black tracking-tighter leading-none">HEX<br /><span className="text-lg font-light tracking-widest opacity-80">Orchestrator</span></h1>
                    <div className="mt-2 text-[10px] font-mono opacity-40 uppercase">YoRHa-HexFlow Unit</div>
                </div>

                {/* Links */}
                <div className="flex-1 flex flex-col py-6 gap-2">
                    <NavItem to="/protocol" label="协议定义" shortcut="A" />
                    <NavItem to="/instruction" label="指令管理" shortcut="B" />
                    <NavItem to="/processing" label="指令加工" shortcut="R" />
                    <NavItem to="/orchestration" label="编排绑定" shortcut="C" />
                    <NavItem to="/terminal" label="通讯调试" shortcut="D" />
                    <NavItem to="/datahub" label="数据中心" shortcut="E" />
                </div>

                {/* Footer Info */}
                <div className="p-4 border-t border-nier-light/30 text-[10px] font-mono opacity-50 flex flex-col gap-1">
                    <div className="flex justify-between">
                        <span>系统状态</span>
                        <span>ONLINE</span>
                    </div>
                    <div className="flex justify-between">
                        <span>当前位置</span>
                        <span>{location.pathname.replace('/', '').toUpperCase()}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-dashed border-current opacity-50 text-center">
                        人类の栄光のために
                    </div>
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden relative">
                {/* Top Bar (Context) */}
                <header className="h-12 border-b border-nier-light flex items-center justify-between px-6 bg-nier-dark/80 backdrop-blur-sm z-40">
                    <div className="flex items-center gap-2 text-xs font-mono opacity-60">
                        <span className="w-2 h-2 bg-nier-light animate-pulse"></span>
                        <span>OPERATIONAL // {new Date().toISOString().split('T')[0]}</span>
                    </div>
                    <div className="text-xs tracking-widest uppercase opacity-80">
                        Page: {currentRouteTitle}
                    </div>
                </header>

                {/* Page Content */}
                <div key={location.pathname} className="flex-1 overflow-hidden relative flex flex-col">
                    <Routes>
                        <Route path="/" element={<Navigate to="/protocol" replace />} />
                        <Route path="/protocol" element={<Protocol protocols={protocols} setProtocols={setProtocols} />} />
                        <Route path="/instruction" element={<Instruction instructions={instructions} setInstructions={setInstructions} onWebUpdate={setInstructions} />} />
                        <Route path="/processing" element={<InstructionProcessor instructions={instructions} setInstructions={setInstructions} />} />
                        <Route path="/orchestration" element={<Orchestration protocols={protocols} instructions={instructions} />} />
                        <Route path="/terminal" element={<Terminal />} />
                        <Route path="/datahub" element={<DataHub />} />
                    </Routes>
                </div>
            </main>
        </div>
    );
}

function App() {
    return (
        <BrowserRouter>
            <Layout />
        </BrowserRouter>
    );
}

export default App;
