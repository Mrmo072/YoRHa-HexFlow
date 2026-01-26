from typing import List, Tuple, Dict
from backend.schemas.block import Block, BlockType
from backend.schemas.template import Layer
from backend.core.graph import GraphEngine
from backend.handlers.length import LengthHandler
from backend.handlers.checksum import ChecksumHandler
# from backend.handlers.escape import EscapeHandler (To be implemented)

class Orchestrator:
    def __init__(self, root_blocks: List[Block]):
        """
        root_blocks: A list of Blocks, which may be CONTAINERS with children.
        Onion Model: We treat this as a forest of trees.
        """
        self.root_blocks = root_blocks
        self.handlers = {
            "length": LengthHandler(),
            "checksum": ChecksumHandler()
        }
        # Flat stream for final global addressing if needed
        self.flattened_stream: List[Block] = [] 

    def process(self) -> str:
        # Phase 1: Deep Calculation (Onion Model)
        # We traverse Post-Order (Children first) to calculate inner values.
        for block in self.root_blocks:
            self._process_recursive(block)
            
        # Phase 2: Flattening
        self.flattened_stream = []
        for block in self.root_blocks:
            self._flatten_recursive(block)
            
        # Phase 3: Global Dependencies (Cross-Layer Checksums)
        # Some checksums might reference IDs across the tree.
        # If we need topological sort on the flattened graph, we do it here.
        # For simplicity in Phase 3, we assume "Onion" order covers most cases:
        # Container Length depends on Children (Calculated in Phase 1)
        # Container Checksum depends on Children (Calculated in Phase 1)
        # If a sibling depends on a sibling, we might need a pass.
        # Let's run a "Horizontal Pass" on the flattened stream for any unresolved logic.
        
        # NOTE: Handlers like Checksum need to scan the "flattened context" to find Start/End IDs.
        # So we update the Hex Values based on the now-populated children.
        
        # We iterate the flattened stream again?
        # Yes, because a Checksum might cover a range of siblings.
        # AND it might cover children.
        
        # Since we already calculated Children in Phase 1, their hex_values are ready.
        # Now we calculate the Parents/Siblings that depend on ranges.
        
        # We can re-use GraphEngine logic here if we flatten first? 
        # But GraphEngine sorts by dependency. 
        # For the "Onion", the dependency is structural (Parent depends on Child).
        # Implicitly, if we process Children first, Parent is happy.
        
        # But what about "Length" block at Start of Container?
        # It needs to know the length of valid siblings/children.
        
        # Strategy:
        # 1. Recursive Depth-First Post-Order Traversal.
        #    - Visit Children.
        #    - When returning to Parent (Container), calculate its "Self" logic if it aggregates children.
        #      (Container Length is usually sum of children byte_length).
        
        # 2. Linear Scan of any remaining logic (like CRC at end of frame).
        
        # Let's perform a re-calculation pass on the flattened stream
        # This allows "Length" block at index 0 to calculate sum of index 1..N
        
        # We need a way to map IDs to Blocks in the flattened list.
        # Make a temporary Tuple list for Handlers
        flat_tuples = [("global", b) for b in self.flattened_stream]
        
        for block in self.flattened_stream:
            if block.type in [BlockType.LENGTH, BlockType.CHECKSUM]:
                 handler_key = block.type
                 # mapped strings in schema might differ from enum, be careful
                 if isinstance(block.type, BlockType):
                     handler_key = block.type.value
                 
                 handler = self.handlers.get(handler_key)
                 if handler:
                     # Calculate using the flattened context
                     val = handler.calculate(block, flat_tuples)
                     block.hex_value = val

        # Phase 4: Final Hex Generation & Escaping
        final_hex = []
        for b in self.flattened_stream:
             if b.is_enabled and b.type != BlockType.SLOT:
                 val = b.hex_value or ("00" * b.byte_length)
                 
                 # ESCAPING LOGIC (Placeholder for now)
                 # val = self.escape_handler.process(val)
                 
                 final_hex.append(val)
                 
        return " ".join(final_hex)

    def _process_recursive(self, block: Block):
        # 1. Process Children
        if block.children:
            for child in block.children:
                self._process_recursive(child)
        
        # 2. Logic for Container itself?
        # Usually containers don't have a value themselves, they are wrappers.
        # But if the Block is a "Fixed" block, it has value.
        pass

    def _flatten_recursive(self, block: Block):
        # Flatten: Self, then Children (or Children then Self? No, usually structure is explicit blocks)
        # Wait, the "Container" block in the UI might just be a grouper.
        # But in a Packet, "Header" is a child, "Payload" is a child.
        # The Container ITSELF might not emit bytes unless it's a wrapper concept.
        
        # User Requirement: "Container Block ... can wrap Atomic Blocks".
        # If Container is just a Folder, it emits nothing.
        # If Container is a Frame, it usually has its own Header/Tail defined in config?
        # Or the Header/Tail are Child Blocks?
        
        # Requirement says: "Default... Transport Layer > Packaging Layer".
        # These are likely Containers.
        # We assume Containers are just groupings. The atomic blocks inside generate bytes.
        
        # But if the Container has "is_container=True", does it emit bytes?
        # Strategy: Flatten strictly adds Children to stream. 
        # If the Container Block itself serves as a "Header" (unlikely), it would be an atomic block.
        # We assume Block Structure is:
        # Container(
        #    HeaderBlock,
        #    LengthBlock,
        #    PayloadContainer(...),
        #    CRCBlock
        # )
        # So we just flatten the children in order.
        
        if block.is_container:
            for child in block.children:
                self._flatten_recursive(child)
        else:
            self.flattened_stream.append(block)
