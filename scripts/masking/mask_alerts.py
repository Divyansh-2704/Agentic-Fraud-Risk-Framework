"""
Mask the FAMS alert data two ways and write one Excel workbook per method.

  1. Presidio only     - Presidio detects PII and replaces it with its own operators
                         (<ENTITY> tags; account/card numbers keep only the last 4 digits).
  2. Presidio + Faker  - the same Presidio detection, but each value is swapped for a realistic
                         Faker surrogate that keeps the original format. The same original value always
                         gets the same surrogate, so links between alerts survive.

Both methods share one AnalyzerEngine, so detection is identical and the workbooks differ only in how the
values are replaced. Each workbook has the masked alerts, a detection log and a scorecard
(leakage, format kept, links kept) that uses the same metrics in both files so they can be compared.

Source: the alerts table in the app database (DATABASE_URL from fraud-framework/.env), joined with the
customer KYC fields. Pass --json <file> to read an exported JSON array instead.

    python scripts/masking/mask_alerts.py [--out <folder>] [--json <file>]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import string
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from faker import Faker
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig

HERE = Path(__file__).resolve().parent
APP_ROOT = HERE.parent.parent  # fraud-framework/
SCORE_THRESHOLD = 0.4

# ---------------------------------------------------------------- source data
SQL = """
select a.id alert_id, a.created_at, a.category, a.mode, a.rule_id, a.rule_name, a.alert_type, a.typology,
       a.risk_score, a.priority, a.dept, a.entity, a.status,
       a.cif, a.customer_name, a.segment, a.rm,
       c.eid emirates_id, c.passport passport_no, c.dob date_of_birth, c.nationality, c.cards card_numbers,
       a.account, a.beneficiary_account, a.linked_account, a.txn_ref, a.txn_amount, a.available_balance,
       a.device_id, a.decision, a.sub_class, a.rationale, a.notes, a.edd_response, a.fpi_response, a.raw_payload
from alerts a left join customers c on c.cif = a.cif
order by a.id
"""


def load_rows(json_path: str | None) -> list[dict]:
    if json_path:
        return json.loads(Path(json_path).read_text(encoding="utf-8"))
    import os

    import psycopg2
    import psycopg2.extras
    from dotenv import load_dotenv

    load_dotenv(APP_ROOT / ".env")
    with psycopg2.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(SQL)
        return [dict(r) for r in cur.fetchall()]


# Columns that are scanned, with the context words Presidio uses to boost the matching recognizers.
# Every other column (rule, typology, status, amounts...) is operational data and is copied unchanged.
SCAN_COLUMNS: dict[str, list[str]] = {
    "cif": ["cif", "customer", "id"],
    "customer_name": ["customer", "name"],
    "rm": ["relationship", "manager", "rm", "name"],
    "emirates_id": ["emirates", "eid", "id"],
    "passport_no": ["passport"],
    "date_of_birth": ["dob", "birth", "date"],
    "nationality": ["nationality", "country"],
    "card_numbers": ["card"],
    "account": ["account", "iban"],
    "beneficiary_account": ["beneficiary", "account", "iban"],
    "linked_account": ["account", "iban"],
    "txn_ref": ["transaction", "reference", "txn"],
    "device_id": ["device"],
    "rationale": [],
    "notes": [],
    "edd_response": [],
    "fpi_response": [],
    "raw_payload": [],
}
JSON_COLUMNS = {"raw_payload", "card_numbers"}
# Rule metadata inside raw_payload: never personal data, so it is not scanned (as Presidio's analyze_dict keys_to_skip).
PAYLOAD_SKIP_KEYS = {
    "alertDateTime", "riskScore", "category", "mode", "scenarioId", "scenarioDesc", "ruleId", "ruleName",
    "ruleCondition", "decisionLayer", "alertType", "typology", "alertOn", "alertedEntityType", "srType",
    "txnAmount", "type", "cond", "rule",
}
PAYLOAD_KEY_CONTEXT = {
    "cif": ["cif", "customer"], "accountNumber": ["account", "iban"], "beneficiaryAccount": ["beneficiary", "account"],
    "txnRef": ["transaction", "reference"], "deviceId": ["device"], "customerName": ["customer", "name"],
}

# Structured PII columns used for the scorecard: column -> regex describing the original format.
PII_FORMATS: dict[str, str] = {
    "cif": r"^\d{7}$",
    "customer_name": r"^[A-Z][A-Za-z'\-]+( [A-Z][A-Za-z'\-]+)+$",
    "rm": r"^RM [A-Z][a-z]+ [A-Z]\.$",
    "emirates_id": r"^784-\d{4}-\d{7}-\d$",
    "passport_no": r"^[A-Z]\d{7}$",
    "date_of_birth": r"^\d{4}-\d{2}-\d{2}$",
    "nationality": r"^[A-Z][A-Za-z ]+$",
    "account": r"^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$",
    "beneficiary_account": r"^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$",
    "txn_ref": r"^(TXN\d{10}|TC-\d{7}-[A-Z0-9]+)$",
    "device_id": r"^DEV-[A-Z0-9]+$",
}

# ---------------------------------------------------------------- detection (shared)
ENTITIES = [
    "PERSON", "LOCATION", "NRP", "EMAIL_ADDRESS", "PHONE_NUMBER", "IBAN_CODE", "CREDIT_CARD", "IP_ADDRESS", "URL",
    "AE_EMIRATES_ID", "PASSPORT_NO", "CUSTOMER_CIF", "BANK_ACCOUNT", "MASKED_CARD", "DEVICE_ID", "TXN_REF", "DATE_OF_BIRTH",
]


def build_analyzer() -> AnalyzerEngine:
    """Presidio's default recognizers (spaCy en_core_web_lg) plus bank/UAE identifiers it does not know."""
    analyzer = AnalyzerEngine()
    custom = [
        ("AE_EMIRATES_ID", r"\b784-?\d{4}-?\d{7}-?\d\b", 0.9, ["emirates", "eid"]),
        ("PASSPORT_NO", r"\b[A-Z]\d{7,8}\b", 0.5, ["passport"]),
        ("CUSTOMER_CIF", r"\b\d{7}\b", 0.3, ["cif", "customer"]),
        # Same layout as an IBAN but without the mod-97 check, so test/synthetic account numbers are caught too.
        ("BANK_ACCOUNT", r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", 0.6, ["account", "iban", "beneficiary"]),
        ("MASKED_CARD", r"\b\d{4}[ -]?\*{4}[ -]?\*{4}[ -]?\d{4}\b", 0.8, ["card"]),
        ("DEVICE_ID", r"\bDEV-[A-Z0-9]{2,}\b", 0.7, ["device"]),
        ("TXN_REF", r"\b(?:TXN\d{10}|TC-\d{7}-[A-Z0-9]+)\b", 0.6, ["transaction", "reference", "txn"]),
        ("DATE_OF_BIRTH", r"\b(?:19|20)\d{2}-\d{2}-\d{2}\b", 0.3, ["dob", "birth"]),
    ]
    for entity, regex, score, ctx in custom:
        analyzer.registry.add_recognizer(
            PatternRecognizer(supported_entity=entity, patterns=[Pattern(entity.lower(), regex, score)], context=ctx)
        )
    # spaCy does not tag country abbreviations such as "UAE" as a place, so list them explicitly.
    analyzer.registry.add_recognizer(
        PatternRecognizer(supported_entity="LOCATION", name="CountryAbbreviationRecognizer",
                          deny_list=["UAE", "KSA", "UK", "USA"])
    )
    return analyzer


# ---------------------------------------------------------------- method 1: Presidio operators
def keep_last4(value: str) -> str:
    return "".join("*" if ch.isalnum() else ch for ch in value[:-4]) + value[-4:]


def presidio_operators() -> dict[str, OperatorConfig]:
    ops = {e: OperatorConfig("replace", {"new_value": f"<{e}>"}) for e in ENTITIES}
    for e in ("IBAN_CODE", "BANK_ACCOUNT", "CREDIT_CARD", "MASKED_CARD"):
        ops[e] = OperatorConfig("custom", {"lambda": keep_last4})
    ops["DEFAULT"] = OperatorConfig("replace", {"new_value": "<PII>"})
    return ops


# ---------------------------------------------------------------- method 2: Faker surrogates
def iban_check_digits(country: str, bban: str) -> str:
    digits = "".join(str(int(ch, 36)) for ch in (bban + country + "00"))
    return f"{98 - int(digits) % 97:02d}"


def luhn_digit(number: str) -> str:
    total = 0
    for i, ch in enumerate(reversed(number)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            d -= 9 if d > 9 else 0
        total += d
    return str((10 - total % 10) % 10)


class FakerSurrogates:
    """Format-preserving fakes. One original value always maps to one surrogate (per entity type)."""

    def __init__(self, seed: int = 42):
        self.fake = Faker(["en_US", "en_GB", "en_IN"])
        self.fake.seed_instance(seed)
        self.rng = random.Random(seed)
        self.cache: dict[tuple[str, str], str] = {}
        self.used: set[str] = set()

    def digits(self, n: int) -> str:
        return "".join(self.rng.choice(string.digits) for _ in range(n))

    def same_shape(self, value: str, keep_letters: bool = False) -> str:
        """Swap each digit (and letter, unless keep_letters) for a random one of the same kind; keep separators and case."""
        out = []
        for ch in value:
            if ch.isdigit():
                out.append(self.rng.choice(string.digits))
            elif ch.isalpha() and not keep_letters:
                out.append(self.rng.choice(string.ascii_uppercase if ch.isupper() else string.ascii_lowercase))
            else:
                out.append(ch)
        return "".join(out)

    def make(self, entity: str, value: str) -> str:
        f = self.fake
        if entity == "PERSON":
            if value.startswith("RM "):
                return f"RM {f.first_name()} {f.last_name()[0]}."
            if re.fullmatch(r"[A-Z][a-z]+ [A-Z]\.", value):  # "Majid R." -> first name + initial
                return f"{f.first_name()} {f.last_name()[0]}."
            return f"{f.first_name()} {f.last_name()}" if " " in value.strip() else f.first_name()
        if entity in ("IBAN_CODE", "BANK_ACCOUNT"):
            country, bban = value[:2], value[4:]
            if country == "AE" and len(bban) >= 3:  # keep the 3-digit bank code so the account still routes to "our" bank
                bban = bban[:3] + self.digits(len(bban) - 3)
            else:
                bban = self.same_shape(bban)
            return country + iban_check_digits(country, bban) + bban
        if entity == "AE_EMIRATES_ID":
            core = "784" + str(self.rng.randint(1960, 2005)) + self.digits(7)
            return f"{core[:3]}-{core[3:7]}-{core[7:14]}-{luhn_digit(core)}" if "-" in value else core + luhn_digit(core)
        if entity == "CREDIT_CARD":
            body = self.rng.choice("45") + self.digits(14)
            return body + luhn_digit(body)
        if entity == "MASKED_CARD":
            return re.sub(r"\d", lambda _: self.rng.choice(string.digits), value)
        if entity == "DATE_OF_BIRTH":
            return f.date_of_birth(minimum_age=21, maximum_age=75).isoformat()
        if entity in ("LOCATION", "NRP"):
            return f.country()
        if entity == "EMAIL_ADDRESS":
            return f.email()
        if entity == "PHONE_NUMBER":
            return f"+971 5{self.rng.randint(0, 8)} {self.digits(3)} {self.digits(4)}"
        if entity == "IP_ADDRESS":
            return f.ipv4()
        if entity == "URL":
            return f.url()
        if entity in ("DEVICE_ID", "TXN_REF"):  # keep the system prefix (DEV-, TXN, TC-), new digits
            return self.same_shape(value, keep_letters=True)
        # CIF, passport and anything else: same shape, new characters.
        return self.same_shape(value)

    def __call__(self, entity: str, value: str) -> str:
        key = (entity, value)
        if key not in self.cache:
            for _ in range(20):  # avoid two originals sharing one surrogate
                fake = self.make(entity, value)
                if fake not in self.used and fake != value:
                    break
            self.cache[key] = fake
            self.used.add(fake)
        return self.cache[key]


def faker_operators(surrogates: FakerSurrogates) -> dict[str, OperatorConfig]:
    ops = {e: OperatorConfig("custom", {"lambda": (lambda v, e=e: surrogates(e, v))}) for e in ENTITIES}
    ops["DEFAULT"] = OperatorConfig("custom", {"lambda": lambda v: surrogates("DEFAULT", v)})
    return ops


# ---------------------------------------------------------------- masking engine
class Masker:
    def __init__(self, analyzer: AnalyzerEngine, operators: dict[str, OperatorConfig]):
        self.analyzer = analyzer
        self.anonymizer = AnonymizerEngine()
        self.operators = operators
        self.log: list[dict] = []

    def mask_text(self, text: str, context: list[str], alert_id: str, column: str) -> str:
        results = self.analyzer.analyze(
            text=text, language="en", entities=ENTITIES, context=context or None, score_threshold=SCORE_THRESHOLD
        )
        if not results:
            return text
        # Resolve overlaps here so each kept result maps to one output item. A purpose-built pattern recognizer beats
        # spaCy NER on the same span (NER tags some IDs, e.g. passports, as places); then highest score, longest span.
        kept = []
        is_ner = lambda r: (r.recognition_metadata or {}).get("recognizer_name") == "SpacyRecognizer"
        for res in sorted(results, key=lambda r: (is_ner(r), -r.score, -(r.end - r.start))):
            if all(res.end <= k.start or res.start >= k.end for k in kept):
                kept.append(res)
        kept.sort(key=lambda r: r.start)
        out = self.anonymizer.anonymize(text=text, analyzer_results=kept, operators=self.operators)
        items = sorted(out.items, key=lambda i: i.start)
        for res, item in zip(kept, items):
            self.log.append({
                "alert_id": alert_id, "column": column, "entity_type": res.entity_type, "score": round(res.score, 2),
                "recognizer": (res.recognition_metadata or {}).get("recognizer_name", ""),
                "chars": res.end - res.start, "masked_value": item.text,
            })
        return out.text

    def mask_json(self, node, alert_id: str, column: str, key: str | None = None):
        if isinstance(node, dict):
            return {k: (v if k in PAYLOAD_SKIP_KEYS else self.mask_json(v, alert_id, f"{column}.{k}", k)) for k, v in node.items()}
        if isinstance(node, list):
            return [self.mask_json(v, alert_id, column, key) for v in node]
        if isinstance(node, str) and node.strip():
            ctx = PAYLOAD_KEY_CONTEXT.get(key or "", SCAN_COLUMNS.get(column, []))
            return self.mask_text(node, ctx, alert_id, column)
        return node

    def mask_row(self, row: dict) -> dict:
        out = dict(row)
        for col, ctx in SCAN_COLUMNS.items():
            val = row.get(col)
            if val is None or str(val).strip() == "":
                continue
            if col in JSON_COLUMNS:
                try:
                    out[col] = json.dumps(self.mask_json(json.loads(val), row["alert_id"], col), ensure_ascii=False)
                    continue
                except (TypeError, ValueError):
                    pass
            out[col] = self.mask_text(str(val), ctx, row["alert_id"], col)
        return out


# ---------------------------------------------------------------- scorecard
NOT_PII = {"UNKNOWN", "N/A", "NA", "-"}


def pii_values(row: dict, col: str) -> list[str]:
    val = row.get(col)
    if val is None or str(val).strip().upper() in NOT_PII or str(val).strip() == "":
        return []
    if col == "card_numbers":
        try:
            return [str(v) for v in json.loads(val)]
        except ValueError:
            return [str(val)]
    return [str(val)]


def scorecard(originals: list[dict], masked: list[dict]) -> list[dict]:
    cols = list(PII_FORMATS) + ["card_numbers"]
    rows = []
    for col in cols:
        populated = leaked = changed = fmt_ok = fmt_base = 0
        mapping: dict[str, set[str]] = defaultdict(set)
        for o, m in zip(originals, masked):
            ov = pii_values(o, col)
            if not ov:
                continue
            populated += 1
            whole_row = " ".join("" if v is None else str(v) for v in m.values())
            if any(len(v) >= 3 and v in whole_row for v in ov):
                leaked += 1
            mv = str(m.get(col))
            if mv != str(o.get(col)):
                changed += 1
            # Format kept: only counted for originals that have the standard format (test IDs like NEW0001 are skipped).
            fmt = PII_FORMATS.get(col)
            if fmt is None:  # card_numbers: masked layout "1234 **** **** 5678"
                fmt_base += 1
                try:
                    fmt_ok += all(re.match(r"^\d{4} \*{4} \*{4} \d{4}$", c) for c in json.loads(mv))
                except ValueError:
                    pass
            elif re.match(fmt, str(o.get(col))):
                fmt_base += 1
                fmt_ok += bool(re.match(fmt, mv))
            mapping[str(o.get(col))].add(mv)
        if not populated:
            continue
        distinct_orig = len(mapping)
        distinct_masked = len({v for s in mapping.values() for v in s})
        consistent = all(len(s) == 1 for s in mapping.values())
        rows.append({
            "column": col, "populated_rows": populated, "masked_rows": changed,
            "leaked_rows": leaked, "leak_rate": leaked / populated,
            "format_kept": fmt_ok / fmt_base if fmt_base else 0.0,
            "distinct_original": distinct_orig, "distinct_masked": distinct_masked,
            "links_kept": "Yes" if consistent and distinct_orig == distinct_masked else "No",
        })
    return rows


# ---------------------------------------------------------------- Excel
NAVY, AMBER, LAVENDER = "1C2045", "FFB339", "F3F6FF"
HEAD_FILL = PatternFill("solid", fgColor=NAVY)
HEAD_FONT = Font(bold=True, color="FFFFFF")
MASK_FILL = PatternFill("solid", fgColor="FFF1D6")
WARN_FILL = PatternFill("solid", fgColor="FDE2E1")
OK_FILL = PatternFill("solid", fgColor="E3F4E8")


def write_table(ws, headers: list[str], rows: list[list], start_row: int = 1, widths: dict[int, int] | None = None):
    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=start_row, column=c, value=h)
        cell.fill, cell.font = HEAD_FILL, HEAD_FONT
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    for r, values in enumerate(rows, start_row + 1):
        for c, v in enumerate(values, 1):
            ws.cell(row=r, column=c, value=v)
    for c, h in enumerate(headers, 1):
        width = (widths or {}).get(c) or min(60, max(len(str(h)), *(len(str(v[c - 1] or "")) for v in rows)) + 2) if rows else len(h) + 2
        ws.column_dimensions[get_column_letter(c)].width = width


def build_workbook(path: Path, method: str, how: list[str], originals: list[dict], masked: list[dict], log: list[dict]):
    wb = Workbook()

    # 1. Summary + scorecard
    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = f"FAMS alert data masked with {method}"
    ws["A1"].font = Font(bold=True, size=14, color=NAVY)
    ws["A2"] = f"Generated {datetime.now():%Y-%m-%d %H:%M} from {len(originals)} alerts (alerts table joined with customer KYC)."
    r = 4
    for line in how:
        ws.cell(row=r, column=1, value=line).alignment = Alignment(wrap_text=False)
        r += 1
    r += 1
    ws.cell(row=r, column=1, value="Scorecard (same metrics in both workbooks)").font = Font(bold=True, size=12, color=NAVY)
    r += 1
    sc = scorecard(originals, masked)
    headers = ["PII column", "Rows with a value", "Rows masked", "Rows where original still appears", "Leak rate",
               "Masked value keeps original format", "Distinct originals", "Distinct masked values", "Links between alerts kept"]
    write_table(ws, headers, [[s["column"], s["populated_rows"], s["masked_rows"], s["leaked_rows"], s["leak_rate"],
                               s["format_kept"], s["distinct_original"], s["distinct_masked"], s["links_kept"]] for s in sc], r)
    for i in range(len(sc)):
        row = r + 1 + i
        ws.cell(row=row, column=5).number_format = "0%"
        ws.cell(row=row, column=6).number_format = "0%"
        ws.cell(row=row, column=5).fill = WARN_FILL if sc[i]["leaked_rows"] else OK_FILL
        ws.cell(row=row, column=6).fill = OK_FILL if sc[i]["format_kept"] >= 0.99 else WARN_FILL
        ws.cell(row=row, column=9).fill = OK_FILL if sc[i]["links_kept"] == "Yes" else WARN_FILL
    r += len(sc) + 2
    total_pop = sum(s["populated_rows"] for s in sc)
    totals = [
        ("PII values checked", total_pop),
        ("Leaked (original still visible)", sum(s["leaked_rows"] for s in sc)),
        ("Overall leak rate", sum(s["leaked_rows"] for s in sc) / total_pop),
        ("Overall format kept", sum(s["format_kept"] * s["populated_rows"] for s in sc) / total_pop),
        ("Columns whose links between alerts are kept", f'{sum(s["links_kept"] == "Yes" for s in sc)} of {len(sc)}'),
        ("Total detections", len(log)),
    ]
    for label, val in totals:
        ws.cell(row=r, column=1, value=label).font = Font(bold=True)
        c = ws.cell(row=r, column=2, value=val)
        if isinstance(val, float):
            c.number_format = "0.0%"
        r += 1
    r += 1
    ws.cell(row=r, column=1, value="Detections by entity type").font = Font(bold=True, size=12, color=NAVY)
    r += 1
    by_entity = Counter(d["entity_type"] for d in log)
    write_table(ws, ["Entity type", "Detections", "Recognizer"],
                [[e, n, ", ".join(sorted({d["recognizer"] for d in log if d["entity_type"] == e}))] for e, n in by_entity.most_common()], r)
    ws.column_dimensions["A"].width = 44
    for col in "BCDEFGHI":
        ws.column_dimensions[col].width = 20
    ws.freeze_panes = None

    # 2. Masked alerts
    wm = wb.create_sheet("Masked Alerts")
    cols = list(masked[0].keys())
    write_table(wm, cols, [[m.get(c) for c in cols] for m in masked])
    for i, (o, m) in enumerate(zip(originals, masked), 2):
        for j, c in enumerate(cols, 1):
            if str(o.get(c)) != str(m.get(c)):
                wm.cell(row=i, column=j).fill = MASK_FILL
    for j, c in enumerate(cols, 1):
        wm.column_dimensions[get_column_letter(j)].width = 60 if c == "raw_payload" else min(40, max(12, len(c) + 2, *(len(str(m.get(c) or "")) + 2 for m in masked)))
    wm.freeze_panes = "B2"
    wm.auto_filter.ref = wm.dimensions

    # 3. Detection log (no original values, so the file stays safe to share)
    wl = wb.create_sheet("Detection Log")
    write_table(wl, ["Alert ID", "Column / JSON field", "Entity type", "Score", "Recognizer", "Original length", "Replaced with"],
                [[d["alert_id"], d["column"], d["entity_type"], d["score"], d["recognizer"], d["chars"], d["masked_value"]] for d in log])
    wl.freeze_panes = "A2"
    wl.auto_filter.ref = wl.dimensions

    for sheet in wb.worksheets:
        sheet.sheet_view.showGridLines = sheet.title != "Summary"
    wb.save(path)


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", help="read alerts from an exported JSON array instead of the database")
    ap.add_argument("--out", default=str(APP_ROOT.parent / "Data Masking"), help="output folder")
    args = ap.parse_args()

    rows = load_rows(args.json)
    for r in rows:  # normalise DB types for Excel
        for k, v in r.items():
            if isinstance(v, datetime):
                r[k] = v.isoformat()
    print(f"Loaded {len(rows)} alerts")
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    analyzer = build_analyzer()
    common = [
        "Detection (identical in both workbooks): Presidio AnalyzerEngine with spaCy en_core_web_lg, score threshold "
        f"{SCORE_THRESHOLD}, the column name as context, plus custom recognizers for",
        "  Emirates ID, passport, CIF, account number (IBAN layout without checksum), masked card, device ID, transaction ref, date of birth.",
        "Columns scanned: " + ", ".join(SCAN_COLUMNS) + ". raw_payload is parsed as JSON and rule metadata keys are skipped.",
        "Columns not scanned (operational, copied unchanged): rule, typology, status, priority, amounts, dates of the alert.",
        "Masked cells are shaded amber on the Masked Alerts sheet. The Detection Log never shows original values.",
    ]

    p = Masker(analyzer, presidio_operators())
    masked_p = [p.mask_row(r) for r in rows]
    f1 = out_dir / "FAMS_Alerts_Masked_Presidio.xlsx"
    build_workbook(f1, "Presidio", common + [
        "Replacement (Presidio operators): every entity becomes a tag such as <PERSON> or <AE_EMIRATES_ID>;",
        "  IBAN/account/card numbers keep only the last 4 characters (Presidio custom operator).",
    ], rows, masked_p, p.log)
    print("Wrote", f1)

    surrogates = FakerSurrogates()
    pf = Masker(analyzer, faker_operators(surrogates))
    masked_pf = [pf.mask_row(r) for r in rows]
    f2 = out_dir / "FAMS_Alerts_Masked_Presidio_Faker.xlsx"
    build_workbook(f2, "Presidio + Faker", common + [
        "Replacement (Faker surrogates through a Presidio custom operator): names, countries and dates of birth get realistic fakes;",
        "  IBANs get a new number with a valid mod-97 check (UAE bank code kept), Emirates IDs a valid Luhn digit,",
        "  CIF / passport / device / txn ref keep their exact layout. Faker is seeded (42) and the same original always",
        "  maps to the same surrogate, so alerts for one customer stay linked.",
    ], rows, masked_pf, pf.log)
    print("Wrote", f2)

    for name, m, log in (("Presidio", masked_p, p.log), ("Presidio + Faker", masked_pf, pf.log)):
        sc = scorecard(rows, m)
        pop = sum(s["populated_rows"] for s in sc)
        print(f"{name:18} detections={len(log):4}  leaked={sum(s['leaked_rows'] for s in sc)}/{pop}  "
              f"format_kept={sum(s['format_kept'] * s['populated_rows'] for s in sc) / pop:.0%}  "
              f"links_kept={sum(s['links_kept'] == 'Yes' for s in sc)}/{len(sc)}")
        for s in sc:
            print(f"   {s['column']:20} leak {s['leaked_rows']:3}/{s['populated_rows']:<3} format {s['format_kept']:.0%}  links {s['links_kept']}")


if __name__ == "__main__":
    main()
