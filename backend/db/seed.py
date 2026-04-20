from copy import deepcopy

from backend.db.models import Instruction, InstructionField, ProtocolTemplate


SAMPLE_INSTRUCTIONS = [
    {
        "id": "sample-inst-heartbeat",
        "device_code": "YoRHa-9S",
        "code": "DEMO-001",
        "name": "示例心跳帧",
        "type": "STATIC",
        "description": "用于验证基础固定头、计数器、时间累计和校验码流程。",
        "fields": [
            {
                "id": "sample-heartbeat-header",
                "sequence": 0,
                "name": "帧头",
                "op_code": "HEX_RAW",
                "byte_len": 2,
                "parameter_config": {"hex": "AA 55"},
            },
            {
                "id": "sample-heartbeat-cmd",
                "sequence": 1,
                "name": "命令字",
                "op_code": "HEX_RAW",
                "byte_len": 1,
                "parameter_config": {"hex": "01"},
            },
            {
                "id": "sample-heartbeat-counter",
                "sequence": 2,
                "name": "计数器",
                "op_code": "AUTO_COUNTER",
                "byte_len": 1,
                "parameter_config": {"start_val": 1, "step": 1, "max": 255},
            },
            {
                "id": "sample-heartbeat-uptime",
                "sequence": 3,
                "name": "运行秒数",
                "op_code": "TIME_ACCUMULATOR",
                "byte_len": 4,
                "parameter_config": {"base_time": "2026-01-01T00:00:00"},
            },
            {
                "id": "sample-heartbeat-checksum",
                "sequence": 4,
                "name": "校验码",
                "op_code": "CHECKSUM_CRC",
                "byte_len": 1,
                "parameter_config": {
                    "algo": "ADD_SUM",
                    "refs": [
                        "sample-heartbeat-cmd",
                        "sample-heartbeat-counter",
                        "sample-heartbeat-uptime",
                    ],
                },
            },
            {
                "id": "sample-heartbeat-tail",
                "sequence": 5,
                "name": "帧尾",
                "op_code": "HEX_RAW",
                "byte_len": 1,
                "parameter_config": {"hex": "16"},
            },
        ],
    },
    {
        "id": "sample-inst-status",
        "device_code": "YoRHa-A2",
        "code": "DEMO-002",
        "name": "示例状态包",
        "type": "DYNAMIC",
        "description": "展示嵌套组、枚举映射、可编辑数值和长度计算。",
        "fields": [
            {
                "id": "sample-status-header",
                "sequence": 0,
                "name": "帧头",
                "op_code": "HEX_RAW",
                "byte_len": 2,
                "parameter_config": {"hex": "FA FA"},
            },
            {
                "id": "sample-status-group",
                "sequence": 1,
                "name": "状态块",
                "op_code": "ARRAY_GROUP",
                "byte_len": 0,
                "parameter_config": {"max_count": 1},
            },
            {
                "id": "sample-status-mode",
                "parent_id": "sample-status-group",
                "sequence": 0,
                "name": "运行模式",
                "op_code": "MAPPING",
                "byte_len": 1,
                "parameter_config": {
                    "options": {"待机": "00", "执行": "01", "故障": "FF"}
                },
            },
            {
                "id": "sample-status-voltage",
                "parent_id": "sample-status-group",
                "sequence": 1,
                "name": "母线电压",
                "op_code": "INT_UNSIGNED",
                "byte_len": 2,
                "parameter_config": {"bits": 16, "unit": "V", "description": "示例输入字段"},
            },
            {
                "id": "sample-status-temperature",
                "parent_id": "sample-status-group",
                "sequence": 2,
                "name": "模块温度",
                "op_code": "INT_UNSIGNED",
                "byte_len": 1,
                "parameter_config": {"bits": 8, "unit": "C"},
            },
            {
                "id": "sample-status-length",
                "sequence": 2,
                "name": "长度",
                "op_code": "LENGTH_CALC",
                "byte_len": 1,
                "parameter_config": {
                    "refs": ["sample-status-group", "sample-status-tail"],
                    "formula": "[状态块] + [帧尾]",
                },
            },
            {
                "id": "sample-status-tail",
                "sequence": 3,
                "name": "帧尾",
                "op_code": "HEX_RAW",
                "byte_len": 1,
                "parameter_config": {"hex": "ED"},
            },
        ],
    },
]

SAMPLE_PROTOCOLS = [
    {
        "id": "sample-protocol-root",
        "label": "示例协议壳",
        "type": "container",
        "description": "用于协议定义与编排绑定的默认协议壳。",
        "children": [
            {
                "id": "protocol-header",
                "label": "帧头 (HEADER)",
                "type": "fixed",
                "byte_length": 2,
                "hex_value": "FA FA",
                "config": {},
                "children": [],
            },
            {
                "id": "protocol-packaging",
                "label": "包装层 (PACKAGING)",
                "type": "container",
                "byte_length": 0,
                "config": {},
                "children": [
                    {
                        "id": "protocol-len",
                        "label": "长度 (LEN)",
                        "type": "length",
                        "byte_length": 1,
                        "config": {},
                        "children": [],
                    },
                    {
                        "id": "protocol-slot",
                        "label": "载荷插槽 (SLOT)",
                        "type": "slot",
                        "byte_length": 0,
                        "config": {},
                        "children": [],
                    },
                ],
            },
            {
                "id": "protocol-tail",
                "label": "帧尾 (TAIL)",
                "type": "fixed",
                "byte_length": 1,
                "hex_value": "ED",
                "config": {},
                "children": [],
            },
        ],
    }
]


def seed_sample_instructions(db):
    if db.query(Instruction).count() > 0:
        return

    for instruction_data in SAMPLE_INSTRUCTIONS:
        payload = {**instruction_data}
        fields = payload.pop("fields")
        db_instruction = Instruction(**payload)
        db.add(db_instruction)

        for field in fields:
            db.add(
                InstructionField(
                    instruction_id=db_instruction.id,
                    endianness="BIG",
                    repeat_type="NONE",
                    repeat_count=1,
                    **field,
                )
            )

    db.commit()


def seed_sample_protocols(db):
    if db.query(ProtocolTemplate).count() > 0:
        return

    for protocol in SAMPLE_PROTOCOLS:
        db.add(ProtocolTemplate(**deepcopy(protocol)))

    db.commit()
