from typing import List, Dict, Tuple
from backend.schemas.block import Block, BlockType
from backend.schemas.template import Layer, LayerType
from backend.core.graph import GraphEngine
from backend.handlers.length import LengthHandler
from backend.handlers.checksum import ChecksumHandler

class Processor:
    def __init__(self, layers: List[Layer]):
        self.layers = layers
        self.engine = GraphEngine(layers)
        self.handlers = {
            "length": LengthHandler(),
            "checksum": ChecksumHandler()
        }
        
    def process(self) -> str:
        # 1. Build Flattened Graph & Sort
        self.engine.build_dependency_graph()
        calc_order_result = self.engine.topological_sort() # Returns List[(layer_id, block)] ?? No, check graph.py
        
        # Checking graph.py: topological_sort returns List[Tuple[str, Block]] -> (LayerID, Block)
        # Wait, previous graph.py return List[Block] only?
        # My new graph.py returns sorted_order which contains self.global_id_map[u_gid]
        # global_id_map values are (layer_id, block).
        # So yes, List[Tuple[str, Block]].
        
        calc_order = calc_order_result
        
        # 2. Iterate in Dependency Order
        for layer_id, block in calc_order:
             if block.type in [BlockType.LENGTH, BlockType.CHECKSUM]:
                handler_key = block.type.value
                handler = self.handlers.get(handler_key)
                if handler:
                    # Pass the FLATTENED sequence (from engine) to the handler
                    # Handler needs to scan range in the *original sequence* (which is now flattened)
                    val = handler.calculate(block, self.engine.flattened_blocks)
                    block.hex_value = val
                    
        # 3. Concatenate Final String
        final_hex = []
        for layer_id, b in self.engine.flattened_blocks:
            if b.is_enabled and b.type != "slot":
                val = b.hex_value or ("00" * b.byte_length)
                final_hex.append(val)
                
        return " ".join(final_hex)
