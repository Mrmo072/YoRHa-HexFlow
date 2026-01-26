from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List
import uuid

from backend.db.database import get_db, engine, Base
from backend.db.models import Instruction, InstructionField, BitField
from backend.schemas.instruction_api import InstructionCreate, InstructionResponse, InstructionFieldSchema

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
        name=field_data.name, # Was label
        op_code=field_data.op_code,
        config_values=field_data.config_values,
        byte_len=field_data.byte_len, # Was byte_length
        endianness=field_data.endianness
    )
    db.add(db_field)
    db.flush()
    
    # 2. Save BitFields
    for bf in field_data.bit_fields:
        bf_id = bf.id or str(uuid.uuid4())
        db_bf = BitField(
            id=bf_id,
            field_id=f_id,
            bit_name=bf.bit_name, # Was label
            start_bit=bf.start_bit,
            bit_len=bf.bit_len, # Was bit_width
            default_val=bf.default_val
        )
        db.add(db_bf)
    
    # 3. Recurse Children
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
    
    return InstructionResponse(
        id=inst.id,
        code=inst.code,
        opcode_hex=inst.opcode_hex,
        name=inst.name,
        description=inst.description,
        type=inst.type,
        fields=roots
    )

@router.post("/", response_model=InstructionResponse)
def create_instruction(inst: InstructionCreate, db: Session = Depends(get_db)):
    i_id = inst.id or str(uuid.uuid4())
    
    # 1. Create Instruction
    new_inst = Instruction(
        id=i_id,
        code=inst.code or f"CMD-{i_id[:4]}",
        opcode_hex=inst.opcode_hex,
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
    
    roots = [f for f in new_inst.fields if f.parent_id is None]
    return InstructionResponse(
        id=new_inst.id,
        code=new_inst.code,
        opcode_hex=new_inst.opcode_hex,
        name=new_inst.name,
        description=new_inst.description,
        type=new_inst.type,
        fields=roots
    )

@router.put("/{id}", response_model=InstructionResponse)
def update_instruction(id: str, updates: InstructionCreate, db: Session = Depends(get_db)):
    db_inst = db.query(Instruction).filter(Instruction.id == id).first()
    if not db_inst:
        raise HTTPException(status_code=404, detail="Not Found")
    
    # Update Metadata
    db_inst.name = updates.name
    db_inst.code = updates.code
    db_inst.opcode_hex = updates.opcode_hex
    db_inst.description = updates.description
    db_inst.type = updates.type
    
    # Update Tree (Full Replace)
    db.query(InstructionField).filter(InstructionField.instruction_id == id).delete()
    
    for f in updates.fields:
        save_field_tree(db, f, id, None)
    
    db.commit()
    db.refresh(db_inst)
    
    roots = [f for f in db_inst.fields if f.parent_id is None]
    return InstructionResponse(
        id=db_inst.id,
        code=db_inst.code,
        name=db_inst.name,
        description=db_inst.description,
        type=db_inst.type,
        fields=roots
    )

@router.delete("/{id}")
def delete_instruction(id: str, db: Session = Depends(get_db)):
    db_inst = db.query(Instruction).filter(Instruction.id == id).first()
    if not db_inst:
        raise HTTPException(status_code=404, detail="Not Found")
    
    db.delete(db_inst)
    db.commit()
    return {"status": "deleted", "id": id}
