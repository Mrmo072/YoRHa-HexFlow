from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ProtocolNodeSchema(BaseModel):
    id: str
    label: str
    type: str
    byte_length: int = 0
    hex_value: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    children: List['ProtocolNodeSchema'] = Field(default_factory=list)

    class Config:
        from_attributes = True


ProtocolNodeSchema.model_rebuild()


class ProtocolBase(BaseModel):
    label: str
    type: str = "container"
    description: Optional[str] = None
    children: List[ProtocolNodeSchema] = Field(default_factory=list)


class ProtocolCreate(ProtocolBase):
    id: Optional[str] = None


class ProtocolUpdate(ProtocolBase):
    pass


class ProtocolResponse(ProtocolBase):
    id: str

    class Config:
        from_attributes = True
