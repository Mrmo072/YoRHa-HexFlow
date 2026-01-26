from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List
import uuid

from backend.db.database import get_db, engine, Base
from backend.db.models import Instruction, InstructionField
from backend.schemas.instruction_api import InstructionCreate, InstructionResponse, InstructionFieldSchema, InstructionUpdate

# Create tables if not exist (Simple migration)
# In prod use Alembic
Base.metadata.create_all(bind=engine)

router = APIRouter(
    prefix="/instructions",
    tags=["instructions"]
)

# HELPER: Recursive Save
def save_field_tree(db: Session, field_data: InstructionFieldSchema, instruction_id: str, parent_id: str = None):
    f_id = field_data.id or str(uuid.uuid4())
    
    db_field = InstructionField(
        id=f_id,
        instruction_id=instruction_id,
        parent_id=parent_id,
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
    db.flush()
    
    # Recurse Children
    if field_data.children:
        for child in field_data.children:
            save_field_tree(db, child, instruction_id, f_id)


@router.get("/", response_model=List[InstructionResponse])
def get_instructions(search: str = None, db: Session = Depends(get_db)):
    query = db.query(Instruction)
    if search:
        query = query.filter(or_(Instruction.name.contains(search), Instruction.code.contains(search)))
    return query.all()

@router.get("/{id}", response_model=InstructionResponse)
def get_instruction_detail(id: str, db: Session = Depends(get_db)):
    inst = db.query(Instruction).filter(Instruction.id == id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Instruction not found")
    
    roots = [f for f in inst.fields if f.parent_id is None]
    
    # Sort
    def sort_tree(nodes):
        nodes.sort(key=lambda x: x.sequence)
        for n in nodes:
            if n.children:
                sort_tree(n.children)
    sort_tree(roots)
    
    return inst

@router.post("/", response_model=InstructionResponse)
def create_instruction(inst: InstructionCreate, db: Session = Depends(get_db)):
    i_id = str(uuid.uuid4())
    
    # 1. Create Instruction
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
            save_field_tree(db, f, i_id, None)
        db.commit()
    
    db.refresh(new_inst)
    
    # Prepare response (fields need sorting probably, but DB order is not guaranteed, relying on sequence)
    roots = [f for f in new_inst.fields if f.parent_id is None]
    
    # Ideally should sort here too
    roots.sort(key=lambda x: x.sequence)
    
    return new_inst # ORM relation should handle fields structure if Schema is correct

@router.put("/{id}", response_model=InstructionResponse)
def update_instruction(id: str, updates: InstructionUpdate, db: Session = Depends(get_db)):
    db_inst = db.query(Instruction).filter(Instruction.id == id).first()
    if not db_inst:
        raise HTTPException(status_code=404, detail="Not Found")
    
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
            save_field_tree(db, f, id, None)
    
    db.commit()
    db.refresh(db_inst)
    return db_inst

@router.delete("/{id}")
def delete_instruction(id: str, db: Session = Depends(get_db)):
    db_inst = db.query(Instruction).filter(Instruction.id == id).first()
    if not db_inst:
        raise HTTPException(status_code=404, detail="Not Found")
    
    db.delete(db_inst)
    db.commit()
    return {"status": "deleted", "id": id}
