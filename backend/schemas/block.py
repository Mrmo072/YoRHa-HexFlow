from enum import Enum
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field

class BlockType(str, Enum):
    FIXED = "fixed"
    LENGTH = "length" 
    CHECKSUM = "checksum"
    OPTIONAL = "optional"
    TIMESTAMP = "timestamp" # New Phase 3
    CONTAINER = "container" # New Phase 3
    SLOT = "slot"

class BlockConfig(BaseModel):
    # Logic Link
    target_start_id: Optional[str] = None
    target_end_id: Optional[str] = None
    
    # Checksum
    algorithm: Optional[str] = "sum" # sum, xor, crc16_modbus
    
    # Container/Slot
    header_hex: Optional[str] = None
    tail_hex: Optional[str] = None
    
    # General
    params: Dict[str, Any] = Field(default_factory=dict)

class Block(BaseModel):
    id: str
    type: str # Use string to allow flexibility or BlockType enum
    label: str
    byte_length: int
    hex_value: Optional[str] = None
    config: Optional[BlockConfig] = None
    
    # Phase 3: Recursive Structure
    children: List['Block'] = Field(default_factory=list) 
    is_container: bool = False
    is_enabled: bool = True

class FrameRequest(BaseModel):
    blocks: List[Block]

class CompileResponse(BaseModel):
    hex_string: str
    total_length: int
    debug_info: List[str] = []
