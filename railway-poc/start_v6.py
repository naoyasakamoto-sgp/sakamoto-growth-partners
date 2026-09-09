from __future__ import annotations

import os

import uvicorn

import extraction_orchestrator as eo
import start_v5
import orchestrator_patch_v8_2 as gt_patch

gt_patch.apply(eo)

main = start_v5.main
start_v5.start_v4.APP_VERSION = "2.2.2-poc"

# Update the visible footer/build label without changing the existing workflow.
main.HTML = main.HTML.replace("v2.2.1-poc | Orchestrator v8.1", "v2.2.2-poc | Orchestrator v8.2")

if __name__ == "__main__":
    uvicorn.run(main.app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), proxy_headers=True)
