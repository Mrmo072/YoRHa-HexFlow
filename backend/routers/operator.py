from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from backend.db.database import get_db
from backend.db.models import OperatorTemplate
from backend.schemas.instruction_api import OperatorTemplateSchema

router = APIRouter(
    prefix="/operator_templates",
    tags=["operators"]
)

# SEED DATA (As defined in Plan)
SEED_TEMPLATES = [
    # BASE
    {"op_code": "HEX_RAW", "name": "原始Hex", "category": "BASE", "description": "固定十六进制值", "param_template": {"hex": "input"}},
    
    # NUMERIC
    {"op_code": "INT_UNSIGNED", "name": "无符号整数", "category": "NUMERIC", "description": "标准整数", "param_template": {"bits": [8,16,32,64]}},
    {"op_code": "INT_SIGNED", "name": "有符号整数", "category": "NUMERIC", "description": "补码整数", "param_template": {"bits": [8,16,32,64]}},
    {"op_code": "FLOAT_IEEE", "name": "浮点数", "category": "NUMERIC", "description": "IEEE 754", "param_template": {"bits": [32, 64]}},
    {"op_code": "SCALED_DECIMAL", "name": "比例小数", "category": "NUMERIC", "description": "公式: (In+Offset)*Factor", "param_template": {"factor": "number", "offset": "number"}},
    
    # ENCODING
    {"op_code": "BCD_CODE", "name": "BCD码", "category": "ENCODING", "description": "Binary Coded Decimal", "param_template": {"bytes": "number"}},

    # DYNAMIC
    {"op_code": "TIME_ACCUMULATOR", "name": "时间累积", "category": "DYNAMIC", "description": "Current - BaseTime", "param_template": {"base_time": "datetime"}},
    {"op_code": "AUTO_COUNTER", "name": "自动计数", "category": "DYNAMIC", "description": "(Current+Step)%Max", "param_template": {"step": 1, "max": 65535}},
    
    # LOGIC
    {"op_code": "MAPPING", "name": "枚举映射", "category": "LOGIC", "description": "状态位映射", "param_template": {"options": "kv_pair_list"}},
    
    # STRUCT
    {"op_code": "ARRAY_GROUP", "name": "嵌套组", "category": "STRUCT", "description": "循环容器", "param_template": {"max_count": "number"}},

    # LOGIC_CALC (New)
    {"op_code": "LENGTH_CALC", "name": "长度计算", "category": "LOGIC", "description": "动态计算字段长度", "param_template": {"refs": "field_picker", "math_op": ["ADD", "SUB", "MUL", "DIV"], "offset": "number", "fixed_len": "number"}},
    {"op_code": "CHECKSUM_CRC", "name": "校验码", "category": "LOGIC", "description": "CRC/Sum/Xor校验", "param_template": {"refs": "field_picker", "algo": ["CRC16_CCITT", "CRC32", "XOR_SUM", "ADD_SUM"], "fixed_len": "number"}},
]

@router.on_event("startup")
def seed_operators():
    # Robust seed: Upsert templates
    from backend.db.database import SessionLocal
    db = SessionLocal()
    try:
        print("Seeding/Updating Operator Templates...")
        for t in SEED_TEMPLATES:
            db_obj = OperatorTemplate(**t)
            db.merge(db_obj)
        db.commit()
        print("Seeding Complete.")
    except Exception as e:
        print(f"Seeding Failed: {e}")
    finally:
        db.close()

@router.get("/", response_model=List[OperatorTemplateSchema])
def get_operator_templates(db: Session = Depends(get_db)):
    return db.query(OperatorTemplate).all()
