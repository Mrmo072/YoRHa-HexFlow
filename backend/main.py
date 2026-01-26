from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from backend.schemas.block import FrameRequest, CompileResponse
from backend.core.graph import GraphEngine

app = FastAPI(title="HexOrchestrator-YoRHa API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production replace with specific origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "HexOrchestrator Logic Engine Online", "status": "Glory to Mankind"}


from backend.schemas.template import Layer, LayerType
from backend.routers.instruction import router as instruction_router

app.include_router(instruction_router)

# ... existing imports ...

@app.post("/compile", response_model=CompileResponse)
async def compile_frame(request: FrameRequest):
    try:
        from backend.core.orchestrator import Orchestrator
        
        # Phase 3: Recursive Orchestrator
        # request.blocks contains the root forest (Containers/Blocks)
        
        orchestrator = Orchestrator(request.blocks)
        result_hex = orchestrator.process()
        
        # Calculate total binary length (from spaces)
        byte_count = len(result_hex.replace(" ", "")) // 2
        
        debug_info = ["Compiled via Recursive Onion Engine"]
        
        return CompileResponse(
            hex_string=result_hex,
            total_length=byte_count,
            debug_info=debug_info
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
