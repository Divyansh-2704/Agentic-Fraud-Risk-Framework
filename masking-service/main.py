"""
Presidio masking service for the AI agents.

The Node API sends the JSON it wants an LLM to read. This service replaces every piece of personal data with a
consistent placeholder token (<PERSON_1>, <IBAN_AE_2>, <CUSTOMER_CIF_1>...) and returns the masked JSON plus the
token -> real value table. The table stays on the Node server (it is used to put the real values back into the
LLM's answer for the analyst); only the masked JSON is ever sent to the LLM.

Two layers, so nothing depends on NER alone:
  1. Field-aware: values under known PII keys (name, cif, account, eid, passport, dob...) are always tokenised.
  2. Presidio: every other text value is scanned by Presidio's AnalyzerEngine (spaCy NER + pattern recognizers for
     UAE / bank identifiers + an ad-hoc deny list of the names and IDs found in layer 1), then anything found is
     tokenised. Finally, any known real value still present in a string is replaced literally (belt and braces).

Run locally:  uvicorn main:app --port 5055        (see ../scripts/masking-service.mjs)
On Vercel:    the "masking" service in ../vercel.json; only the Node "server" service can reach it (binding).
"""
from __future__ import annotations

import os
import re
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer, RecognizerResult
from presidio_analyzer.nlp_engine import NlpEngineProvider
from pydantic import BaseModel

SPACY_MODEL = os.environ.get("SPACY_MODEL", "en_core_web_md")
SERVICE_TOKEN = os.environ.get("MASKING_SERVICE_TOKEN", "")
SCORE_THRESHOLD = 0.4

# ---------------------------------------------------------------- layer 1: known PII keys -> entity type
KEY_ENTITY: dict[str, str] = {
    **dict.fromkeys(["name", "customer_name", "rm", "beneficiary_name", "holder_name", "full_name"], "PERSON"),
    **dict.fromkeys(["cif", "linked_cifs", "other_cif"], "CUSTOMER_CIF"),
    **dict.fromkeys(["account", "accounts", "iban", "beneficiary_account", "linked_account", "counterparty_iban", "account_number"], "IBAN"),
    **dict.fromkeys(["eid", "emirates_id"], "AE_EMIRATES_ID"),
    **dict.fromkeys(["passport", "passport_no"], "PASSPORT"),
    **dict.fromkeys(["tl", "trade_licence"], "TRADE_LICENCE"),
    **dict.fromkeys(["dob", "date_of_birth"], "DATE_OF_BIRTH"),
    **dict.fromkeys(["nationality"], "NATIONALITY"),
    **dict.fromkeys(["cards", "card", "card_number"], "CARD"),
    **dict.fromkeys(["device_id"], "DEVICE_ID"),
    **dict.fromkeys(["txn_id", "txn_ref"], "TXN_REF"),
    **dict.fromkeys(["email"], "EMAIL_ADDRESS"),
    **dict.fromkeys(["phone", "mobile"], "PHONE_NUMBER"),
}
# Operational / categorical keys: never personal data, never scanned (avoids NER false positives on labels).
SAFE_KEYS = {
    "id", "alert_id", "case_id", "created_at", "date", "ts", "type", "category", "mode", "status", "priority", "complexity",
    "dept", "entity", "segment", "channel", "currency", "typology", "alert_type", "rule_id", "rule_name", "scenario_id",
    "scenario_desc", "condition", "decision_layer", "decision", "sub_class", "alert_on", "alerted_entity_type", "sr_type",
    "prevention_colour", "age_band", "risk_l1", "risk_l2", "direction", "relationship", "first_seen", "last_seen", "note",
}

# Presidio entity -> token group (so one value found by different recognizers still gets one token).
GROUP = {"IBAN_CODE": "IBAN", "BANK_ACCOUNT": "IBAN", "MASKED_CARD": "CARD", "CREDIT_CARD": "CARD", "PASSPORT_NO": "PASSPORT",
         "LOCATION": "LOCATION", "NRP": "NATIONALITY"}
# Business-name fields: only people and identifiers are personal data there (merchant names are kept for the analysis).
COUNTERPARTY_KEYS = {"counterparty", "merchant", "beneficiary_bank", "counterparty_bank"}
COUNTERPARTY_ENTITIES = ["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "IBAN_CODE", "CREDIT_CARD", "AE_EMIRATES_ID", "PASSPORT_NO",
                         "CUSTOMER_CIF", "BANK_ACCOUNT", "MASKED_CARD", "KNOWN_VALUE"]
ALLOW_FILE = os.path.join(os.path.dirname(__file__), "known_counterparties.txt")
ALLOW_LIST = [l.strip() for l in open(ALLOW_FILE, encoding="utf-8") if l.strip() and not l.startswith("#")] if os.path.exists(ALLOW_FILE) else []

SCAN_ENTITIES = ["PERSON", "LOCATION", "NRP", "EMAIL_ADDRESS", "PHONE_NUMBER", "IBAN_CODE", "CREDIT_CARD", "IP_ADDRESS", "URL",
                 "AE_EMIRATES_ID", "PASSPORT_NO", "CUSTOMER_CIF", "BANK_ACCOUNT", "MASKED_CARD", "DEVICE_ID", "TXN_REF", "DATE_OF_BIRTH",
                 "KNOWN_VALUE"]


def build_analyzer() -> AnalyzerEngine:
    nlp = NlpEngineProvider(nlp_configuration={"nlp_engine_name": "spacy", "models": [{"lang_code": "en", "model_name": SPACY_MODEL}]}).create_engine()
    analyzer = AnalyzerEngine(nlp_engine=nlp, supported_languages=["en"])
    custom = [
        ("AE_EMIRATES_ID", r"\b784-?\d{4}-?\d{7}-?\d\b", 0.9, ["emirates", "eid"]),
        ("PASSPORT_NO", r"\b[A-Z]\d{7,8}\b", 0.5, ["passport"]),
        ("CUSTOMER_CIF", r"\b\d{7}\b", 0.3, ["cif", "customer"]),
        ("BANK_ACCOUNT", r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", 0.6, ["account", "iban", "beneficiary"]),
        ("MASKED_CARD", r"\b\d{4}[ -]?\*{4}[ -]?\*{4}[ -]?\d{4}\b", 0.8, ["card"]),
        ("DEVICE_ID", r"\bDEV-[A-Z0-9]{2,}\b", 0.7, ["device"]),
        ("TXN_REF", r"\b(?:TXN\d{8,}|TC-[A-Z0-9]{4,}-[A-Z0-9]+)\b", 0.6, ["transaction", "reference", "txn"]),
        ("DATE_OF_BIRTH", r"\b(?:19|20)\d{2}-\d{2}-\d{2}\b", 0.3, ["dob", "birth"]),
    ]
    for entity, regex, score, ctx in custom:
        analyzer.registry.add_recognizer(PatternRecognizer(supported_entity=entity, patterns=[Pattern(entity.lower(), regex, score)], context=ctx))
    # spaCy does not tag country abbreviations such as "UAE" as places.
    analyzer.registry.add_recognizer(PatternRecognizer(supported_entity="LOCATION", name="CountryAbbreviationRecognizer", deny_list=["UAE", "KSA", "UK", "USA"]))
    return analyzer


ANALYZER = build_analyzer()


# ---------------------------------------------------------------- tokens
class Tokens:
    """One token per distinct real value (per request), e.g. 'Ahmed Al Falasi' -> <PERSON_1> everywhere it appears."""

    def __init__(self):
        self.by_value: dict[str, str] = {}
        self.mapping: dict[str, str] = {}
        self.counters: dict[str, int] = {}
        self.stats: dict[str, int] = {}

    def token(self, group: str, value: str, count: bool = True) -> str:
        value = value.strip()
        key = value.lower()
        if key in self.by_value:
            tok = self.by_value[key]
        else:
            label = group
            if group == "IBAN" and re.match(r"^[A-Z]{2}\d{2}", value):
                label = f"IBAN_{value[:2]}"  # keep the country: it matters for fraud analysis and does not identify anyone
            self.counters[label] = self.counters.get(label, 0) + 1
            tok = f"<{label}_{self.counters[label]}>"
            self.by_value[key] = tok
            self.mapping[tok] = value
        if count:
            self.stats[group] = self.stats.get(group, 0) + 1
        return tok

    def known_values(self) -> list[str]:
        return sorted(self.mapping.values(), key=len, reverse=True)


def collect_known(node: Any, tokens: Tokens, key: str | None = None):
    """Layer 1, pass 1: tokenise every value under a known PII key, so free text can reuse the same tokens."""
    if isinstance(node, dict):
        for k, v in node.items():
            collect_known(v, tokens, k)
    elif isinstance(node, list):
        for v in node:
            collect_known(v, tokens, key)
    elif node is not None and key in KEY_ENTITY and str(node).strip():
        tokens.token(KEY_ENTITY[key], str(node), count=False)


def mask_text(text: str, tokens: Tokens, context: list[str], key: str | None = None, allow: list[str] | None = None) -> str:
    allow = allow or []
    allowed = {a.lower() for a in allow}
    if text.strip().lower() in allowed:
        return text  # a known merchant / biller
    known = [v for v in tokens.known_values() if len(v) >= 3]
    ad_hoc = [PatternRecognizer(supported_entity="KNOWN_VALUE", name="KnownValueRecognizer", deny_list=known)] if known else []
    entities = COUNTERPARTY_ENTITIES if key in COUNTERPARTY_KEYS else SCAN_ENTITIES
    results: list[RecognizerResult] = ANALYZER.analyze(text=text, language="en", entities=entities, context=context or None,
                                                       score_threshold=SCORE_THRESHOLD, ad_hoc_recognizers=ad_hoc,
                                                       allow_list=allow or None, allow_list_match="exact")
    # Resolve overlaps: known values and pattern recognizers beat spaCy NER; then score, then longest span.
    is_ner = lambda r: (r.recognition_metadata or {}).get("recognizer_name") == "SpacyRecognizer"
    kept: list[RecognizerResult] = []
    for r in sorted(results, key=lambda r: (r.entity_type != "KNOWN_VALUE", is_ner(r), -r.score, -(r.end - r.start))):
        if all(r.end <= k.start or r.start >= k.end for k in kept):
            kept.append(r)
    out = text
    for r in sorted(kept, key=lambda r: r.start, reverse=True):
        value = text[r.start:r.end]
        if r.entity_type == "KNOWN_VALUE":
            tok = tokens.by_value.get(value.strip().lower()) or tokens.token("PII", value)
        else:
            tok = tokens.token(GROUP.get(r.entity_type, r.entity_type), value)
        out = out[:r.start] + tok + out[r.end:]
    # Belt and braces: any known value that is still present (e.g. inside a longer word) is replaced literally.
    for v in known:
        if v in out:
            out = out.replace(v, tokens.by_value[v.lower()])
    return out


def mask_node(node: Any, tokens: Tokens, key: str | None = None, allow: list[str] | None = None) -> Any:
    if isinstance(node, dict):
        return {k: mask_node(v, tokens, k, allow) for k, v in node.items()}
    if isinstance(node, list):
        return [mask_node(v, tokens, key, allow) for v in node]
    if node is None or isinstance(node, bool):
        return node
    if key in KEY_ENTITY:
        return tokens.token(KEY_ENTITY[key], str(node)) if str(node).strip() else node
    if isinstance(node, (int, float)) or key in SAFE_KEYS:
        return node
    text = str(node)
    if not text.strip():
        return text
    return mask_text(text, tokens, [key.replace("_", " ")] if key else [], key, allow)


# ---------------------------------------------------------------- API
app = FastAPI(title="FCMS masking service", docs_url=None, redoc_url=None)


class MaskRequest(BaseModel):
    data: Any
    allow_list: list[str] = []  # extra business names the caller knows are not personal data


def check_auth(token: str | None):
    if SERVICE_TOKEN and token != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Missing or wrong X-Masking-Token")


@app.get("/health")
@app.get("/api/masking/health")
def health():
    return {"ok": True, "engine": "presidio", "spacy_model": SPACY_MODEL}


@app.post("/mask")
@app.post("/api/masking/mask")
def mask(req: MaskRequest, x_masking_token: str | None = Header(default=None)):
    check_auth(x_masking_token)
    tokens = Tokens()
    collect_known(req.data, tokens)
    masked = mask_node(req.data, tokens, allow=ALLOW_LIST + req.allow_list)
    return {"masked": masked, "mapping": tokens.mapping, "stats": tokens.stats, "engine": f"presidio + spaCy {SPACY_MODEL}"}
