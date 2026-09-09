import os
import uvicorn

import ticket_pipeline as tp
import ticket_pipeline_patch as patch

patch.apply(tp)
import start_v2

start_v2.APP_VERSION='2.1.0-poc'

if __name__=='__main__':
    uvicorn.run(
        start_v2.main.app,
        host='0.0.0.0',
        port=int(os.environ.get('PORT','8000')),
        proxy_headers=True,
    )
