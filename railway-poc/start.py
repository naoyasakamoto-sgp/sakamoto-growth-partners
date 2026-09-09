import os
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"Starting shichiya-sendai-web on Railway PORT={port}", flush=True)
    uvicorn.run("main:app", host="0.0.0.0", port=port)
