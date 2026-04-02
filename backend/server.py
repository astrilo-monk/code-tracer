from fastapi import FastAPI, APIRouter
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import json
import tempfile
import subprocess
import asyncio
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
from pygdbmi.gdbcontroller import GdbController

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB is optional — only connect if MONGO_URL is set
mongo_url = os.environ.get('MONGO_URL', '')
if mongo_url:
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'ctrace')]
else:
    client = None
    db = None

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- API Endpoints ---
MAX_STEPS = 250

class RunCodeRequest(BaseModel):
    code: str
def compile_code(code: str, tmpdir: str):
    src_path = os.path.join(tmpdir, "program.c")
    bin_path = os.path.join(tmpdir, "program")
    with open(src_path, "w") as f:
        f.write(code)
    result = subprocess.run(
        ["gcc", "-g", "-O0", "-o", bin_path, src_path],
        capture_output=True, text=True, timeout=15
    )
    if result.returncode != 0:
        return None, result.stderr
    return bin_path, None


def infer_type(value):
    if not value:
        return "unknown"
    if value.startswith("0x"):
        return "pointer"
    if value.startswith("{"):
        return "struct"
    if value.startswith('"') or value.startswith("'"):
        return "char"
    try:
        int(value)
        return "int"
    except ValueError:
        pass
    try:
        float(value)
        return "float"
    except ValueError:
        pass
    return "auto"


def run_gdb_trace(bin_path: str, code: str):
    """Breakpoint-based tracing — fast even for recursive code."""
    steps = []
    stdout_buffer = ""
    source_lines = code.split('\n')
    num_lines = len(source_lines)

    try:
        gdbmi = GdbController(command=["gdb", "--nx", "--quiet", "--interpreter=mi3", bin_path])
    except Exception:
        try:
            gdbmi = GdbController(command=["gdb", "--nx", "--quiet", "--interpreter=mi2", bin_path])
        except Exception as e:
            return [], f"Failed to start GDB: {str(e)}"

    def is_exit(responses):
        for r in responses:
            msg = r.get("message", "")
            if r.get("type") == "notify" and "exited" in msg:
                return True
            if r.get("type") == "result" and msg == "error":
                return True
            p = r.get("payload", {})
            if isinstance(p, dict) and p.get("reason", "").startswith("exited"):
                return True
        return False

    def grab_stdout(responses):
        return "".join(
            r.get("payload", "") for r in responses
            if r.get("type") == "target" and r.get("message") == "target-stream-output"
        )

    def frame_info():
        try:
            for r in gdbmi.write("-stack-info-frame", timeout_sec=2):
                if r.get("type") == "result" and r.get("message") == "done":
                    f = r.get("payload", {}).get("frame", {})
                    return int(f.get("line", 0)), f.get("func", "??"), f.get("file", "")
        except Exception:
            pass
        return 0, "??", ""

    def full_stack():
        frames = []
        try:
            for r in gdbmi.write("-stack-list-frames", timeout_sec=2):
                if r.get("type") == "result" and r.get("message") == "done":
                    for fr in r.get("payload", {}).get("stack", []):
                        fd = fr.get("frame", fr) if isinstance(fr, dict) else fr
                        frames.append({
                            "level": fd.get("level", "0"),
                            "func": fd.get("func", "??"),
                            "line": int(fd.get("line", 0)),
                            "file": fd.get("file", ""),
                        })
        except Exception:
            pass
        return frames

    def local_vars():
        variables = []
        try:
            for r in gdbmi.write("-stack-list-variables --all-values", timeout_sec=2):
                if r.get("type") == "result" and r.get("message") == "done":
                    for v in r.get("payload", {}).get("variables", []):
                        nm = v.get("name", "")
                        val = v.get("value", "")
                        variables.append({
                            "name": nm, "value": val,
                            "type": "pointer" if (val and val.startswith("0x")) else infer_type(val),
                        })
        except Exception:
            pass
        return variables

    try:
        # Set breakpoints on every non-trivial source line
        for i, line_text in enumerate(source_lines, 1):
            stripped = line_text.strip()
            if stripped and not stripped.startswith('//') and not stripped.startswith('#') and stripped not in ('{', '}', '};', ''):
                try:
                    gdbmi.write(f"-break-insert program.c:{i}", timeout_sec=1)
                except Exception:
                    pass

        # Run program — stops at first breakpoint
        resps = gdbmi.write("-exec-run", timeout_sec=5)
        if is_exit(resps):
            return steps, None

        MAX_STEP_TIME = 0  # track total time
        import time
        start_time = time.time()

        for step_num in range(MAX_STEPS):
            # Hard time limit of 20 seconds
            if time.time() - start_time > 20:
                break

            line, func, file = frame_info()
            if line == 0:
                break

            # Skip non-user files
            if file and "program.c" not in file:
                resps = gdbmi.write("-exec-continue", timeout_sec=3)
                stdout_buffer += grab_stdout(resps)
                if is_exit(resps):
                    break
                continue

            # Get stack (fast) and variables
            stack = full_stack()
            variables = local_vars()

            heap = []
            for v in variables:
                if v["type"] == "pointer" and v["value"] not in ("0x0", ""):
                    heap.append({
                        "address": v["value"], "type": "allocated",
                        "var_name": v["name"],
                        "fields": [{"name": v["name"], "value": v["value"], "type": "pointer"}],
                        "pointer_to": None,
                    })

            steps.append({
                "step": len(steps),
                "line": line,
                "func": func,
                "variables": variables,
                "stack_frames": stack,
                "heap": heap,
                "stdout": stdout_buffer,
            })

            # Continue to next breakpoint
            resps = gdbmi.write("-exec-continue", timeout_sec=3)
            stdout_buffer += grab_stdout(resps)
            if is_exit(resps):
                break

        return steps, None
    except Exception as e:
        logger.error(f"GDB trace error: {str(e)}")
        return steps, str(e)
    finally:
        try:
            gdbmi.exit()
        except Exception:
            pass


def quick_heap_read(gdbmi, var_name, address, depth=0, visited=None):
    """Quickly read a heap node — limited depth."""
    if visited is None:
        visited = set()
    if depth > 3 or address in visited or address == "0x0":
        return []
    visited.add(address)

    items = []
    try:
        tag = f"h{var_name.replace('->', '_').replace('*', '')}_{depth}"
        resp = gdbmi.write(f"-var-create {tag} * *{var_name}", timeout_sec=2)

        node_type = ""
        num_children = 0
        for r in resp:
            if r.get("type") == "result" and r.get("message") == "done":
                p = r.get("payload", {})
                node_type = p.get("type", "")
                num_children = int(p.get("numchild", "0"))

        node = {"address": address, "type": node_type, "var_name": var_name, "fields": [], "pointer_to": None}

        if num_children > 0:
            ch_resp = gdbmi.write(f"-var-list-children {tag}", timeout_sec=2)
            for cr in ch_resp:
                if cr.get("type") == "result" and cr.get("message") == "done":
                    for child in cr.get("payload", {}).get("children", []):
                        cd = child.get("child", child) if isinstance(child, dict) else child
                        fname = cd.get("exp", "")
                        fval = cd.get("value", "")
                        ftype = cd.get("type", "")
                        node["fields"].append({"name": fname, "value": fval, "type": ftype})
                        if "*" in ftype and fval.startswith("0x") and fval != "0x0":
                            node["pointer_to"] = fval
                            sub = quick_heap_read(gdbmi, f"{var_name}->{fname}", fval, depth + 1, visited)
                            items.extend(sub)

        items.insert(0, node)
        gdbmi.write(f"-var-delete {tag}", timeout_sec=1)
    except Exception:
        pass

    return items


# --- API Endpoints ---

@api_router.get("/")
async def root():
    return {"message": "C Trace API is running"}

@api_router.post("/run")
async def run_code(request: RunCodeRequest):
    """Compile and trace C code through GDB."""
    code = request.code.strip()
    logger.info(f"Run request received ({len(code)} chars)")
    if not code:
        return {"error": "No code provided", "steps": [], "compilation_error": None}

    with tempfile.TemporaryDirectory() as tmpdir:
        bin_path, compile_error = compile_code(code, tmpdir)
        if compile_error:
            logger.info(f"Compilation failed: {compile_error[:200]}")
            return {"error": None, "steps": [], "compilation_error": compile_error}

        loop = asyncio.get_event_loop()
        try:
            steps, trace_error = await asyncio.wait_for(
                loop.run_in_executor(None, run_gdb_trace, bin_path, code),
                timeout=25
            )
        except asyncio.TimeoutError:
            # Kill any lingering GDB processes (Windows-compatible)
            if os.name == 'nt':
                subprocess.run(["taskkill", "/F", "/IM", "gdb.exe"], capture_output=True)
            else:
                subprocess.run(["pkill", "-f", "gdb.*program"], capture_output=True)
            return {"error": "Trace timed out (code may be too complex or recursive). Partial results shown.", "steps": [], "compilation_error": None}
        except Exception as e:
            logger.error(f"Unexpected trace error: {type(e).__name__}: {e}")
            return {"error": str(e), "steps": [], "compilation_error": None}

        logger.info(f"Trace complete: {len(steps)} steps, error={trace_error}")
        return {"error": trace_error, "steps": steps, "compilation_error": None}


# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()
