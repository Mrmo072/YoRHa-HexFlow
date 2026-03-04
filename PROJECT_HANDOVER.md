# YoRHa-HexFlow 项目交接文档

## 1. 项目概览
**YoRHa-HexFlow** 是一个可视化、低代码/无代码编辑器，旨在管理和生成二进制指令流（VM 字节码）。它允许用户通过可视化方式定义指令结构（“内核”），并根据严格的打包规则将其编译为二进制负载。

**视觉风格**: <尼尔：机械纪元> UI（单色冷调、网格背景、故障 Glitch 效果、“系统”美学）。

## 2. 技术栈与环境
*   **操作系统**: Windows
*   **前端**: React (Vite) + TailwindCSS
    *   路径: `frontend/`
    *   运行: `npm run dev` (端口 5173)
*   **后端**: Python (FastAPI) + SQLAlchemy + PyMySQL
    *   DB 驱动: `pymysql`
    *   路径: `backend/`
    *   运行: `venv\Scripts\python.exe -m uvicorn backend.main:app --reload` (端口 8000)
*   **数据库**: MySQL
    *   Host: `localhost:3306`
    *   User/Pass: `root` / `123456`
    *   Schema (库名): `tc`

## 3. 数据库架构 (Schema First 原则)
本项目基于现有的 MySQL 数据库运行。**请勿修改以下表名或核心字段**，除非经过严格确认。

### A. `instructions` (主表)
定义指令目录。
*   `id` (char(36)): UUID。
*   `name` (varchar(128)): 显示名称 (例如 "Move Robot")。
*   `code` (varchar(64)): 人类可读代号 (例如 "CMD-001")。
*   `opcode_hex` (varchar(16)): **主指令码 (Leading Opcode)** (例如 "1A", "0x10")。这是二进制生成的头部关键。
*   `type` (varchar(32)): 'STATIC' (静态) 或 'DYNAMIC' (动态)。
*   `description` (text): 描述。

### B. `instruction_fields` (树形字段)
定义指令负载的结构。支持无限嵌套。
*   `id` (char(36)).
*   `instruction_id` (char(36)): 外键。
*   `parent_id` (char(36)): 自关联外键 (用于嵌套容器/数组)。
*   `sequence` (int): 排序序号。
*   `name` (varchar(64)): 字段标签名称。
*   `op_code` (varchar(32)): 逻辑算子类型。
    *   值域: `HEX_RAW` (静态十六进制), `UINT` (无符号整型), `INT` (整型), `FLOAT` (浮点), `SCALED_DECIMAL` (比例因子小数), `CHECKSUM` (校验和), `BITFIELD` (位域)。
*   `byte_len` (int): 字节宽度 (注意: 数据库字段名为 `byte_len`，非 `byte_length`)。
*   `config_values` (json): 特定配置 (例如 `{"hex": "AA55"}`, `{"factor": 0.01}`).

### C. `bit_fields` (位级精度)
当字段 `op_code='BITFIELD'` 时，定义具体的位（Bit）布局。
*   `id`, `field_id`.
*   `bit_name`, `start_bit`, `bit_len`, `default_val`.

## 4. 核心业务逻辑：“汇编器 (The Assembler)”
后续开发 **必须** 遵循此规则来生成二进制数据：

1.  **第一步：主识别码 (Leading Opcode)**
    *   任何指令生成时，**必须**首先写入 `instructions.opcode_hex`。
    *   *示例*: 若 `inst.opcode_hex = '10'` -> 输出流起始字节为 `0x10`。

2.  **第二步：载荷生长 (Payload Growth & Recursion)**
    *   遍历所有 `instruction_fields` (仅限 `parent_id` 为空的根节点)，按 `sequence` 排序。
    *   **Static (HEX_RAW)**: 直接追加 `config_values.hex` 内容。
    *   **Bitfield**: 收集关联的 `bit_fields`，将位压缩进 `byte_len` 长度的字节中，追加结果。
    *   **Scaled Decimal**: 计算公式 `(Input + Offset) * Factor` -> 转为整型打包 -> 追加。

3.  **第三步：变长/嵌套 (Variable Length / Nesting)**
    *   如果字段是 `ARRAY_GROUP` (即容器)，读取输入计数 `N`。
    *   在该位置重复序列化其 **子节点** (即 `parent_id` = 当前字段ID 的字段) `N` 次。

## 5. 当前实施状态
### ✅ 已完成 (Working)
*   **全栈 CRUD**: 指令与字段的增删改查完全打通。
*   **DB 同步**: 后端 Pydantic 模型与 MySQL Schema 完全对齐。
*   **UI 功能**:
    *   侧边栏: 支持按 代号(Code) 或 名称(Name) 搜索。
    *   画布: 支持拖拽排序 (dnd-kit)。
    *   属性面板: 支持编辑 名称、代号、主指令码(OpcodeHex)、字节长、Hex值。
    *   安全: 删除操作均有二次确认。

### 🚧 待办 / 下一步 (Pending)
1.  **生成器 (The Generator)**: 编写 Python 脚本/接口，真正实现第 4 节描述的“汇编逻辑”，输出二进制文件。
2.  **动态发送表单**: 前端页面，让用户 *选择* 一条指令，并 *填入* 具体参数 (针对 `UINT`, `FLOAT` 等动态字段)，点击发送生成数据包。
3.  **位域编辑器**: 目前 `BITFIELD` 只是下拉菜单的一个选项，还没有专门的 UI 来编辑 `start_bit` / `bit_len`。

## 6. 给下一位 AI 的建议
*   **严格类型**: 后端使用 Pydantic + SQLAlchemy，请保持严谨。
*   **字段名归一化**: 前端 `Block.jsx` 做了兼容处理 (`byte_len` vs `byte_length`)，保留此逻辑以防止 Schema 变更导致崩溃。
*   **NieR 风格**: 新增组件请继续复用 `index.css` 中的 `nier-*` 工具类 (基于 Tailwind config)。




