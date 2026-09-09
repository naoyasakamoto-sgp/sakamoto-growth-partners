import json, os
import uvicorn
from fastapi import Depends, HTTPException
import start_v12, start_v2

main=start_v12.main
APP_VERSION='2.5.1-poc'
_orig=start_v12._persist_candidates

def _persist(c,tx,allow_auto=False):
    r=_orig(c,tx,allow_auto=allow_auto)
    if r.get('status')=='REVIEW':
        c.execute('UPDATE bank_transactions SET matched_contract_id=NULL WHERE id=?',(int(tx['id']),))
    elif r.get('status')=='AUTO_MATCHED' and not allow_auto:
        c.execute("UPDATE bank_transactions SET match_status='REVIEW',matched_contract_id=NULL,confirmed_by=NULL,confirmed_at=NULL WHERE id=?",(int(tx['id']),))
        r=dict(r);r['status']='REVIEW';r['reason']='rebuild_requires_confirmation'
    return r
start_v12._persist_candidates=_persist

def _active(c,txid):
    return c.execute('SELECT * FROM bank_match_actions WHERE bank_transaction_id=? AND reversed_at IS NULL',(txid,)).fetchone()

def _guard(c,txid):
    if _active(c,txid) or c.execute('SELECT 1 FROM payments WHERE bank_transaction_id=?',(txid,)).fetchone():
        raise HTTPException(409,'消込済みです。先に消込取消を実行してください')

def _reprocess():
    start_v12.ensure_matching_schema();counts={'reprocessed':0,'non_customer':0,'review':0,'unmatched':0}
    with main.db() as c:
        start_v12._refresh_expectations(c)
        rows=c.execute("SELECT * FROM bank_transactions WHERE match_status IN ('UNMATCHED','REVIEW','NEW') OR match_status IS NULL").fetchall()
        for row in rows:
            r=start_v12._persist_candidates(c,dict(row),False);counts['reprocessed']+=1
            k=r.get('status','').lower()
            if k in counts:counts[k]+=1
        main.audit(c,'system','system','BANK_MATCH_REBUILD_SAFE','bank','batch',counts)
    return counts
start_v12._reprocess_open_transactions=_reprocess

def rebuild(a=Depends(main.auth)):return _reprocess()
start_v2.replace('/api/bank/rebuild-matches','POST',rebuild)

def reject(txid:int,b:start_v12.NoteAction,a=Depends(main.auth)):
    start_v12.ensure_matching_schema()
    with main.db() as c:
        if not c.execute('SELECT 1 FROM bank_transactions WHERE id=?',(txid,)).fetchone():raise HTTPException(404,'入金が見つかりません')
        _guard(c,txid)
        c.execute("UPDATE bank_transactions SET match_status='REJECTED',matched_contract_id=NULL,match_confidence=0,confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP WHERE id=?",(a['name'],txid))
        c.execute('INSERT INTO bank_match_feedback(bank_transaction_id,action,actor,note) VALUES(?,?,?,?)',(txid,'MATCH_REJECTED',a['name'],b.note))
        main.audit(c,a['name'],a['role'],'BANK_MATCH_REJECTED','bank_transaction',txid,{'note':b.note})
    return {'ok':True,'status':'REJECTED'}

def noncustomer(txid:int,b:start_v12.NoteAction,a=Depends(main.auth)):
    start_v12.ensure_matching_schema()
    with main.db() as c:
        if not c.execute('SELECT 1 FROM bank_transactions WHERE id=?',(txid,)).fetchone():raise HTTPException(404,'入金が見つかりません')
        _guard(c,txid)
        c.execute("UPDATE bank_transactions SET transaction_type='NON_CUSTOMER',match_status='NON_CUSTOMER',matched_contract_id=NULL,match_confidence=0,confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP WHERE id=?",(a['name'],txid))
        c.execute('DELETE FROM bank_match_candidates WHERE bank_transaction_id=?',(txid,))
        c.execute('INSERT INTO bank_match_feedback(bank_transaction_id,action,actor,note) VALUES(?,?,?,?)',(txid,'MARK_NON_CUSTOMER',a['name'],b.note))
        main.audit(c,a['name'],a['role'],'BANK_MARK_NON_CUSTOMER','bank_transaction',txid,{'note':b.note})
    return {'ok':True,'status':'NON_CUSTOMER'}
start_v2.replace('/api/bank/transactions/{txid}/reject','POST',reject)
start_v2.replace('/api/bank/transactions/{txid}/non-customer','POST',noncustomer)

def reverse(txid:int,b:start_v12.NoteAction,a=Depends(main.auth)):
    start_v12.ensure_matching_schema()
    with main.db() as c:
        ar=_active(c,txid)
        if not ar:raise HTTPException(404,'取消可能な消込がありません')
        later=c.execute('SELECT COUNT(*) n FROM bank_match_actions WHERE contract_id=? AND id>? AND reversed_at IS NULL',(ar['contract_id'],ar['id'])).fetchone()['n']
        if later:raise HTTPException(409,'後続入金があるため先に取消できません')
        before=json.loads(ar['before_json'] or '{}');archive=dict(ar)
        if ar['payment_id']:c.execute('DELETE FROM payments WHERE id=?',(ar['payment_id'],))
        c.execute('UPDATE contracts SET next_interest_due_date=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',(before.get('next_interest_due_date'),before.get('status'),ar['contract_id']))
        c.execute('INSERT INTO bank_match_feedback(bank_transaction_id,action,chosen_contract_id,actor,note,details) VALUES(?,?,?,?,?,?)',(txid,'PAYMENT_REVERSED',ar['contract_id'],a['name'],b.note,json.dumps({'archived_action':archive},ensure_ascii=False)))
        c.execute('DELETE FROM bank_match_actions WHERE id=?',(ar['id'],))
        c.execute("UPDATE bank_transactions SET match_status='REVIEW',matched_contract_id=NULL,confirmed_by=NULL,confirmed_at=NULL WHERE id=?",(txid,))
        start_v12._refresh_expectations(c,int(ar['contract_id']))
        start_v12._persist_candidates(c,dict(c.execute('SELECT * FROM bank_transactions WHERE id=?',(txid,)).fetchone()),False)
        main.audit(c,a['name'],a['role'],'BANK_PAYMENT_REVERSED','bank_transaction',txid,{'contract_id':ar['contract_id'],'note':b.note})
    return {'ok':True,'status':'REVIEW'}
start_v2.replace('/api/bank/transactions/{txid}/reverse','POST',reverse)

def stats(a=Depends(main.auth)):
    start_v12.ensure_matching_schema()
    with main.db() as c:
        counts={x['s']:x['n'] for x in c.execute("SELECT COALESCE(match_status,'NEW') s,COUNT(*) n FROM bank_transactions GROUP BY COALESCE(match_status,'NEW')").fetchall()}
        rev=c.execute("SELECT COUNT(*) n FROM bank_match_feedback WHERE action='PAYMENT_REVERSED'").fetchone()['n']
        return {'matching_version':start_v12.MATCHING_VERSION,'counts':counts,'reversals':rev,'auto_match_precision_target':0.999,'precision_measured':False}
start_v2.replace('/api/bank/match-stats','GET',stats)

main.HTML=main.HTML.replace('v2.5.0-poc',APP_VERSION)
def health():
    x=start_v12.health_v250();x.update({'version':APP_VERSION,'bank_matching_integrity':'2.5.1','review_candidate_fk_separated':True,'operator_decision_ledger_guard':True,'reconfirm_after_reversal':True});return x
start_v2.replace('/api/health','GET',health)

if __name__=='__main__':uvicorn.run(main.app,host='0.0.0.0',port=int(os.environ.get('PORT','8000')),proxy_headers=True)
