from config.settings import GestureTuning
from gestures.engine import GestureEngine

from . import hands

FRAME = 33


def engine(**overrides) -> GestureEngine:
    return GestureEngine(GestureTuning(**{"pinch_min_frames": 2, "pinch_cooldown_ms": 300, **overrides}))


def feed(e: GestureEngine, observations, start=0):
    events = []
    for i, obs in enumerate(observations):
        events.extend(e.update(obs, start + i * FRAME))
    return events


def gestures(events, name=None):
    return [ev for ev in events if ev["type"] == "gesture" and (name is None or ev["gesture"] == name)]


def test_emits_cursor_and_hand_events():
    e = engine()
    events = feed(e, [hands.point()] * 3)
    assert events[0] == {"type": "hand", "handDetected": True, "timestamp": events[0]["timestamp"]}
    cursors = [ev for ev in events if ev["type"] == "cursor"]
    assert len(cursors) == 3
    c = cursors[-1]
    assert c["handDetected"] and c["pointing"] and not c["pinching"]
    assert 0 <= c["x"] <= 1 and 0 <= c["y"] <= 1
    assert set(c) >= {"x", "y", "rawX", "rawY", "pinchStrength", "timestamp"}


def test_cursor_follows_the_index_fingertip():
    e = engine(cursor_smoothing=0.0)
    left = feed(e, [hands.point(offset=(-0.1, 0))] * 2)
    right = feed(e, [hands.point(offset=(0.1, 0))] * 2)
    lx = [ev for ev in left if ev["type"] == "cursor"][-1]["x"]
    rx = [ev for ev in right if ev["type"] == "cursor"][-1]["x"]
    assert rx > lx


def test_pinch_emits_exactly_one_click_with_stable_position():
    e = engine()
    seq = [hands.point()] * 10 + [hands.pinch()] * 10 + [hands.point()] * 5
    events = feed(e, seq)
    clicks = gestures(events, "pinch")
    assert len(clicks) == 1
    assert clicks[0]["confidence"] >= 0.6
    # Click position comes from before the fingers closed (the pointing position).
    pointing_cursor = [ev for ev in events if ev["type"] == "cursor"][8]
    assert abs(clicks[0]["x"] - pointing_cursor["x"]) < 0.02
    assert abs(clicks[0]["y"] - pointing_cursor["y"]) < 0.02
    assert any(ev.get("pinching") for ev in events if ev["type"] == "cursor")


def test_single_frame_pinch_is_debounced():
    e = engine()
    events = feed(e, [hands.point()] * 5 + [hands.pinch()] + [hands.point()] * 5)
    assert gestures(events, "pinch") == []


def test_open_palm_must_be_held_to_go_back():
    e = engine(open_palm_hold_ms=1000)
    short = feed(e, [hands.open_palm()] * 10)  # ~330 ms
    assert gestures(short, "open_palm") == []
    e2 = engine(open_palm_hold_ms=1000)
    long = feed(e2, [hands.open_palm()] * 45)  # ~1.5 s
    assert len(gestures(long, "open_palm")) == 1


def test_thumbs_up_confirm():
    e = engine(thumbs_up_hold_ms=600)
    events = feed(e, [hands.thumbs_up()] * 30)
    assert len(gestures(events, "thumbs_up")) == 1


def test_gesture_cooldown_between_actions():
    e = engine(open_palm_hold_ms=300, gesture_cooldown_ms=5000)
    events = feed(e, [hands.open_palm()] * 15 + [hands.fist()] * 15 + [hands.open_palm()] * 15)
    assert len(gestures(events, "open_palm")) == 1


def test_hand_lost_resets_state():
    e = engine()
    feed(e, [hands.point()] * 3 + [hands.pinch()] * 5)
    lost = e.update(None, 1000)
    assert {"type": "hand", "handDetected": False} in [{k: v for k, v in ev.items() if k != "timestamp"} for ev in lost]
    assert any(ev["type"] == "cursor" and ev["handDetected"] is False for ev in lost)
    assert e.update(None, 1100) == []  # no repeated events
    assert e.pinch.pinching is False


def test_live_reconfiguration():
    e = engine()
    e.configure(GestureTuning(pinch_threshold=0.2, pinch_release_threshold=0.3, cursor_smoothing=0.1))
    assert e.pinch.threshold == 0.2
    assert e.smoother.smoothing == 0.1
