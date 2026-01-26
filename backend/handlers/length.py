from typing import Dict, List, Tuple
from backend.handlers.base import LogicHandler
from backend.schemas.block import Block

class LengthHandler(LogicHandler):
    def calculate(self, block: Block, flattened_blocks: List[Tuple[str, Block]]) -> str:
        if not block.config:
            return "00" * block.byte_length
            
        start_id = block.config.target_start_id
        end_id = block.config.target_end_id
        offset = int(block.config.params.get("offset", 0))

        # We need to match Start/End IDs. 
        # CAUTION: The IDs in config might be local or global.
        # GraphEngine resolved this for sorting, but here we scan the linear stream.
        # If IDs are ambiguous, we assume first match? Or we need Global IDs in config.
        # For Phase 2, let's assume if we find the ID, it's the right one (simplification).
        
        count = 0
        in_range = False
        
        for layer_id, b in flattened_blocks:
            # We check if b.id matches start_id. 
            # Ideally we check "{layer_id}:{b.id}" == config_global_id
            # But config might just have "1".
            
            if b.id == start_id:
                in_range = True
            
            if in_range:
                if b.is_enabled and b.id != block.id and b.type != "slot": 
                    # Don't count the length block itself unless needed (rare)
                    # Don't count "slots" (placeholders), only their contents (which are separate blocks in the stream)
                    # Check: flattened_blocks expands Slot contents? Yes, GraphEngine does that.
                    count += b.byte_length
            
            if b.id == end_id:
                in_range = False
                break
                
        total = count + offset
        hex_str = f"{total:0{block.byte_length * 2}X}"
        return hex_str
