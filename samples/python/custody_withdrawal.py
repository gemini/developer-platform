"""End-to-end example: MPC custody withdrawal with an API-signer authorization.

IMPORTANT — this API is not self-serve. Before you can use it you must contact
Gemini support (support@gemini.com), who will:

1. Enable the custody API for your account group.
2. Set up your MPC custody account with an approved account security policy
   that includes a positive API signer threshold.
3. Register your API signer keypairs on the account (each signer public key is
   a COSE_Key-encoded P-256 key; you generate the keypairs yourself and hand
   the public keys to support).

Every withdrawal then requires a *challenge*: you ask Gemini to mint a signed
intent, independently verify that it commits to exactly the transfer you
intended, have each approved signer sign it, and submit the signatures with
the withdrawal. The signature quorum is enforced server-side from your
account's approved policy — this example requests one signature per assertion
batch member and submits all of them.

Flow:
  1. POST /v1/custody/challenge          -> mint a pending voucher + challenge
  2. verify_withdrawal_challenge(...)    -> prove the challenge matches intent
  3. sign messageToSign with each signer -> ES256 assertions (COSE P-256 keys)
  4. POST /v2/withdraw/:network/:ticker  -> voucher activates, withdrawal runs

Requires: GEMINI_API_KEY / GEMINI_API_SECRET in the environment (an API key on
the MPC custody account with withdrawal permission), and at least one signer
private key (PEM, P-256/ES256) whose public key was registered by support.
The signer keys are read from MPC_SIGNER_KEY_<n> PEM files.

Run:
  python3 custody_withdrawal.py ethereum ETH 0.0005 0xYourWhitelistedAddress
"""

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Mapping
from pathlib import Path

BASE_URL = "https://api.gemini.com"

# ---------------------------------------------------------------------------
# Standard Gemini private-API request signing (same as every /v1../v2 endpoint)
# ---------------------------------------------------------------------------


def signed_post(path: str, payload: dict, api_key: str, api_secret: str) -> dict:
    full_payload = {"request": path, "nonce": str(int(time.time() * 1000)), **payload}
    encoded = base64.b64encode(json.dumps(full_payload, separators=(",", ":")).encode())
    signature = hmac.new(api_secret.encode(), encoded, hashlib.sha384).hexdigest()
    request = urllib.request.Request(
        BASE_URL + path,
        method="POST",
        headers={
            "Content-Type": "text/plain",
            "Content-Length": "0",
            "X-GEMINI-APIKEY": api_key,
            "X-GEMINI-PAYLOAD": encoded.decode("ascii"),
            "X-GEMINI-SIGNATURE": signature,
            "Cache-Control": "no-cache",
        },
        data=b"",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise SystemExit(f"HTTP {error.code}: {error.read().decode(errors='replace')}")


# ---------------------------------------------------------------------------
# Step 2 helper: describe the transfer WE intend (never taken from the response)
# ---------------------------------------------------------------------------


def trusted_intent(account_id: int, network_family: str, chain_network: str,
                   currency_identifier: str, decimals: int, amount: str, address: str,
                   memo, required_signatures: int) -> dict:
    return {
        "accountId": account_id,
        "networkFamily": network_family,
        "chainNetwork": chain_network,
        "currencyIdentifier": currency_identifier,  # "native" or "token:<address>"
        "decimals": decimals,
        "amount": amount,
        "address": address,
        "memo": memo,
        "requiredSignatures": required_signatures,
        "maxTtlSeconds": 7200,
    }


# ---------------------------------------------------------------------------
# Step 3: ES256 (P-256) assertions. Signers are COSE_Key-encoded P-256 public
# keys; signatures are DER ECDSA over the exact messageToSign bytes.
# ---------------------------------------------------------------------------


def cose_public_key(public_key) -> str:
    """Encode a cryptography EC P-256 public key as a COSE_Key (strict base64)."""
    numbers = public_key.public_numbers()
    x = numbers.x.to_bytes(32, "big")
    y = numbers.y.to_bytes(32, "big")

    def uint(n):
        return bytes([n]) if n < 24 else bytes([0x18, n])

    def neg(n):
        v = -1 - n
        return bytes([0x20 | v]) if v < 24 else bytes([0x38, v])

    def bstr(b):
        return (uint(len(b)) if len(b) < 24 else bytes([0x58, len(b)])) + b

    cose = bytes([0xA0 | 5]) + b"".join([
        uint(1) + uint(2),    # kty: EC2
        uint(3) + neg(-7),    # alg: ES256
        neg(-1) + uint(1),    # crv: P-256
        neg(-2) + bstr(x),    # x
        neg(-3) + bstr(y),    # y
    ])
    return base64.b64encode(cose).decode()


def build_assertion(signer_pem: bytes, message_to_sign: str) -> dict:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    private_key = serialization.load_pem_private_key(signer_pem, password=None)
    if not isinstance(private_key, ec.EllipticCurvePrivateKey) or private_key.curve.name != "secp256r1":
        raise SystemExit("signer key must be a P-256 (prime256v1) EC private key")
    der_signature = private_key.sign(
        message_to_sign.encode("ascii"), ec.ECDSA(hashes.SHA256())
    )
    return {
        "publicKey": cose_public_key(private_key.public_key()),
        "protocolVersion": "1",
        "algorithm": "ES256",
        "signature": base64.b64encode(der_signature).decode(),
    }


# ---------------------------------------------------------------------------
# The flow
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument("network", help="e.g. ethereum (full network name)")
    parser.add_argument("ticker", help="e.g. ETH")
    parser.add_argument("amount", help="decimal amount in whole asset units")
    parser.add_argument("address", help="whitelisted destination address")
    parser.add_argument("--memo", default=None, help="destination memo/tag, if the asset uses one")
    parser.add_argument("--account-id", type=int, required=True, help="your numeric account id")
    parser.add_argument("--required-signatures", type=int, default=1,
                        help="API signer quorum from your approved policy (ask support)")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    api_secret = os.environ.get("GEMINI_API_SECRET")
    if not api_key or not api_secret:
        raise SystemExit("set GEMINI_API_KEY and GEMINI_API_SECRET")

    signer_paths = sorted(Path(p) for p in os.environ if p.startswith("MPC_SIGNER_KEY_"))
    if not signer_paths:
        raise SystemExit("set MPC_SIGNER_KEY_1 (PEM file) for each approved signer")

    # 1. Mint the challenge
    challenge_request = {
        "operation": "withdrawal",
        "currency": args.ticker,
        "network": args.network,
        "amount": args.amount,
        "address": args.address,
    }
    if args.memo is not None:
        challenge_request["memo"] = args.memo
    challenge = signed_post("/v1/custody/challenge", challenge_request, api_key, api_secret)
    print(f"challenge minted: voucher {challenge['voucherId']} "
          f"(quorum {challenge['requiredSignatures']}, expires {challenge['expiresAt']})")

    # 2. Independently verify the challenge commits to the transfer we intend.
    #    The intent below is LOCAL truth; nothing in it comes from the response.
    intent = trusted_intent(
        account_id=args.account_id,
        network_family="evm" if args.network == "ethereum" else args.network,
        chain_network=args.network,
        currency_identifier="native",  # e.g. "token:<contract>" for ERC-20s
        decimals={"ETH": 18, "BTC": 8}.get(args.ticker, 6),
        amount=args.amount,
        address=args.address,
        memo=args.memo,
        required_signatures=args.required_signatures,
    )
    message = verify_withdrawal_challenge(challenge, intent, now=datetime.now(timezone.utc))
    print(f"challenge verified: {message}")

    # 3. Sign with every approved signer (server enforces the quorum)
    assertions = [
        build_assertion(Path(os.environ[p]).read_bytes(), message)
        for p in sorted(os.environ, key=lambda s: (len(s), s)) if p.startswith("MPC_SIGNER_KEY_")
    ]
    print(f"assertions built: {len(assertions)}")

    # 4. Submit the withdrawal bound to the exact id we signed
    withdrawal_request = {
        "amount": args.amount,
        "address": args.address,
        "mpcAuthorization": {
            "withdrawalId": challenge["voucherId"],
            "assertions": assertions,
        },
    }
    if args.memo is not None:
        withdrawal_request["memo"] = args.memo
    result = signed_post(f"/v2/withdraw/{args.network}/{args.ticker}", withdrawal_request, api_key, api_secret)
    print("withdrawal accepted:")
    print(json.dumps(result, indent=2))




# ===========================================================================
# Challenge verification — independent reconstruction of the signing context
# ===========================================================================
# Deliberately dependency-free (stdlib only) and keyless: rebuilds the canonical
# context from the COMPLETE signing strings in the response, re-derives the
# SHA-256 challenge, and validates the response against a locally trusted
# intent. Run this before signing, always.

#: Protocol constants fixed by the MPC API signing contract.
MESSAGE_PREFIX = "GEMINI-API-SIGNATURE-V1:"
CONTEXT_TYPE = "ApiAuthorizationContext"
PROTOCOL_VERSION = "1"
ACTION_TYPE = "transfer"
ALGORITHM = "ES256"

#: Canonical context field order. The digest is taken over exactly this order.
CONTEXT_FIELDS = ("contextType", "version", "accountId", "actionType", "action", "policy")

RESPONSE_FIELDS = (
    "voucherId",
    "challenge",
    "messageToSign",
    "withdrawalId",
    "requiredSignatures",
    "expiresAt",
    "algorithm",
    "signingContext",
    "signingPayload",
    "policy",
    "withdrawal",
)

INTENT_FIELDS = (
    "accountId",
    "networkFamily",
    "chainNetwork",
    "currencyIdentifier",
    "decimals",
    "amount",
    "address",
    "memo",
    "requiredSignatures",
    "maxTtlSeconds",
)

#: Fields of the V1 ``CustomerTransferIntent`` signing payload, in signing order.
WITHDRAWAL_FIELDS = (
    "withdrawalId",
    "actionType",
    "networkFamily",
    "transferLegs",
    "intentCreationTimestamp",
    "intentExpirationTimestamp",
)

# `memo` is omitted (not null) on the wire when a transfer has no memo, so an
# absent memo field is treated exactly like a null one.
LEG_FIELDS = ("destination", "memo", "amount")
AMOUNT_FIELDS = ("value", "asset")
ASSET_FIELDS = ("chainNetwork", "currencyIdentifier", "decimals")

#: Fields of the V2 ``AccountSecurityParameters`` signing payload, in signing order.
#: The V1 payload is identical minus ``requiredApiSignaturesForTransfer``; a V1
#: policy cannot authorize API signing at all.
POLICY_V2_FIELDS = (
    "voucherType",
    "accountId",
    "requiredPasskeySignaturesForTransfer",
    "requiredPasskeySignaturesForAllowlistVoucherRequest",
    "requiredApiSignaturesForTransfer",
    "creationTimestamp",
    "expirationTimestamp",
    "metadata",
)

_CHALLENGE_PATTERN = re.compile(r"\A[A-Za-z0-9_-]{43}\Z")
_DECIMAL_PATTERN = re.compile(r"\A[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\Z")
_UUID_PATTERN = re.compile(r"\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")


class VerificationError(Exception):
    """A field-specific verification failure.

    ``field`` names the response or intent field that failed, and ``reason``
    explains why. ``str(error)`` renders as ``"<field>: <reason>"``.
    """

    def __init__(self, field: str, reason: str) -> None:
        super().__init__(f"{field}: {reason}")
        self.field = field
        self.reason = reason


# ---------------------------------------------------------------------------
# Canonical context
# ---------------------------------------------------------------------------


def canonical_signing_context(account_id: int, action: str, policy: str) -> str:
    """Rebuild the canonical context exactly as the signatory does.

    Compact JSON (``separators=(",", ":")``), no trailing newline, raw UTF-8
    non-ASCII characters (``ensure_ascii=False``), fields in contract order --
    equivalent to Scala ``Json.obj(...).toString``.
    """
    return json.dumps(
        {
            "contextType": CONTEXT_TYPE,
            "version": PROTOCOL_VERSION,
            "accountId": account_id,
            "actionType": ACTION_TYPE,
            "action": action,
            "policy": policy,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )


def challenge_from_canonical_context(canonical: str) -> str:
    """SHA-256 of the UTF-8 canonical context, unpadded base64url encoded."""
    digest = hashlib.sha256(canonical.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def message_from_challenge(challenge: str) -> str:
    """The exact UTF-8 message an API signer signs for ``challenge``."""
    return MESSAGE_PREFIX + challenge


# ---------------------------------------------------------------------------
# Small typed accessors
# ---------------------------------------------------------------------------


def _object(value: Any, field: str) -> dict:
    if not isinstance(value, Mapping):
        raise VerificationError(field, f"must be a JSON object, got {type(value).__name__}")
    return dict(value)


def _require_fields(obj: Mapping[str, Any], required: tuple, field: str, *, exact: bool) -> None:
    missing = [name for name in required if name not in obj]
    if missing:
        raise VerificationError(field, "missing required field(s): " + ", ".join(missing))
    if exact:
        unexpected = sorted(name for name in obj if name not in required)
        if unexpected:
            raise VerificationError(field, "unexpected field(s): " + ", ".join(unexpected))


def _require_str(obj: Mapping[str, Any], name: str, field: str, *, allow_empty: bool = False) -> str:
    value = obj[name]
    if not isinstance(value, str):
        raise VerificationError(field, f"must be a JSON string, got {type(value).__name__}")
    if not allow_empty and not value:
        raise VerificationError(field, "must not be empty")
    return value


def _require_int(obj: Mapping[str, Any], name: str, field: str) -> int:
    value = obj[name]
    if isinstance(value, bool) or not isinstance(value, int):
        raise VerificationError(field, f"must be a JSON integer, got {type(value).__name__}")
    return value


def _require_positive_int(obj: Mapping[str, Any], name: str, field: str) -> int:
    value = _require_int(obj, name, field)
    if value <= 0:
        raise VerificationError(field, f"must be a positive integer, got {value}")
    return value


def _require_non_negative_int(obj: Mapping[str, Any], name: str, field: str) -> int:
    value = _require_int(obj, name, field)
    if value < 0:
        raise VerificationError(field, f"must not be negative, got {value}")
    return value


def _decimal_from_number(value: Any, field: str) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise VerificationError(field, f"must be a JSON number, got {type(value).__name__}")
    if isinstance(value, Decimal):
        number = value
    elif isinstance(value, int):
        number = Decimal(value)
    else:
        if value != value or value in (float("inf"), float("-inf")):
            raise VerificationError(field, "must be a finite JSON number")
        number = Decimal(repr(value))
    if not number.is_finite():
        raise VerificationError(field, "must be a finite JSON number")
    return number


def _decimal_from_string(value: Any, field: str) -> Decimal:
    if not isinstance(value, str):
        raise VerificationError(field, f"must be a decimal string, got {type(value).__name__}")
    if not _DECIMAL_PATTERN.match(value):
        raise VerificationError(field, f"is not a plain decimal string: {value!r}")
    try:
        number = Decimal(value)
    except InvalidOperation:  # pragma: no cover - the pattern above rejects these
        raise VerificationError(field, f"is not a decimal number: {value!r}") from None
    if not number.is_finite():
        raise VerificationError(field, f"must be a finite decimal: {value!r}")
    return number


def _instant(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise VerificationError(field, "must be an RFC-3339/ISO-8601 instant string")
    if "T" not in value:
        raise VerificationError(field, "must use the RFC-3339 'T' separator")
    text = value
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise VerificationError(field, f"is not a valid RFC-3339 instant: {value!r}") from None
    if parsed.tzinfo is None:
        raise VerificationError(field, "must carry an explicit timezone offset")
    return parsed.astimezone(timezone.utc)


def _uuid(value: Any, field: str) -> str:
    if not isinstance(value, str):
        raise VerificationError(field, f"must be a UUID string, got {type(value).__name__}")
    if not _UUID_PATTERN.match(value):
        raise VerificationError(field, f"is not a canonical UUID: {value!r}")
    return value


def _json_loads(text: str, field: str) -> Any:
    try:
        return json.loads(text, parse_float=Decimal)
    except json.JSONDecodeError as error:
        raise VerificationError(field, f"is not valid JSON: {error}") from None


def _json_equal(left: Any, right: Any) -> bool:
    """Structural JSON equality that ignores the parser's number type.

    Responses parsed by ``json.loads`` (float) and by ``json.loads(parse_float=Decimal)``
    must compare equal; ``1``, ``1.0`` and ``Decimal("1.0")`` are the same JSON number.
    Numbers compare at exact decimal precision (floats via their shortest repr), so
    values that only agree after rounding to float are unequal.
    """
    if isinstance(left, Mapping) or isinstance(right, Mapping):
        if not (isinstance(left, Mapping) and isinstance(right, Mapping)):
            return False
        if set(left) != set(right):
            return False
        return all(_json_equal(left[key], right[key]) for key in left)
    if isinstance(left, (list, tuple)) or isinstance(right, (list, tuple)):
        if not (isinstance(left, (list, tuple)) and isinstance(right, (list, tuple))):
            return False
        if len(left) != len(right):
            return False
        return all(_json_equal(a, b) for a, b in zip(left, right))
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left is right
    if isinstance(left, str) or isinstance(right, str):
        return isinstance(left, str) and isinstance(right, str) and left == right
    if left is None or right is None:
        return left is None and right is None
    if isinstance(left, (int, float, Decimal)) and isinstance(right, (int, float, Decimal)):
        return _decimal_from_number(left, "left") == _decimal_from_number(right, "right")
    return left == right


# ---------------------------------------------------------------------------
# Intent
# ---------------------------------------------------------------------------


def _validate_intent(intent: Mapping[str, Any]) -> dict:
    intent_obj = _object(intent, "intent")
    _require_fields(intent_obj, INTENT_FIELDS, "intent", exact=True)

    account_id = _require_positive_int(intent_obj, "accountId", "intent.accountId")
    network_family = _require_str(intent_obj, "networkFamily", "intent.networkFamily")
    chain_network = _require_str(intent_obj, "chainNetwork", "intent.chainNetwork")
    currency_identifier = _require_str(intent_obj, "currencyIdentifier", "intent.currencyIdentifier")
    decimals = _require_non_negative_int(intent_obj, "decimals", "intent.decimals")
    amount = _decimal_from_string(intent_obj["amount"], "intent.amount")
    address = _require_str(intent_obj, "address", "intent.address")

    memo = intent_obj["memo"]
    if memo is not None and not isinstance(memo, str):
        raise VerificationError("intent.memo", f"must be a string or null, got {type(memo).__name__}")

    required_signatures = _require_positive_int(intent_obj, "requiredSignatures", "intent.requiredSignatures")
    max_ttl_seconds = _require_positive_int(intent_obj, "maxTtlSeconds", "intent.maxTtlSeconds")

    return {
        "accountId": account_id,
        "networkFamily": network_family,
        "chainNetwork": chain_network,
        "currencyIdentifier": currency_identifier,
        "decimals": decimals,
        "amount": amount,
        "address": address,
        "memo": memo,
        "requiredSignatures": required_signatures,
        "maxTtlSeconds": max_ttl_seconds,
    }


def _currency_identifier_string(value: Any, field: str) -> str:
    """Canonical string form of a CTI ``currencyIdentifier`` object.

    ``{"type":"native"}`` -> ``"native"``;
    ``{"type":"token","tokenIdentifier":"<id>"}`` -> ``"token:<id>"``.
    """
    identifier = _object(value, field)
    kind = identifier.get("type")
    if kind == "native":
        _require_fields(identifier, ("type",), field, exact=True)
        return "native"
    if kind == "token":
        _require_fields(identifier, ("type", "tokenIdentifier"), field, exact=True)
        token = _require_str(identifier, "tokenIdentifier", field)
        return "token:" + token
    raise VerificationError(field + ".type", f"must be \"native\" or \"token\", got {kind!r}")


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------


def verify_withdrawal_challenge(
    response: Mapping[str, Any],
    intent: Mapping[str, Any],
    *,
    now: datetime,
) -> str:
    """Verify an API withdrawal challenge against a trusted local intent.

    Returns the verified message (``GEMINI-API-SIGNATURE-V1:<challenge>``)
    on success and raises :class:`VerificationError` otherwise.
    """
    if not isinstance(now, datetime) or now.tzinfo is None:
        raise VerificationError("now", "must be a timezone-aware datetime")
    now_utc = now.astimezone(timezone.utc)
    expected = _validate_intent(intent)
    body = _object(response, "response")
    _require_fields(body, RESPONSE_FIELDS, "response", exact=False)

    algorithm = _require_str(body, "algorithm", "algorithm")
    if algorithm != ALGORITHM:
        raise VerificationError("algorithm", f"must be {ALGORITHM!r}, got {algorithm!r}")

    voucher_id = _uuid(body["voucherId"], "voucherId")
    withdrawal_id = _uuid(body["withdrawalId"], "withdrawalId")
    if withdrawal_id != voucher_id:
        raise VerificationError(
            "withdrawalId", f"must equal voucherId {voucher_id!r} for an API transfer row, got {withdrawal_id!r}"
        )

    required_signatures = _require_positive_int(body, "requiredSignatures", "requiredSignatures")
    if required_signatures != expected["requiredSignatures"]:
        raise VerificationError(
            "requiredSignatures",
            f"is {required_signatures} but the trusted intent requires {expected['requiredSignatures']}",
        )

    expires_at = _instant(body["expiresAt"], "expiresAt")

    challenge = _require_str(body, "challenge", "challenge")
    if not _CHALLENGE_PATTERN.match(challenge):
        raise VerificationError("challenge", "must be an unpadded base64url SHA-256 digest (43 characters)")

    message_to_sign = _require_str(body, "messageToSign", "messageToSign")
    if message_to_sign != message_from_challenge(challenge):
        raise VerificationError(
            "messageToSign", f"must be exactly {message_from_challenge(challenge)!r} (prefix plus challenge)"
        )

    context = _object(body["signingContext"], "signingContext")
    _require_fields(context, CONTEXT_FIELDS, "signingContext", exact=True)
    if _require_str(context, "contextType", "signingContext.contextType") != CONTEXT_TYPE:
        raise VerificationError("signingContext.contextType", f"must be {CONTEXT_TYPE!r}")
    version = _require_str(context, "version", "signingContext.version")
    if version != PROTOCOL_VERSION:
        raise VerificationError("signingContext.version", f"must be the string {PROTOCOL_VERSION!r}, got {version!r}")
    account_id = _require_positive_int(context, "accountId", "signingContext.accountId")
    if account_id != expected["accountId"]:
        raise VerificationError(
            "signingContext.accountId", f"is {account_id} but the trusted intent is for account {expected['accountId']}"
        )
    action_type = _require_str(context, "actionType", "signingContext.actionType")
    if action_type != ACTION_TYPE:
        raise VerificationError("signingContext.actionType", f"must be {ACTION_TYPE!r}, got {action_type!r}")

    action_string = _require_str(context, "action", "signingContext.action")
    policy_string = _require_str(context, "policy", "signingContext.policy")

    signing_payload = _require_str(body, "signingPayload", "signingPayload")
    if signing_payload != action_string:
        raise VerificationError("signingPayload", "must be identical to signingContext.action")

    # The projections must be exactly the parsed signing strings.
    withdrawal = _object(_json_loads(action_string, "signingContext.action"), "signingContext.action")
    withdrawal_projection = _object(body["withdrawal"], "withdrawal")
    if not _json_equal(withdrawal_projection, withdrawal):
        raise VerificationError("withdrawal", "must equal json.loads(signingContext.action)")

    parsed_policy = _object(_json_loads(policy_string, "signingContext.policy"), "signingContext.policy")
    policy_projection = _object(body["policy"], "policy")
    if not _json_equal(policy_projection, parsed_policy):
        raise VerificationError("policy", "must equal json.loads(signingContext.policy)")

    _require_fields(withdrawal, WITHDRAWAL_FIELDS, "withdrawal", exact=True)

    if _require_str(withdrawal, "actionType", "withdrawal.actionType") != ACTION_TYPE:
        raise VerificationError("withdrawal.actionType", f"must be {ACTION_TYPE!r}")
    if _require_str(withdrawal, "networkFamily", "withdrawal.networkFamily") != expected["networkFamily"]:
        raise VerificationError(
            "withdrawal.networkFamily",
            f"is {withdrawal['networkFamily']!r} but the trusted intent is {expected['networkFamily']!r}",
        )

    legs = withdrawal["transferLegs"]
    if not isinstance(legs, list):
        raise VerificationError("withdrawal.transferLegs", f"must be a JSON array, got {type(legs).__name__}")
    if len(legs) != 1:
        raise VerificationError("withdrawal.transferLegs", f"must contain exactly one leg, got {len(legs)}")

    leg = _object(legs[0], "withdrawal.transferLegs[0]")
    # `memo` is optional on the wire (absent == null for memo-less transfers)
    _require_fields(leg, ("destination", "amount"), "withdrawal.transferLegs[0]", exact=False)

    destination = _object(leg["destination"], "withdrawal.transferLegs[0].destination")
    _require_fields(destination, ("value",), "withdrawal.transferLegs[0].destination", exact=True)
    destination_value = _require_str(destination, "value", "withdrawal.transferLegs[0].destination.value")
    if destination_value != expected["address"]:
        raise VerificationError(
            "withdrawal.transferLegs[0].destination.value",
            f"is {destination_value!r} but the trusted intent address is {expected['address']!r}",
        )

    leg_memo = leg.get("memo")  # absent == null on the wire
    if expected["memo"] is None:
        if leg_memo is not None:
            raise VerificationError(
                "withdrawal.transferLegs[0].memo",
                f"must be null for a memo-less intent, got {leg_memo!r}",
            )
    else:
        memo_object = _object(leg_memo, "withdrawal.transferLegs[0].memo")
        _require_fields(memo_object, ("value",), "withdrawal.transferLegs[0].memo", exact=True)
        memo_value = _require_str(memo_object, "value", "withdrawal.transferLegs[0].memo.value")
        if memo_value != expected["memo"]:
            raise VerificationError(
                "withdrawal.transferLegs[0].memo.value",
                f"is {memo_value!r} but the trusted intent memo is {expected['memo']!r}",
            )

    amount = _object(leg["amount"], "withdrawal.transferLegs[0].amount")
    _require_fields(amount, AMOUNT_FIELDS, "withdrawal.transferLegs[0].amount", exact=True)
    amount_value = _decimal_from_number(amount["value"], "withdrawal.transferLegs[0].amount.value")
    if amount_value != expected["amount"]:
        raise VerificationError(
            "withdrawal.transferLegs[0].amount.value",
            f"is {amount_value} but the trusted intent amount is {expected['amount']}",
        )

    asset = _object(amount["asset"], "withdrawal.transferLegs[0].amount.asset")
    _require_fields(asset, ASSET_FIELDS, "withdrawal.transferLegs[0].amount.asset", exact=True)
    chain_network = _require_str(asset, "chainNetwork", "withdrawal.transferLegs[0].amount.asset.chainNetwork")
    if chain_network != expected["chainNetwork"]:
        raise VerificationError(
            "withdrawal.transferLegs[0].amount.asset.chainNetwork",
            f"is {chain_network!r} but the trusted intent chain is {expected['chainNetwork']!r}",
        )
    currency_identifier = _currency_identifier_string(
        asset["currencyIdentifier"], "withdrawal.transferLegs[0].amount.asset.currencyIdentifier"
    )
    if currency_identifier != expected["currencyIdentifier"]:
        raise VerificationError(
            "withdrawal.transferLegs[0].amount.asset.currencyIdentifier",
            f"is {currency_identifier!r} but the trusted intent asset is "
            f"{expected['currencyIdentifier']!r} (use 'native' or 'token:<tokenIdentifier>')",
        )
    decimals = _require_non_negative_int(
        asset, "decimals", "withdrawal.transferLegs[0].amount.asset.decimals"
    )
    if decimals != expected["decimals"]:
        raise VerificationError(
            "withdrawal.transferLegs[0].amount.asset.decimals",
            f"is {decimals} but the trusted intent has {expected['decimals']}",
        )

    # Policy: account binding and the API signer quorum.
    _require_fields(parsed_policy, POLICY_V2_FIELDS, "policy", exact=True)
    voucher_type = _require_str(parsed_policy, "voucherType", "policy.voucherType")
    if voucher_type != "AccountSecurityParameters":
        raise VerificationError("policy.voucherType", f"must be 'AccountSecurityParameters', got {voucher_type!r}")
    policy_account_id = _require_positive_int(parsed_policy, "accountId", "policy.accountId")
    if policy_account_id != account_id:
        raise VerificationError(
            "policy.accountId",
            f"is {policy_account_id} but the signing context account is {account_id}",
        )
    _require_positive_int(
        parsed_policy, "requiredPasskeySignaturesForTransfer", "policy.requiredPasskeySignaturesForTransfer"
    )
    _require_positive_int(
        parsed_policy,
        "requiredPasskeySignaturesForAllowlistVoucherRequest",
        "policy.requiredPasskeySignaturesForAllowlistVoucherRequest",
    )
    policy_signatures = _require_positive_int(
        parsed_policy, "requiredApiSignaturesForTransfer", "policy.requiredApiSignaturesForTransfer"
    )
    if policy_signatures != required_signatures:
        raise VerificationError(
            "policy.requiredApiSignaturesForTransfer",
            f"is {policy_signatures} but the response requires {required_signatures} API signatures",
        )
    policy_created_at = _instant(parsed_policy["creationTimestamp"], "policy.creationTimestamp")
    policy_expires_at = _instant(parsed_policy["expirationTimestamp"], "policy.expirationTimestamp")
    if policy_expires_at <= policy_created_at:
        raise VerificationError(
            "policy.expirationTimestamp", "must be after policy.creationTimestamp"
        )
    _object(parsed_policy["metadata"], "policy.metadata")

    # Ids must agree across the signed payload, the response and the context.
    withdrawal_id_value = _uuid(withdrawal["withdrawalId"], "withdrawal.withdrawalId")
    if withdrawal_id_value != withdrawal_id:
        raise VerificationError(
            "withdrawal.withdrawalId",
            f"is {withdrawal_id_value!r} but the response withdrawalId is {withdrawal_id!r}",
        )

    # Time window: created now or earlier, still valid, and inside the local maximum.
    creation = _instant(withdrawal["intentCreationTimestamp"], "withdrawal.intentCreationTimestamp")
    expiration = _instant(withdrawal["intentExpirationTimestamp"], "withdrawal.intentExpirationTimestamp")
    if creation > now_utc:
        raise VerificationError(
            "withdrawal.intentCreationTimestamp",
            f"is in the future ({creation.isoformat()}) relative to {now_utc.isoformat()}",
        )
    if expiration <= creation:
        raise VerificationError(
            "withdrawal.intentExpirationTimestamp", "must be after withdrawal.intentCreationTimestamp"
        )
    if expiration <= now_utc:
        raise VerificationError(
            "withdrawal.intentExpirationTimestamp",
            f"has already elapsed ({expiration.isoformat()}) relative to {now_utc.isoformat()}",
        )
    lifetime = expiration - creation
    if lifetime > timedelta(seconds=expected["maxTtlSeconds"]):
        raise VerificationError(
            "withdrawal.intentExpirationTimestamp",
            f"grants a lifetime of {int(lifetime.total_seconds())}s, above the trusted maximum of "
            f"{expected['maxTtlSeconds']}s",
        )
    if expires_at != expiration:
        raise VerificationError(
            "expiresAt",
            f"is {expires_at.isoformat()} but the signed intent expires at {expiration.isoformat()}",
        )

    # Independent reconstruction: never hash a digest supplied by the server.
    canonical = canonical_signing_context(account_id, action_string, policy_string)
    derived_challenge = challenge_from_canonical_context(canonical)
    if derived_challenge != challenge:
        raise VerificationError(
            "challenge",
            f"is {challenge!r} but the canonical context hashes to {derived_challenge!r}",
        )

    return message_from_challenge(challenge)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _load_json(path: str, field: str) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle, parse_float=Decimal)
    except OSError as error:
        raise VerificationError(field, f"cannot read {path!r}: {error}") from None
    except json.JSONDecodeError as error:
        raise VerificationError(field, f"{path!r} is not valid JSON: {error}") from None


if __name__ == "__main__":
    main()
