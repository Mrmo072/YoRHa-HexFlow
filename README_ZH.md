# YoRHa-HexFlow: Hex Instruction Orchestrator

![License](https://img.shields.io/badge/license-MIT-blue)
![Frontend](https://img.shields.io/badge/Frontend-React_18_%7C_Vite-61DAFB)
![Backend](https://img.shields.io/badge/Backend-FastAPI-009688)
![Style](https://img.shields.io/badge/Style-Nier:_Automata-dad4bb)

**YoRHa-HexFlow** 是一个高度视觉化的 16 进制指令编制工具，旨在通过积木流 (Block Flow) 的方式简化复杂的底层二进制协议设计。其设计灵感来源于 *Nier: Automata* 的 UI 风格，强调交互的流畅性与沉浸感。

<p align="center">
  <img src="docs/images/screenshot_processing.png" alt="指令加工页面" width="90%">
</p>

<p align="center">
  <img src="docs/images/preview_demo.gif" alt="操作演示" width="90%">
</p>

## ✨ 核心特性 (Key Features)

### 1. 可视化编排 (Visual Orchestration)
- **拖拽式积木 (Drag & Drop)**: 基于 `@dnd-kit`，支持无限层级嵌套的积木拖拽与排序。
- **动态泳道 (Swimlanes)**: 自动根据数据结构生成层级分明的泳道视图。
- **智能连线**: 自动绘制积木间的逻辑引用关系（如校验和引用、长度计算引用）。

### 2. 强大的逻辑引擎 (Logic Engine)
- **实时公式计算**: 支持 `([FieldA] + 10) / 2` 形式的动态公式，前端实时预览计算结果。
- **自动计数器 & 时间累计**: 内置 `AUTO_COUNTER` 和 `TIME_ACCUMULATOR` 等智能积木。
- **多进制支持**: 属性面板支持 HEX/DEC/BIN 无缝切换输入。

### 3. 工程化与质量 (Engineering)
- **SRP 架构**: 严格遵循单一职责原则，逻辑 Hook 化，组件原子化。
- **全链路测试**: 
  - 集成 `Vitest` + `React Testing Library`。
  - 核心 Hooks 测试覆盖率 100%。
  - 包含防崩溃的冒烟测试 (Smoke Tests)。

---

## 🚀 快速启动 (Quick Start)

### 1. 数据库初始化 (Database)
创建 MySQL 数据库并初始化表结构。

```bash
# 登录 MySQL 并创建数据库
mysql -u root -p
CREATE DATABASE tc CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE tc;

# 执行建表与种子数据
SOURCE backend/db/migrations/schema.sql;
SOURCE backend/db/migrations/seed_data.sql;
```

### 2. 后端服务 (Backend)
提供数据持久化与核心业务 API。

```bash
# Windows
python -m venv venv
.\venv\Scripts\activate
pip install -r backend/requirements.txt

# 启动 (http://127.0.0.1:8000)
python -m uvicorn backend.main:app --reload
```

### 3. 前端界面 (Frontend)
基于 React 18 + Vite 构建的交互界面。

```bash
cd frontend
npm install

# 启动 (http://localhost:5173)
npm run dev
```

### 4. 运行测试 (Run Tests) [NEW]
确保代码修改的安全性与稳定性。

```bash
cd frontend
npm run test
```

---

## 🏗️ 项目架构 (Architecture)

```mermaid
graph TD
    UI[Frontend UI] -->|Ref/Select| Hooks[Custom Hooks]
    Hooks -->|Data Flow| Logic[Business Logic]
    Logic -->|REST API| API[Backend FastAPI]
    
    subgraph Frontend [React Layer]
      Hooks --> useInstructionData
      Hooks --> useSelectionSystem
      Hooks --> useInstructionLanes
      Hooks --> useCanvasConnections
    end
    
    subgraph Utils [Shared Utilities]
      Logic --> formula.js[Formula Engine]
      Logic --> constants.js[Constants]
    end
```

详细技术规格请参考: [SPECIFICATION.md](./SPECIFICATION.md)

---

## 📜 目录结构

```
/backend
    /main.py            # FastAPI 入口
    /models.py          # Pydantic 数据模型
    
/frontend
    /src
        /components     # 原子 UI 组件 (Block, PropertiesPanel)
        /hooks          # 业务逻辑 Hooks (Data, Selection)
        /pages          # 页面级容器 (Instruction, Canvas)
        /utils          # 纯函数工具 (Formula, Hex)
        /constants.js   # 全局常量定义
    /src/hooks/__tests__ # 单元测试套件
```

## ⚠️ 开发规范 (Guidelines)
1. **单一职责**: 单文件不超过 400 行，复杂逻辑必须提取 Hook。
2. **测试驱动**: 修改核心逻辑后必须运行 `npm run test`。
3. **DRY 原则**: 避免 Magic Strings，使用 `constants.js`。

---
*Glory to Mankind.*
