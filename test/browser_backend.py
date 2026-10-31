"""Isolated HTTP service for browser tests; never writes to the application database."""
import os
import sys
import tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
with tempfile.TemporaryDirectory(dir=ROOT/'test',prefix='browser-backend-') as directory:
    os.environ['AEGISYN_DATA_DIR']=directory
    os.environ['AEGISYN_DB_PATH']=str(Path(directory)/'analysis.db')
    import uvicorn
    try:
        uvicorn.run('server.main:app',host='127.0.0.1',port=int(os.environ.get('AEGISYN_TEST_PORT','8001')),log_level='warning')
    finally:
        assert Path(directory).resolve().is_relative_to(ROOT/'test')
