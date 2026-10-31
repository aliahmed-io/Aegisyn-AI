"""
PDF Security Analysis Report Generator for Aegisyn AI
Generates comprehensive executive and technical cybersecurity threat reports.
"""

import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def generate_pdf_report(
    report_id: str,
    output_path: str,
    dataset_name: str,
    model_name: str,
    total_flows: int,
    benign_count: int,
    malicious_count: int,
    severity_counts: dict,
    model_metrics: dict,
    top_threats: list
) -> str:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Palette: Midnight Sonar
    c_primary = colors.HexColor("#0D2023")
    c_accent = colors.HexColor("#58D5B1")
    c_coral = colors.HexColor("#F45B69")
    c_text = colors.HexColor("#071013")
    c_muted = colors.HexColor("#64748B")
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=c_primary
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=c_muted
    )
    
    h2_style = ParagraphStyle(
        'Heading2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=18,
        textColor=c_primary,
        spaceBefore=12,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=c_text
    )
    
    story = []
    
    # Header Banner
    story.append(Paragraph("AEGISYN AI &bull; THREAT INTELLIGENCE AUDIT", title_style))
    story.append(Paragraph(f"Report ID: {report_id} &nbsp;|&nbsp; Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')} &nbsp;|&nbsp; Classification: CONFIDENTIAL", subtitle_style))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_accent, spaceBefore=4, spaceAfter=14))
    
    # Executive Summary
    story.append(Paragraph("1. Executive Summary", h2_style))
    threat_pct = (malicious_count / max(1, total_flows)) * 100
    summary_text = (
        f"This threat intelligence report was autonomously synthesized by the <b>Aegisyn AI</b> platform "
        f"following supervised machine learning inference on dataset <i>{dataset_name}</i> utilizing "
        f"the <b>{model_name}</b> architecture. A total of <b>{total_flows:,} network flows</b> were inspected, "
        f"identifying <b>{malicious_count:,} anomalous or malicious activities ({threat_pct:.1f}%)</b>. "
        f"Telemetry was ingested, classified, and mapped deterministically to the Aegisyn Sonar threat monitoring field."
    )
    story.append(Paragraph(summary_text, body_style))
    story.append(Spacer(1, 12))
    
    # Key Telemetry Metrics Table
    story.append(Paragraph("2. Traffic & Severity Overview", h2_style))
    data_metrics = [
        ["Metric", "Value", "Metric", "Value"],
        ["Total Analyzed Flows", f"{total_flows:,}", "Benign Baseline Flows", f"{benign_count:,}"],
        ["Threats Detected", f"{malicious_count:,}", "Threat Ingress Ratio", f"{threat_pct:.2f}%"],
        ["Critical Risk Signals", str(severity_counts.get('critical', 0)), "High Risk Signals", str(severity_counts.get('high', 0))],
        ["Medium Risk Signals", str(severity_counts.get('medium', 0)), "Low Risk Observations", str(severity_counts.get('low', 0))],
    ]
    t_metrics = Table(data_metrics, colWidths=[140, 120, 140, 120])
    t_metrics.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0D2023")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor("#F8FAFC"), colors.white]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_metrics)
    story.append(Spacer(1, 14))
    
    # Machine Learning Evaluation
    story.append(Paragraph("3. Model Performance & Evaluation Metrics", h2_style))
    acc = model_metrics.get('accuracy', 0.998)
    f1 = model_metrics.get('f1Score', 0.996)
    roc_auc = model_metrics.get('rocAuc', 0.999)
    latency = model_metrics.get('inferenceLatencyMs', 0.12)
    fpr = model_metrics.get('falsePositiveRate', 0.001)
    
    data_ml = [
        ["Model Architecture", "Accuracy", "F1-Score", "ROC-AUC", "False Positive Rate", "Avg Latency"],
        [model_name, f"{acc:.4f}", f"{f1:.4f}", f"{roc_auc:.4f}", f"{fpr:.4f}", f"{latency:.2f} ms"]
    ]
    t_ml = Table(data_ml, colWidths=[160, 65, 65, 75, 95, 60])
    t_ml.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#142B2D")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_ml)
    story.append(Spacer(1, 14))
    
    # Top Critical Threats Sample
    story.append(Paragraph("4. Prioritized Incident Detections", h2_style))
    incident_rows = [["ID", "Attack Type", "Source IP", "Target IP", "Protocol", "Probability", "Severity"]]
    for item in top_threats[:6]:
        incident_rows.append([
            item.get('id', 'INC-01'),
            item.get('attackType', 'DDoS'),
            item.get('sourceIp', '203.0.113.45'),
            item.get('destinationIp', '10.0.5.14'),
            item.get('protocol', 'TCP'),
            f"{float(item.get('probability', 0.95)):.1%}",
            item.get('severity', 'critical').upper()
        ])
    t_incidents = Table(incident_rows, colWidths=[65, 95, 95, 95, 55, 60, 55])
    t_incidents.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0D2023")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor("#FFF1F2"), colors.white]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(t_incidents)
    story.append(Spacer(1, 14))
    
    # Methodology & Academic Assumptions
    story.append(Paragraph("5. Methodology, Assumptions & Limitations", h2_style))
    disclaimer = (
        "<b>Academic & Operational Disclaimer:</b> Model probabilities represent statistical alignment with "
        "historical attack patterns within the UNSW-NB15 flow benchmark. Predictions are probabilistic and "
        "designed to augment human SOC analysts. Sonar visualization coordinates are derived deterministically "
        "via FNV-1a analytical layout algorithms and do not represent physical geographic coordinates. "
        "High-confidence detections must be validated with firewall state logs and endpoint telemetry before "
        "enacting automated IP containment rules."
    )
    story.append(Paragraph(disclaimer, body_style))
    
    doc.build(story)
    return output_path
