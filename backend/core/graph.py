from typing import List, Dict, Any, Optional, Tuple, Set
import networkx as nx
from collections import defaultdict, deque
import logging
from backend.schemas.block import Block, BlockType
from backend.schemas.template import Layer, LayerType

logger = logging.getLogger(__name__)

class GraphEngine:
    def __init__(self, layers: List[Layer]):
        """
        layers: Ordered list of layers (e.g., [Template, Instruction]). 
        The order determines the 'wrapping' sequence if relevant, but primarily we flatten them.
        """
        self.layers = layers
        self.flattened_blocks: List[Tuple[str, Block]] = [] # (LayerID, Block)
        self.global_id_map: Dict[str, Tuple[str, Block]] = {} # GlobalID -> (LayerID, Block)
        self.adj_list = defaultdict(list)
        self.in_degree = defaultdict(int)
        
    def flatten_layers(self):
        """
        Flattens multiple layers into a single virtual sequence.
        Global ID format: "{layer_id}:{block_id}"
        """
        self.flattened_blocks = []
        self.global_id_map = {}
        
        # In a real wrapping scenario, we might need to insert the Instruction INTO the Template's slot.
        # For Phase 2, let's assume a simpler model: We just concatenate or merge based on potential slots.
        # If there are slots, we need to respect them.
        
        # Strategy:
        # Iterate through the Template (Layer 1).
        # If we hit a Slot, inject the Instruction (Layer 2) blocks there.
        # Otherwise, add Template block.
        
        # We need to identify which layer is which.
        template_layer = next((l for l in self.layers if l.type == LayerType.TEMPLATE), None)
        instruction_layer = next((l for l in self.layers if l.type == LayerType.INSTRUCTION), None)
        
        if not template_layer:
            # Fallback for simple instruction-only mode
             for layer in self.layers:
                for block in layer.blocks:
                    gid = f"{layer.id}:{block.id}"
                    self.flattened_blocks.append((layer.id, block))
                    self.global_id_map[gid] = (layer.id, block)
             return

        # Template Mode
        for t_block in template_layer.blocks:
            if t_block.type == "slot":
                # Inject Instruction Here
                if instruction_layer:
                    for i_block in instruction_layer.blocks:
                        gid = f"{instruction_layer.id}:{i_block.id}"
                        self.flattened_blocks.append((instruction_layer.id, i_block))
                        self.global_id_map[gid] = (instruction_layer.id, i_block)
            else:
                 gid = f"{template_layer.id}:{t_block.id}"
                 self.flattened_blocks.append((template_layer.id, t_block))
                 self.global_id_map[gid] = (template_layer.id, t_block)

    def build_dependency_graph(self):
        self.flatten_layers()
        
        # Initialize in-degree
        for gid in self.global_id_map:
            self.in_degree[gid] = 0
            
        # Analyze dependencies
        for layer_id, block in self.flattened_blocks:
            current_gid = f"{layer_id}:{block.id}"
            
            if block.config and (block.type == BlockType.CHECKSUM or block.type == BlockType.LENGTH):
                start_id = block.config.target_start_id
                end_id = block.config.target_end_id
                
                # These IDs might be local (just "1") or global ("LayerA:1").
                # We need to resolve them to Global IDs.
                # If the User Config provides local IDs, we assume they refer to the SAME layer unless specified?
                # Actually, specialized "Cross-Layer" blocks might need to specify layer.
                # OR, we assume the Start/End IDs provided by frontend are already Global IDs?
                # Given the UI complexity, the UI likely passes what it knows.
                # Let's assume the UI passes Local IDs for now if they are within the same layer, 
                # but if we are wrapping, we might need a smarter resolution.
                
                # STRATEGY: 
                # If IDs are simple, assume they are in the flattened stream.
                # We search the flattened stream for the "Start" and "End" blocks.
                # This works if Block IDs are unique across layers OR if we rely on the flattened context.
                # But Block IDs (1, 2, 3) collide.
                
                # CRITICAL FIX: The Block Config must store GLOBAL IDs or we must infer them.
                # In the "Blueprint" page, the user defines the template. They select "Header" as start.
                # That "Header" has a Template-scope ID.
                # When we compile, we must map that Template-scope ID to the runtime Global ID.
                
                # Resolution:
                # 1. Try to find start_id in the current layer.
                # 2. If not found, look in other layers (ambiguous?).
                
                # Let's try to resolve to Global ID:
                global_start = self._resolve_to_global(start_id, layer_id)
                global_end = self._resolve_to_global(end_id, layer_id)
                
                if global_start and global_end:
                     dependencies = self._resolve_range_global(global_start, global_end)
                     for dep_gid in dependencies:
                         self.adj_list[dep_gid].append(current_gid)
                         self.in_degree[current_gid] += 1

    def _resolve_to_global(self, local_id: str, current_layer_id: str) -> Optional[str]:
        # Simple attempt: Prefix with current layer
        gid = f"{current_layer_id}:{local_id}"
        if gid in self.global_id_map:
            return gid
            
        # If not in current layer, search others (e.g. Checksum in Template referring to Instruction block?)
        # This is risky without explicit UI support.
        # For now, assume Logic Links are Intra-Layer, BUT because of flattening, 
        # a Checksum (Template) covering a Slot (Template) implicitly covers the Expanded Instruction.
        
        # Wait, if Checksum covers Start=Header(T) and End=Tail(T), and Slot is between them...
        # The flattened range includes the instruction!
        # So we just need to resolve the Anchors.
        return None

    def _resolve_range_global(self, start_gid: str, end_gid: str) -> List[str]:
        deps = []
        in_range = False
        found_start = False
        
        for layer_id, block in self.flattened_blocks:
            gid = f"{layer_id}:{block.id}"
            
            if gid == start_gid:
                in_range = True
                found_start = True
            
            if in_range:
                if block.type != BlockType.CALCULATED and block.type != "slot":
                    deps.append(gid)
            
            if gid == end_gid:
                in_range = False
                break
                
        return deps

    def topological_sort(self) -> List[Tuple[str, Block]]:
        queue = deque()
        for gid in self.global_id_map:
            if self.in_degree[gid] == 0:
                queue.append(gid)
                
        sorted_order = []
        visited = 0
        
        while queue:
            u_gid = queue.popleft()
            sorted_order.append(self.global_id_map[u_gid])
            visited += 1
            
            for v_gid in self.adj_list[u_gid]:
                self.in_degree[v_gid] -= 1
                if self.in_degree[v_gid] == 0:
                    queue.append(v_gid)
                    
        if visited != len(self.global_id_map):
             # Cycle logic
             pass
             
        # Return flattened list in calculation order
        return sorted_order
