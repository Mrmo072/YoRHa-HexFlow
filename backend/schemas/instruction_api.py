from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from enum import Enum

# Shared Enums (Must match DB)
class InstructionType(str, Enum):
    STATIC = "STATIC"
    DYNAMIC = "DYNAMIC"

class BitFieldSchema(BaseModel):
    id: Optional[str]
    bit_name: str
    start_bit: int
    bit_len: int
    default_val: int = 0
    
    class Config:
        from_attributes = True

class InstructionFieldSchema(BaseModel):
    id: Optional[str]
    parent_id: Optional[str] = None
    sequence: int = 0
    name: str # Was label
    op_code: str
    config_values: Dict[str, Any] = {}
    byte_len: int = 1 # Was byte_length
    endianness: str = "BIG"
    
    children: List['InstructionFieldSchema'] = []
    bit_fields: List[BitFieldSchema] = []
    
    class Config:
        from_attributes = True

class InstructionCreate(BaseModel):
    id: Optional[str] = None
    code: Optional[str] = None
    opcode_hex: str = "00"
    name: str # Was label
    description: Optional[str] = None
    type: str = "STATIC"
    fields: List[InstructionFieldSchema] = []

class InstructionResponse(InstructionCreate):
    id: str # ID required in response
    
    class Config:
        from_attributes = True
