from config.settings import GestureTuning
from gestures.engine import GestureEngine
from gestures.face import EyesClosedDetector
from hand_tracking.face_tracker import FaceObservation

from . import hands

FRAME = 33
OPEN = FaceObservation(0.05, 0.08)
CLOSED = FaceObservation(0.85, 0.9)


def run(detector: EyesClosedDetector, faces, start=0) -> int:
    return sum(detector.update(f, start + i * FRAME) for i, f in enumerate(faces))


def test_a_normal_blink_does_not_go_back():
    d = EyesClosedDetector(hold_ms=1000)
    assert run(d, [OPEN] * 10 + [CLOSED] * 6 + [OPEN] * 10) == 0  # ~200 ms blink


def test_eyes_held_closed_fire_once():
    d = EyesClosedDetector(hold_ms=1000)
    assert run(d, [OPEN] * 5 + [CLOSED] * 60) == 1  # 2 s closed → still only once


def test_must_open_eyes_before_it_can_fire_again():
    d = EyesClosedDetector(hold_ms=500)
    assert run(d, [OPEN] * 5 + [CLOSED] * 30 + [OPEN] * 5 + [CLOSED] * 30) == 2


def test_face_arriving_with_eyes_already_closed_never_fires():
    # e.g. someone looking down at their phone in front of the kiosk
    d = EyesClosedDetector(hold_ms=500)
    assert run(d, [CLOSED] * 60) == 0


def test_winking_is_not_closing_both_eyes():
    d = EyesClosedDetector(hold_ms=500)
    assert run(d, [OPEN] * 5 + [FaceObservation(0.9, 0.1)] * 60) == 0


def test_brief_flicker_does_not_restart_the_hold():
    d = EyesClosedDetector(hold_ms=1000)
    faces = [OPEN] * 5 + [CLOSED] * 18 + [FaceObservation(0.45, 0.9)] * 2 + [CLOSED] * 15
    assert run(d, faces) == 1


def test_losing_the_face_disarms():
    d = EyesClosedDetector(hold_ms=500)
    assert run(d, [OPEN] * 5 + [None] * 3 + [CLOSED] * 30) == 0


def engine(**overrides) -> GestureEngine:
    return GestureEngine(GestureTuning(**overrides))


def face_events(e: GestureEngine, faces, start=0):
    events = []
    for i, f in enumerate(faces):
        events += e.update_face(f, start + i * FRAME)
    return events


def test_engine_emits_eyes_closed_gesture():
    events = face_events(engine(eyes_closed_hold_ms=1000), [OPEN] * 5 + [CLOSED] * 40)
    assert [ev["gesture"] for ev in events] == ["eyes_closed"]
    assert events[0]["type"] == "gesture" and events[0]["confidence"] > 0.5


def test_engine_can_disable_the_face_gesture():
    assert face_events(engine(eyes_closed_back=False), [OPEN] * 5 + [CLOSED] * 60) == []


def test_eyes_closed_shares_the_back_cooldown_with_open_palm():
    e = engine(open_palm_hold_ms=300, eyes_closed_hold_ms=500, gesture_cooldown_ms=5000)
    events = []
    for i in range(15):  # open palm → back at ~300 ms
        events += e.update(hands.open_palm(), i * FRAME)
    events += face_events(e, [OPEN] * 5 + [CLOSED] * 30, start=15 * FRAME)
    names = [ev["gesture"] for ev in events if ev["type"] == "gesture"]
    assert names == ["open_palm"]  # the eyes-closed "back" right after is suppressed


def test_default_is_quick_but_still_ignores_slow_blinks():
    e = GestureEngine(GestureTuning())
    assert e.tuning.eyes_closed_hold_ms == 600
    # a slow 0.4 s blink is not "back"
    assert face_events(e, [OPEN] * 5 + [CLOSED] * 12 + [OPEN] * 5) == []
    # ~0.66 s closed is
    events = face_events(GestureEngine(GestureTuning()), [OPEN] * 5 + [CLOSED] * 20)
    assert [ev["gesture"] for ev in events] == ["eyes_closed"]
