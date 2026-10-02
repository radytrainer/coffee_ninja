import hashlib
import hmac
import re

from config.settings import GestureTuning
from gestures.engine import GestureEngine
from gestures.smile import SmileDetector, sign_smile_token
from hand_tracking.face_tracker import FaceObservation

FRAME = 33
SECRET = "test-smile-secret-that-is-long-enough-0123456789"
NEUTRAL = FaceObservation(0.05, 0.05, 0.05, 0.08)
SMILE = FaceObservation(0.2, 0.2, 0.8, 0.75)
BIG_SMILE_SQUINT = FaceObservation(0.7, 0.7, 0.9, 0.9)  # eyes narrow when laughing


def run(detector: SmileDetector, faces) -> int:
    return sum(detector.update(f, i * FRAME) for i, f in enumerate(faces))


def test_token_format_matches_the_api():
    token = sign_smile_token(SECRET, issued_at_ms=1_790_000_000_000, nonce="ab" * 16)
    match = re.fullmatch(r"v1\.([a-f0-9]{32})\.(\d{13})\.([a-f0-9]{64})", token)
    assert match
    expected = hmac.new(SECRET.encode(), f"v1.{'ab' * 16}.1790000000000".encode(), hashlib.sha256).hexdigest()
    assert match.group(3) == expected
    assert sign_smile_token(SECRET) != sign_smile_token(SECRET)  # fresh nonce each time


def test_a_quick_grin_is_not_enough():
    assert run(SmileDetector(hold_ms=800), [NEUTRAL] * 5 + [SMILE] * 10 + [NEUTRAL] * 5) == 0  # ~330 ms


def test_held_smile_fires_once_until_the_face_relaxes():
    d = SmileDetector(hold_ms=800)
    assert run(d, [NEUTRAL] * 5 + [SMILE] * 60) == 1
    assert run(SmileDetector(hold_ms=500), [NEUTRAL] * 5 + [SMILE] * 30 + [NEUTRAL] * 5 + [SMILE] * 30) == 2


def test_a_face_that_arrives_already_smiling_must_relax_first():
    assert run(SmileDetector(hold_ms=500), [SMILE] * 60) == 0


def test_half_smile_does_not_count():
    assert run(SmileDetector(hold_ms=500), [NEUTRAL] * 5 + [FaceObservation(0.1, 0.1, 0.9, 0.1)] * 60) == 0


def engine(secret=SECRET, **overrides) -> GestureEngine:
    return GestureEngine(GestureTuning(**overrides), smile_secret=secret)


def feed(e: GestureEngine, faces):
    events = []
    for i, f in enumerate(faces):
        events += e.update_face(f, i * FRAME)
    return events


def test_engine_issues_a_signed_smile_token_and_face_feedback():
    events = feed(engine(smile_hold_ms=500), [NEUTRAL] * 5 + [SMILE] * 30)
    smiles = [ev for ev in events if ev["type"] == "smile"]
    assert len(smiles) == 1 and smiles[0]["token"].startswith("v1.")
    faces = [ev for ev in events if ev["type"] == "face"]
    assert faces and all(ev["faceDetected"] for ev in faces)
    assert max(ev["smileProgress"] for ev in faces) > 0.5
    assert len(faces) < 35 / 3  # throttled, not one per frame


def test_no_secret_means_no_smile_tokens_or_face_events():
    assert feed(engine(secret=""), [NEUTRAL] * 5 + [SMILE] * 40) == []


def test_face_lost_event_is_sent_once():
    events = feed(engine(), [NEUTRAL] * 3 + [None] * 5)
    lost = [ev for ev in events if ev["type"] == "face" and not ev["faceDetected"]]
    assert len(lost) == 1


def test_laughing_squint_never_triggers_eyes_closed_back():
    events = feed(engine(eyes_closed_hold_ms=500), [NEUTRAL] * 5 + [BIG_SMILE_SQUINT] * 60)
    assert [ev for ev in events if ev.get("gesture") == "eyes_closed"] == []
