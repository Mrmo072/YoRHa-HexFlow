from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List
import uuid

from backend.db.database import get_db, engine, Base
from backend.db.models import Instruction, InstructionField
from backend.db.seed import seed_sample_instructions
from backend.schemas.instruction_api import InstructionCreate, InstructionResponse, InstructionFieldSchema, InstructionUpdate

# Create tables if not exist (Simple migration)
# In prod use Alembic
Base.metadata.create_all(bind=engine)

router = APIRouter(
    prefix="/instructions",
    tags=["instructions"]
)


@router.on_event("startup")
def seed_instructions():
    from backend.db.database import SessionLocal

    db = SessionLocal()
    try:
        seed_sample_instructions(db)
    finally:
        db.close()

# HELPER: Recursive Save
# HELPER: Flat Save (Trust Payload)
def save_field_flat(db: Session, field_data: InstructionFieldSchema, instruction_id: str):
    f_id = field_data.id or str(uuid.uuid4())
    
    db_field = InstructionField(
        id=f_id,
        instruction_id=instruction_id,
        parent_id=field_data.parent_id, # Trust the payload
        sequence=field_data.sequence,
        name=field_data.name,
        op_code=field_data.op_code,
        
        # New Schema Fields
        parameter_config=field_data.parameter_config,
        byte_len=field_data.byte_len,
        endianness=field_data.endianness,
        
        repeat_type=field_data.repeat_type,
        repeat_ref_id=field_data.repeat_ref_id,
        repeat_count=field_data.repeat_count
    )
    db.add(db_field)


def serialize_instruction(db_inst: Instruction) -> InstructionResponse:
    sorted_fields = sorted(
        db_inst.fields,
        key=lambda field: ((field.parent_id or ''), field.sequence, field.name, field.id)
    )

    response_fields = [
        InstructionFieldSchema(
            id=field.id,
            parent_id=field.parent_id,
            sequence=field.sequence,
            name=field.name,
            op_code=field.op_code,
            byte_len=field.byte_len,
            endianness=field.endianness,
            repeat_type=field.repeat_type,
            repeat_ref_id=field.repeat_ref_id,
            repeat_count=field.repeat_count,
            parameter_config=field.parameter_config or {},
            children=[]
        )
        for field in sorted_fields
    ]

    return InstructionResponse(
        id=db_inst.id,
        device_code=db_inst.device_code,
        code=db_inst.code,
        name=db_inst.name,
        description=db_inst.description,
        type=db_inst.type,
        fields=response_fields
    )



@router.get("/", response_model=List[InstructionResponse])
def get_instructions(search: str = None, db: Session = Depends(get_db)):
    query = db.query(Instruction)
    if search:
        query = query.filter(or_(Instruction.name.contains(search), Instruction.code.contains(search)))
    instructions = query.all()
    return [serialize_instruction(instruction) for instruction in instructions]

@router.get("/{id}", response_model=InstructionResponse)
def get_instruction_detail(id: str, db: Session = Depends(get_db)):
    inst = db.query(Instruction).filter(Instruction.id == id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Instruction not found")

    return serialize_instruction(inst)

@router.post("/", response_model=InstructionResponse)
def create_instruction(inst: InstructionCreate, db: Session = Depends(get_db)):
    i_id = str(uuid.uuid4())
    
    # 1. Uniqueness Check
    existing = db.query(Instruction).filter(or_(Instruction.name == inst.name, Instruction.code == inst.code)).first()
    if existing:
        raise HTTPException(status_code=400, detail="指令名称或代号必须唯一")

    # 2. Create Instruction
    new_inst = Instruction(
        id=i_id,
        device_code=inst.device_code,
        code=inst.code,
        name=inst.name,
        description=inst.description,
        type=inst.type
    )
    db.add(new_inst)
    db.commit()
    
    # 2. Save Fields
    if inst.fields:
        for f in inst.fields:
            save_field_flat(db, f, i_id)
        db.commit()
    
    db.refresh(new_inst)
    
    return serialize_instruction(new_inst)

@router.put("/{id}", response_model=InstructionResponse)
def update_instruction(id: str, updates: InstructionUpdate, db: Session = Depends(get_db)):
    db_inst = db.query(Instruction).filter(Instruction.id == id).first()
    if not db_inst:
        raise HTTPException(status_code=404, detail="Not Found")
    
    # Uniqueness Check (Exclude self)
    existing = db.query(Instruction).filter(
        or_(Instruction.name == updates.name, Instruction.code == updates.code),
        Instruction.id != id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="指令名称或代号必须唯一")

    # Update Metadata
    db_inst.device_code = updates.device_code
    db_inst.name = updates.name
    db_inst.code = updates.code
    db_inst.description = updates.description
    db_inst.type = updates.type
    
    # Update Tree (Full Replace Strategy)
    db.query(InstructionField).filter(InstructionField.instruction_id == id).delete()
    
    if updates.fields:
        for f in updates.fields:
            save_field_flat(db, f, id)
    
    db.commit()
    db.refresh(db_inst)
    return serialize_instruction(db_inst)

@router.delete("/{id}")
def delete_instruction(id: str, db: Session = Depends(get_db)):
    db_inst = db.query(Instruction).filter(Instruction.id == id).first()
    if not db_inst:
        raise HTTPException(status_code=404, detail="Not Found")
    
    db.delete(db_inst)
    db.commit()
    return {"status": "deleted", "id": id}
