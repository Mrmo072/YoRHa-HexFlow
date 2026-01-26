# HexOrchestrator-YoRHa

构建一个高度视觉化、基于积木流的 16 进制指令编制工具。
**风格**: Nier: Automata (尼尔：机械纪元)
**核心**: Python DAG 逻辑引擎 + React 拖拽交互

## 快速启动 (Quick Start)

### 1. 后端 (Backend)

后端基于 Python 3.10+ 和 FastAPI。

```bash
# 进入项目根目录
# 创建虚拟环境
python -m venv venv

# 激活虚拟环境 (Windows PowerShell)
.\venv\Scripts\activate

# 安装依赖
pip install fastapi uvicorn pydantic

# 启动服务 (开发模式)
# 注意：必须使用 -m uvicorn 以避免路径问题
python -m uvicorn backend.main:app --reload
```

服务将运行在: `http://127.0.0.1:8000`

### 2. 前端 (Frontend)

前端基于 React, Vite, Tailwind CSS v4。

```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问地址: `http://localhost:5173`

### 3. Docker 部署 (Full Stack)

如果你想直接运行完整环境：

```bash
docker-compose up --build
```

## 项目结构

- `/backend`: 逻辑核心 (DAG Engine, Checksum Handlers)
- `/frontend`: UI 交互 (React, dnd-kit, Nier Aesthetic)
- `/deploy`: 部署配置
