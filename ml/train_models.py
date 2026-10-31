"""
Aegisyn AI - ML Training & Evaluation Pipeline
Trains Logistic Regression (Baseline), Random Forest, and HistGradientBoosting
on UNSW-NB15 flow features, computes rigorous evaluation metrics, and saves model artifacts.
"""

import os
import json
import time
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, confusion_matrix,
    roc_curve, precision_recall_curve
)
from sklearn.inspection import permutation_importance
from ml.dataset import generate_unsw_nb15_dataset

FEATURE_NUMERIC = [
    'dur', 'sbytes', 'dbytes', 'spkts', 'dpkts', 'sttl', 'dttl',
    'sload', 'dload', 'smeansz', 'dmeansz', 'sjit', 'djit',
    'tcprtt', 'synack', 'ackdat', 'ct_srv_src', 'ct_srv_dst',
    'ct_dst_ltm', 'ct_src_ltm'
]

FEATURE_CATEGORICAL = ['proto', 'service', 'state']

ALL_FEATURES = FEATURE_NUMERIC + FEATURE_CATEGORICAL

FEATURE_DESCRIPTIONS = {
    'dur': 'Record total flow duration in seconds',
    'sbytes': 'Source to destination transaction bytes',
    'dbytes': 'Destination to source transaction bytes',
    'spkts': 'Source to destination packet count',
    'dpkts': 'Destination to source packet count',
    'sttl': 'Source to destination time to live value',
    'dttl': 'Destination to source time to live value',
    'sload': 'Source bits per second rate',
    'dload': 'Destination bits per second rate',
    'smeansz': 'Mean packet size transmitted by source',
    'dmeansz': 'Mean packet size transmitted by destination',
    'sjit': 'Source jitter in milliseconds',
    'djit': 'Destination jitter in milliseconds',
    'tcprtt': 'TCP connection setup round-trip time (RTT)',
    'synack': 'TCP setup time between SYN and SYN-ACK packets',
    'ackdat': 'TCP setup time between SYN-ACK and ACK packets',
    'ct_srv_src': 'Connections containing the same service and source IP in 100 records',
    'ct_srv_dst': 'Connections containing the same service and destination IP in 100 records',
    'ct_dst_ltm': 'Connections to the same destination IP in 100 records',
    'ct_src_ltm': 'Connections from the same source IP in 100 records',
    'proto': 'Transport layer protocol (TCP, UDP, ICMP)',
    'service': 'Network service / port mapping (http, ssl, dns, ftp)',
    'state': 'TCP state machine status (FIN, CON, INT)'
}

def train_and_evaluate_all():
    os.makedirs('models', exist_ok=True)
    os.makedirs('data', exist_ok=True)
    
    csv_path = 'data/unsw_nb15_sample.csv'
    if not os.path.exists(csv_path):
        df = generate_unsw_nb15_dataset(5000)
        df.to_csv(csv_path, index=False)
    else:
        df = pd.read_csv(csv_path)
        
    print(f"Loaded dataset: {len(df)} records. Malicious ratio: {df['label'].mean():.2%}")
    
    X = df[ALL_FEATURES]
    y = df['label'].values
    
    # 70% Train, 15% Validation, 15% Test
    X_train_val, X_test, y_train_val, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42, stratify=y
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_val, y_train_val, test_size=0.1765, random_state=42, stratify=y_train_val
    )
    
    print(f"Partitions: Train={len(X_train)}, Val={len(X_val)}, Test={len(X_test)}")
    
    # Preprocessor
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), FEATURE_NUMERIC),
            ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), FEATURE_CATEGORICAL)
        ]
    )
    
    models_to_train = {
        'logistic_regression': {
            'name': 'Logistic Regression (L2 Regularized)',
            'type': 'Linear Classifier',
            'version': '1.0.0-baseline',
            'is_baseline': True,
            'estimator': LogisticRegression(max_iter=1000, random_state=42)
        },
        'random_forest': {
            'name': 'Random Forest Classifier',
            'type': 'Ensemble (Bagging)',
            'version': '2.1.0',
            'is_baseline': False,
            'estimator': RandomForestClassifier(n_estimators=100, max_depth=12, random_state=42, n_jobs=-1)
        },
        'hist_gradient_boosting': {
            'name': 'HistGradientBoosting (LightGBM Architecture)',
            'type': 'Ensemble (Boosting)',
            'version': '2.4.0',
            'is_baseline': False,
            'estimator': HistGradientBoostingClassifier(max_iter=100, max_depth=8, random_state=42)
        }
    }
    
    all_metrics = {}
    
    for model_key, meta in models_to_train.items():
        print(f"\n--- Training {meta['name']} ---")
        pipeline = Pipeline([
            ('preprocessor', preprocessor),
            ('classifier', meta['estimator'])
        ])
        
        start_t = time.time()
        pipeline.fit(X_train, y_train)
        train_time = time.time() - start_t
        
        # Probability calibration with cross-validation
        calibrated = CalibratedClassifierCV(estimator=pipeline, method='sigmoid', cv=3)
        calibrated.fit(X_train_val, y_train_val)
        
        # Test evaluation & inference latency measurement
        start_inf = time.time()
        y_pred = calibrated.predict(X_test)
        y_prob = calibrated.predict_proba(X_test)[:, 1]
        inf_latency_ms = ((time.time() - start_inf) / len(X_test)) * 1000
        
        # Metrics
        acc = float(accuracy_score(y_test, y_pred))
        prec = float(precision_score(y_test, y_pred, zero_division=0))
        rec = float(recall_score(y_test, y_pred, zero_division=0))
        f1 = float(f1_score(y_test, y_pred, zero_division=0))
        roc_auc = float(roc_auc_score(y_test, y_prob))
        pr_auc = float(average_precision_score(y_test, y_prob))
        
        cm = confusion_matrix(y_test, y_pred)
        cm_tn, cm_fp, cm_fn, cm_tp = cm.ravel()
        fpr = float(cm_fp / (cm_fp + cm_tn)) if (cm_fp + cm_tn) > 0 else 0.0
        fnr = float(cm_fn / (cm_fn + cm_tp)) if (cm_fn + cm_tp) > 0 else 0.0
        
        # ROC and PR curves sample points (downsampled for clean transfer)
        fpr_pts, tpr_pts, _ = roc_curve(y_test, y_prob)
        rec_pts, prec_pts, _ = precision_recall_curve(y_test, y_prob)
        
        roc_curve_sampled = [
            {'fpr': round(float(fpr_pts[idx]), 4), 'tpr': round(float(tpr_pts[idx]), 4)}
            for idx in np.linspace(0, len(fpr_pts) - 1, min(25, len(fpr_pts))).astype(int)
        ]
        
        pr_curve_sampled = [
            {'recall': round(float(rec_pts[idx]), 4), 'precision': round(float(prec_pts[idx]), 4)}
            for idx in np.linspace(0, len(rec_pts) - 1, min(25, len(rec_pts))).astype(int)
        ]
        
        prob_true, prob_pred = calibration_curve(y_test, y_prob, n_bins=10)
        calib_curve_sampled = [
            {'meanPredicted': round(float(p_pred), 4), 'fractionOfPositives': round(float(p_true), 4)}
            for p_true, p_pred in zip(prob_true, prob_pred)
        ]
        
        # Feature importances
        feature_names = []
        if hasattr(pipeline.named_steps['preprocessor'], 'get_feature_names_out'):
            feature_names = list(pipeline.named_steps['preprocessor'].get_feature_names_out())
        
        importances_list = []
        if hasattr(meta['estimator'], 'feature_importances_'):
            raw_imp = meta['estimator'].feature_importances_
            # Aggregate back to original high-level features
            feature_imp_dict = {}
            for fn, imp in zip(feature_names, raw_imp):
                base_col = fn.split('__')[-1].split('_')[0]
                feature_imp_dict[base_col] = feature_imp_dict.get(base_col, 0.0) + float(imp)
            
            sorted_imp = sorted(feature_imp_dict.items(), key=lambda x: x[1], reverse=True)[:8]
            for col, imp in sorted_imp:
                importances_list.append({
                    'feature': col,
                    'importance': round(imp, 4),
                    'description': FEATURE_DESCRIPTIONS.get(col, 'Network telemetry attribute')
                })
        elif hasattr(meta['estimator'], 'coef_'):
            # Linear model coefficients
            coefs = np.abs(meta['estimator'].coef_[0])
            sorted_idx = np.argsort(coefs)[::-1][:8]
            for idx in sorted_idx:
                fn = feature_names[idx] if idx < len(feature_names) else f"feature_{idx}"
                base_col = fn.split('__')[-1].split('_')[0]
                importances_list.append({
                    'feature': base_col,
                    'importance': round(float(coefs[idx]) / float(np.sum(coefs)), 4),
                    'description': FEATURE_DESCRIPTIONS.get(base_col, 'Network telemetry attribute')
                })
        else:
            # Fallback using permutation importance on validation set
            perm = permutation_importance(pipeline, X_val, y_val, n_repeats=3, random_state=42)
            perm_imp = perm.importances_mean
            sorted_idx = np.argsort(perm_imp)[::-1][:8]
            for idx in sorted_idx:
                col = ALL_FEATURES[idx]
                importances_list.append({
                    'feature': col,
                    'importance': round(max(0.0, float(perm_imp[idx])), 4),
                    'description': FEATURE_DESCRIPTIONS.get(col, 'Network telemetry attribute')
                })
        
        model_data = {
            'id': model_key,
            'name': meta['name'],
            'type': meta['type'],
            'version': meta['version'],
            'isBaseline': meta['is_baseline'],
            'accuracy': round(acc, 4),
            'precision': round(prec, 4),
            'recall': round(rec, 4),
            'f1Score': round(f1, 4),
            'rocAuc': round(roc_auc, 4),
            'prAuc': round(pr_auc, 4),
            'falsePositiveRate': round(fpr, 4),
            'falseNegativeRate': round(fnr, 4),
            'inferenceLatencyMs': round(inf_latency_ms, 3),
            'trainSamples': len(X_train),
            'testSamples': len(X_test),
            'confusionMatrix': {
                'truePositive': int(cm_tp),
                'falsePositive': int(cm_fp),
                'trueNegative': int(cm_tn),
                'falseNegative': int(cm_fn)
            },
            'featureImportances': importances_list,
            'rocCurve': roc_curve_sampled,
            'prCurve': pr_curve_sampled,
            'calibrationCurve': calib_curve_sampled
        }
        
        all_metrics[model_key] = model_data
        joblib.dump(calibrated, f"models/{model_key}.joblib")
        print(f"Saved: models/{model_key}.joblib | Accuracy: {acc:.4f} | F1: {f1:.4f} | Latency: {inf_latency_ms:.3f}ms")
    
    with open('models/metrics.json', 'w') as f:
        json.dump(all_metrics, f, indent=2)
        
    feature_meta = {
        'numeric': FEATURE_NUMERIC,
        'categorical': FEATURE_CATEGORICAL,
        'all': ALL_FEATURES,
        'descriptions': FEATURE_DESCRIPTIONS
    }
    with open('models/features.json', 'w') as f:
        json.dump(feature_meta, f, indent=2)
        
    print("\n[SUCCESS] Model training complete. All artifacts saved to models/ directory.")
    return all_metrics

if __name__ == '__main__':
    train_and_evaluate_all()
