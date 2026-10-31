"""
SQLite Database and ORM layer for Aegisyn AI
Stores imported datasets, analysis jobs, classified observations,
incidents, analyst notes, and generated security audit reports.
"""

import sqlite3
import json
import os
from typing import List, Dict, Any, Optional

DB_PATH = os.environ.get("AEGISYN_DB_PATH", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "aegisyn.db"))

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Datasets
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS datasets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        filename TEXT NOT NULL,
        uploaded_at TEXT NOT NULL,
        total_records INTEGER NOT NULL,
        benign_count INTEGER NOT NULL,
        malicious_count INTEGER NOT NULL,
        size_bytes INTEGER NOT NULL,
        columns_json TEXT NOT NULL,
        missing_values_json TEXT NOT NULL,
        class_balance_ratio REAL NOT NULL
    );
    """)
    
    # Analysis Jobs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS analysis_jobs (
        id TEXT PRIMARY KEY,
        dataset_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL NOT NULL,
        total_records INTEGER NOT NULL,
        processed_records INTEGER NOT NULL,
        malicious_count INTEGER NOT NULL,
        benign_count INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
    );
    """)
    
    # Classified Observations / Sonar Events
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sonar_events (
        id TEXT PRIMARY KEY,
        analysis_id TEXT NOT NULL,
        record_index INTEGER NOT NULL,
        timestamp TEXT,
        src_ip TEXT NOT NULL,
        dst_ip TEXT NOT NULL,
        protocol TEXT NOT NULL,
        port INTEGER NOT NULL,
        service TEXT,
        flow_duration REAL NOT NULL,
        source_bytes INTEGER NOT NULL,
        destination_bytes INTEGER NOT NULL,
        total_packets INTEGER NOT NULL,
        predicted_malicious INTEGER NOT NULL,
        malicious_probability REAL NOT NULL,
        severity TEXT NOT NULL,
        attack_category TEXT NOT NULL,
        country TEXT NOT NULL,
        angle REAL NOT NULL,
        radius REAL NOT NULL,
        elevation REAL NOT NULL,
        contributing_features_json TEXT NOT NULL
    );
    """)
    
    # Incidents
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        title TEXT NOT NULL,
        attack_type TEXT NOT NULL,
        source_ip TEXT NOT NULL,
        destination_ip TEXT NOT NULL,
        protocol TEXT NOT NULL,
        port INTEGER NOT NULL,
        severity TEXT NOT NULL,
        risk_score INTEGER NOT NULL,
        probability REAL NOT NULL,
        status TEXT NOT NULL,
        analyst_notes TEXT NOT NULL,
        country TEXT NOT NULL,
        assigned_analyst TEXT,
        features_json TEXT NOT NULL
    );
    """)
    
    # Generated Reports
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        dataset_name TEXT NOT NULL,
        model_name TEXT NOT NULL,
        total_flows INTEGER NOT NULL,
        threats_detected INTEGER NOT NULL,
        severity_summary_json TEXT NOT NULL,
        file_path TEXT NOT NULL
    );
    """)
    
    conn.commit()
    conn.close()

init_db()
