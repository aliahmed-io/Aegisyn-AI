"""Build a compact generated demo with model-verified severity diversity.

Synthetic interpolations are selected by actual Random Forest probabilities.
No stored prediction is adjusted to force a severity band.
"""
from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd
from ml.train_models import ALL_FEATURES, FEATURE_NUMERIC
ROOT=Path(__file__).resolve().parent.parent

def build_demo():
    source=pd.read_csv(ROOT/'data/unsw_nb15_sample.csv')
    model=joblib.load(ROOT/'models/random_forest.joblib')
    rng=np.random.default_rng(41)
    benign=source[source.label==0].reset_index(drop=True)
    malicious=source[source.label==1].reset_index(drop=True)
    a=benign.iloc[rng.integers(0,len(benign),8192)].reset_index(drop=True)
    b=malicious.iloc[rng.integers(0,len(malicious),8192)].reset_index(drop=True)
    candidates=a.copy()
    mix=rng.uniform(0,1,(len(a),len(FEATURE_NUMERIC)))
    candidates[FEATURE_NUMERIC]=a[FEATURE_NUMERIC].to_numpy()*(1-mix)+b[FEATURE_NUMERIC].to_numpy()*mix
    integer_columns=['sbytes','dbytes','spkts','dpkts','sttl','dttl','ct_srv_src','ct_srv_dst','ct_dst_ltm','ct_src_ltm']
    candidates[integer_columns]=candidates[integer_columns].round().astype(int)
    # Preserve categorical and metadata values from the generated source.
    p=model.predict_proba(candidates[ALL_FEATURES])[:,list(model.classes_).index(1)]
    bands={'low':(p<.4,24),'medium':((p>=.5)&(p<.65),16),'high':((p>=.65)&(p<.85),12),'critical':(p>=.85,12)}
    selected=[]
    for name,(mask,count) in bands.items():
        indexes=np.flatnonzero(mask)
        if len(indexes)<count:
            raise RuntimeError(f'Only {len(indexes)} candidates in {name}; need {count}.')
        # Spread examples across each band's probability range.
        ordered=indexes[np.argsort(p[indexes])]
        selected.extend(ordered[np.linspace(0,len(ordered)-1,count).astype(int)].tolist())
    result=candidates.iloc[selected].copy().reset_index(drop=True)
    result=result.drop(columns=['label','attack_cat'],errors='ignore')
    result['id']=[f'DEMO-{i+1:03d}' for i in range(len(result))]
    result['record_index']=np.arange(1,len(result)+1)
    # Interleave bands for a varied replay from the first seconds.
    order=[]
    groups=[list(range(0,24)),list(range(24,40)),list(range(40,52)),list(range(52,64))]
    while any(groups):
        for group in groups:
            if group:order.append(group.pop(0))
    result=result.iloc[order].reset_index(drop=True)
    output=ROOT/'fixtures'/'demo-flows.csv'
    result.to_csv(output,index=False,float_format='%.12g')
    verified=pd.read_csv(output)
    scores=model.predict_proba(verified[ALL_FEATURES])[:,list(model.classes_).index(1)]
    counts={'low':int((scores<.4).sum()),'medium':int(((scores>=.4)&(scores<.65)).sum()),'high':int(((scores>=.65)&(scores<.85)).sum()),'critical':int((scores>=.85).sum())}
    assert counts=={'low':24,'medium':16,'high':12,'critical':12},counts
    assert int((scores>=.5).sum())==40
    (ROOT/'fixtures'/'demo-manifest.json').write_text(json.dumps({'description':'Generated flow examples, not a real capture.','model':'random_forest','records':len(result),'flaggedRecords':40,'severityCounts':counts},indent=2)+'\n')
    print('Verified compact demo:',counts,'flagged:',int((scores>=.5).sum()))

if __name__=='__main__':build_demo()
