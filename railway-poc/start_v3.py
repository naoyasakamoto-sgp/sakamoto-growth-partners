import runpy
import ticket_pipeline as tp
import ocr_hotfix

ocr_hotfix.apply(tp)
runpy.run_module('start_v2', run_name='__main__')
