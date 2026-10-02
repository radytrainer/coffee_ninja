"""Hand scroll / swipe (✌️ pose). A second hand in view never changes anything."""

from config.settings import GestureTuning
from gestures.engine import GestureEngine

from . import hands

FRAME = 33


def engine(**overrides) -> GestureEngine:
    return GestureEngine(GestureTuning(**{"pinch_min_frames": 2, "pinch_cooldown_ms": 300, **overrides}))


def run(e: GestureEngine, observations, start=0):
    events = []
    for i, obs in enumerate(observations):
        events.extend(e.update(obs, start + i * FRAME))
    return events


def of(events, kind, phase=None):
    return [ev for ev in events if ev["type"] == kind and (phase is None or ev.get("phase") == phase)]


def clicks(events):
    return [ev for ev in events if ev["type"] == "gesture" and ev["gesture"] == "pinch"]


# ------------------------------------------------------------------ scroll


def test_two_finger_pose_starts_scrolling_after_activation_time():
    e = engine(scroll_activation_ms=150)
    events = run(e, [hands.two_fingers()] * 3)  # ~66 ms
    assert of(events, "scroll") == []
    events = run(e, [hands.two_fingers()] * 6, start=100)
    assert len(of(events, "scroll", "start")) == 1
    assert e.scrolling


def test_scroll_moves_follow_the_hand():
    e = engine(scroll_activation_ms=0)
    frames = [hands.two_fingers(offset=(0, 0.0))] * 2 + [hands.two_fingers(offset=(0, -0.02 * i)) for i in range(1, 10)]
    events = run(e, frames)
    moves = of(events, "scroll", "move")
    assert len(moves) >= 5
    assert all(m["dy"] < 0 for m in moves)  # hand moved up → negative dy
    assert all(abs(m["dx"]) < 1e-6 for m in moves)


def test_scroll_ignores_jitter_when_still():
    e = engine(scroll_activation_ms=0)
    events = run(e, [hands.two_fingers()] * 15)
    assert of(events, "scroll", "move") == []


def test_scroll_ends_when_pose_changes_and_never_clicks():
    e = engine(scroll_activation_ms=0)
    events = run(e, [hands.two_fingers()] * 5 + [hands.point()] * 4)
    assert len(of(events, "scroll", "end")) == 1
    assert not e.scrolling
    assert clicks(events) == []


def test_brief_pose_dropout_does_not_end_scroll():
    e = engine(scroll_activation_ms=0)
    events = run(e, [hands.two_fingers()] * 5 + [hands.point()] + [hands.two_fingers()] * 3)
    assert of(events, "scroll", "end") == []
    assert e.scrolling


def test_cursor_reports_scrolling_flag():
    e = engine(scroll_activation_ms=0)
    events = run(e, [hands.two_fingers()] * 4)
    assert [ev for ev in events if ev["type"] == "cursor"][-1]["scrolling"] is True


# ------------------------------------------------------------------ swipe & other hands


def test_scroll_reports_horizontal_movement_for_swiping():
    e = engine(scroll_activation_ms=0)
    frames = [hands.two_fingers(offset=(0.01 * i, 0)) for i in range(20)]  # hand moves right
    moves = of(run(e, frames), "scroll", "move")
    assert moves and sum(m["dx"] for m in moves) > 0.08
    assert abs(sum(m["dy"] for m in moves)) < 0.02


def test_a_second_hand_in_view_never_disables_clicks():
    e = engine()
    other = hands.point(offset=(0.25, 0))  # someone else's hand, or the customer's other hand
    events = run(e, [[hands.point(), other]] * 12 + [[hands.pinch(), other]] * 3)
    assert len(clicks(events)) == 1
    assert of(events, "zoom") == []
    assert "twoHands" not in [ev for ev in events if ev["type"] == "cursor"][-1]


def test_cursor_stays_on_the_same_hand_when_a_second_appears():
    e = engine(cursor_smoothing=0.0)
    run(e, [[hands.point(offset=(-0.2, 0))]] * 3)
    before = [ev for ev in e.update([hands.point(offset=(-0.2, 0))], 200) if ev["type"] == "cursor"][-1]["x"]
    # second hand appears on the right, listed first by the detector
    after = [ev for ev in e.update([hands.point(offset=(0.2, 0)), hands.point(offset=(-0.2, 0))], 233) if ev["type"] == "cursor"][-1]["x"]
    assert abs(after - before) < 0.02


# ------------------------------------------------------------------ smoothness (noisy real-world input)
import random
import statistics


def test_scroll_stream_is_smooth_despite_landmark_jitter():
    rng = random.Random(7)
    e = engine(scroll_activation_ms=0)
    # Hand moves steadily upward (0.006 per frame) with ±0.004 landmark noise.
    frames = [hands.two_fingers(offset=(rng.uniform(-0.004, 0.004), -0.006 * i + rng.uniform(-0.004, 0.004))) for i in range(60)]
    moves = of(run(e, frames), "scroll", "move")[10:]  # after the filter settles
    dys = [m["dy"] for m in moves]
    assert len(dys) >= 40  # continuous stream, no stop-start
    assert all(dy < 0 for dy in dys)  # never jerks backwards
    assert statistics.pstdev(dys) < abs(statistics.mean(dys)) * 0.6  # steady speed
