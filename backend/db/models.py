from sqlalchemy import Column, Integer, String, Text, ForeignKey, Enum, JSON, Boolean
from sqlalchemy.orm import relationship, backref
from backend.db.database import Base
import enum

# Enums
class InstructionType(str, enum.Enum):
    STATIC = "STATIC"
    DYNAMIC = "DYNAMIC"

class LayerType(str, enum.Enum):
    HEX_RAW = "HEX_RAW"
    UINT = "UINT"
    INT = "INT"
    FLOAT = "FLOAT"
    SCALED_DECIMAL = "SCALED_DECIMAL"
    AUTO_COUNTER = "AUTO_COUNTER"
    ARRAY_GROUP = "ARRAY_GROUP"
    BITFIELD = "BITFIELD"
    CHECKSUM = "CHECKSUM"

# 1. Instructions (Main Table)
class Instruction(Base):
    __tablename__ = "instructions"

    id = Column(String(36), primary_key=True)
    code = Column(String(64))
    opcode_hex = Column(String(16)) # Main Opcode
    name = Column(String(128)) # Was label
    type = Column(String(32), default="STATIC") # Was Enum
    description = Column(Text, nullable=True)
    
    # Timestamps (mapped but maybe handled by DB)
    # created_at = ...
    
    # Children
    fields = relationship("InstructionField", back_populates="instruction", cascade="all, delete-orphan")

# 2. Operator Templates
class OperatorTemplate(Base):
    __tablename__ = "operator_templates"
    
    op_code = Column(String(32), primary_key=True)
    name = Column(String(64))
    category = Column(String(32))
    param_template = Column(JSON)
    description = Column(String(255))

# 3. Instruction Fields
class InstructionField(Base):
    __tablename__ = "instruction_fields"

    id = Column(String(36), primary_key=True)
    instruction_id = Column(String(36), ForeignKey("instructions.id"))
    parent_id = Column(String(36), ForeignKey("instruction_fields.id"), nullable=True)
    
    sequence = Column(Integer, default=0)
    name = Column(String(64)) # Was label
    op_code = Column(String(32))
    
    byte_len = Column(Integer, default=1) # Was byte_length
    endianness = Column(String(32), default="BIG")
    config_values = Column(JSON, default={})
    
    # Relationships
    instruction = relationship("Instruction", back_populates="fields")
    children = relationship("InstructionField", 
                            backref=backref('parent', remote_side=[id]),
                            cascade="all, delete-orphan")
    bit_fields = relationship("BitField", back_populates="field", cascade="all, delete-orphan")

# 4. Bit Fields
class BitField(Base):
    __tablename__ = "bit_fields"
    
    id = Column(String(36), primary_key=True)
    field_id = Column(String(36), ForeignKey("instruction_fields.id"))
    
    bit_name = Column(String(64)) # Was label
    start_bit = Column(Integer)
    bit_len = Column(Integer, default=1) # Was bit_width
    default_val = Column(Integer, default=0) # Was default_value
    
    field = relationship("InstructionField", back_populates="bit_fields")
