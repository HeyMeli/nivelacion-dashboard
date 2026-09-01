#!/usr/bin/env python3
"""
build_data.py — Regenera data/attendance.json y data/satisfaction.json a partir de los
formatos oficiales GIE-DCB-FOR-01 (asistencia y calificaciones) y GIE-DCB-FOR-02 (satisfacción).

Uso:
    python scripts/build_data.py --att RUTA_ASISTENCIA.xlsx --sat RUTA_SATISFACCION.xlsx

Puedes pasar solo uno de los dos si solo tienes ese archivo actualizado:
    python scripts/build_data.py --att RUTA_ASISTENCIA.xlsx

Por defecto, los nuevos periodos encontrados en el archivo se AGREGAN a los que ya existan en
data/*.json (igual que al subir un archivo desde el dashboard en el navegador): si un periodo ya
existía, se reemplaza por completo (para poder corregir datos sin duplicar). Usa --replace-all
para ignorar lo que había antes y dejar solo lo que trae el archivo nuevo.

Requiere: pandas, openpyxl  (pip install pandas openpyxl)
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

CURSO_RENAME = {
    "NIVELACIÓN LENGUA Y COM.": "COMUNICACIÓN - NIVELACIÓN",
    "NIVELACIÓN MATEMÁTICA": "MATEMATICA - NIVELACIÓN",
}


def clean_num(x, nd=4):
    if x is None:
        return None
    try:
        xf = float(x)
    except (TypeError, ValueError):
        return None
    if np.isnan(xf) or np.isinf(xf):
        return None
    return round(xf, nd)


def sanitize(obj):
    """Recursively replace NaN/inf floats with None so the result is valid JSON."""
    if isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    return obj


def find_header_row(raw: pd.DataFrame, required_cols) -> int:
    """Scans a header-less DataFrame for the first row containing ALL required column names."""
    for i in range(len(raw)):
        row_vals = {str(v).strip() for v in raw.iloc[i].tolist() if pd.notna(v)}
        if all(col in row_vals for col in required_cols):
            return i
    raise ValueError(f"No se encontró una fila de encabezados con las columnas {required_cols}")


def build_attendance(xlsx_path: Path):
    print(f"Leyendo asistencia/calificaciones: {xlsx_path}")
    raw = pd.read_excel(xlsx_path, sheet_name="REGISTRO", header=None)
    header_idx = find_header_row(raw, ["ID", "Apellidos y Nombres", "Carrera", "Curso a nivelar", "Asistencias"])
    df = pd.read_excel(xlsx_path, sheet_name="REGISTRO", header=header_idx)
    df = df.loc[:, ~df.columns.astype(str).str.contains("Unnamed")]
    df = df.dropna(subset=["ID"])

    cols = ["ID", "Apellidos y Nombres", "Carrera", "Facultad", "Sede", "Sección", "Curso a nivelar",
            "Periodo académico", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "Asistencias", "% de asistencia",
            "ED", "EC1", "EP", "Avance obtenido", "Avance ideal", "Eficacia\n(%)", "Aprobado"]
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"Faltan columnas esperadas en el archivo: {missing}")

    d = df[cols].copy()
    d.columns = ["id", "nombre", "carrera", "facultad", "sede", "seccion", "curso", "periodo",
                 "s1", "s2", "s3", "s4", "s5", "s6", "s7", "asistencias", "pctAsist",
                 "ed", "ec1", "ep", "avanceObt", "avanceIdeal", "eficacia", "aprobado"]

    d["curso"] = d["curso"].replace(CURSO_RENAME)
    d["condicion"] = np.where(d["asistencias"] > 0, "Participante", "No participante")

    for c in ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "ed", "ec1", "ep", "avanceObt", "avanceIdeal", "eficacia"]:
        d[c] = d[c].apply(clean_num)
    d["pctAsist"] = d["pctAsist"].apply(lambda x: clean_num(x * 100 if pd.notna(x) else None, 2))
    d["asistencias"] = d["asistencias"].apply(lambda x: 0 if pd.isna(x) else int(x))
    d["id"] = d["id"].astype(int)
    for c in ["nombre", "carrera", "facultad", "sede", "seccion", "curso", "periodo", "aprobado", "condicion"]:
        d[c] = d[c].apply(lambda x: None if pd.isna(x) else x)

    records = sanitize(d.to_dict(orient="records"))
    periods = sorted({r["periodo"] for r in records if r["periodo"]})
    print(f"  -> {len(records)} registros, periodo(s): {', '.join(periods)}")
    return records


def build_satisfaction(xlsx_path: Path):
    print(f"Leyendo satisfacción: {xlsx_path}")
    raw = pd.read_excel(xlsx_path, sheet_name="REGISTRO", header=None)
    header_idx = find_header_row(raw, ["Carrera", "Semestre", "Sede", "Curso", "P1"])
    df = pd.read_excel(xlsx_path, sheet_name="REGISTRO", header=header_idx)
    df = df.loc[:, ~df.columns.astype(str).str.contains("Unnamed")]
    # Require BOTH Carrera and Curso non-null: excludes summary/total rows (e.g. "Nivel de
    # satisfacción total") that only fill the Carrera cell but aren't real survey responses.
    df = df.dropna(subset=["Carrera", "Curso"])

    pcols = ["Carrera", "Ciclo", "Semestre", "Sede", "Curso"] + [f"P{i}" for i in range(1, 15)]
    missing = [c for c in pcols if c not in df.columns]
    if missing:
        raise ValueError(f"Faltan columnas esperadas en el archivo: {missing}")

    s = df[pcols].copy()
    s.columns = ["carrera", "ciclo", "periodo", "sede", "curso"] + [f"p{i}" for i in range(1, 15)]
    s["curso"] = s["curso"].replace(CURSO_RENAME)
    for i in range(1, 15):
        s[f"p{i}"] = pd.to_numeric(s[f"p{i}"], errors="coerce").apply(clean_num)
    for c in ["carrera", "ciclo", "periodo", "sede", "curso"]:
        s[c] = s[c].apply(lambda x: None if pd.isna(x) else x)

    records = sanitize(s.to_dict(orient="records"))
    periods = sorted({r["periodo"] for r in records if r["periodo"]})
    print(f"  -> {len(records)} registros, periodo(s): {', '.join(periods)}")
    return records


def merge_by_periodo(existing, incoming):
    """Same rule the in-browser uploader uses: periods present in `incoming` fully replace
    that period's existing records (no duplicates on re-run); other periods are kept."""
    incoming_periods = {r["periodo"] for r in incoming if r.get("periodo")}
    kept = [r for r in existing if r.get("periodo") not in incoming_periods]
    return kept + incoming


def load_existing(path: Path):
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return []


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--att", type=Path, help="Ruta al Excel GIE-DCB-FOR-01 (asistencia y calificaciones)")
    ap.add_argument("--sat", type=Path, help="Ruta al Excel GIE-DCB-FOR-02 (satisfacción)")
    ap.add_argument("--replace-all", action="store_true",
                     help="Ignora los datos existentes en data/*.json; deja solo lo que traen los archivos nuevos.")
    ap.add_argument("--out-dir", type=Path, default=DATA_DIR, help=f"Carpeta de salida (default: {DATA_DIR})")
    args = ap.parse_args()

    if not args.att and not args.sat:
        ap.error("Debes indicar al menos --att o --sat.")

    args.out_dir.mkdir(parents=True, exist_ok=True)

    if args.att:
        new_records = build_attendance(args.att)
        out_path = args.out_dir / "attendance.json"
        final = new_records if args.replace_all else merge_by_periodo(load_existing(out_path), new_records)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(final, f, ensure_ascii=False, allow_nan=False)
        periods = sorted({r["periodo"] for r in final if r.get("periodo")})
        print(f"✓ Escrito {out_path} — {len(final)} registros totales, periodos: {', '.join(periods)}")

    if args.sat:
        new_records = build_satisfaction(args.sat)
        out_path = args.out_dir / "satisfaction.json"
        final = new_records if args.replace_all else merge_by_periodo(load_existing(out_path), new_records)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(final, f, ensure_ascii=False, allow_nan=False)
        periods = sorted({r["periodo"] for r in final if r.get("periodo")})
        print(f"✓ Escrito {out_path} — {len(final)} registros totales, periodos: {', '.join(periods)}")

    print("\nListo. Revisa los cambios con `git diff --stat` y súbelos con git add/commit/push.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        sys.exit(1)
