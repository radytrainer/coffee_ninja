"""✋ Open palm moved sideways → swipe; open palm held still → back."""

import random
import statistics

from config.settings import GestureTuning
from gestures.engine import GestureEngine

from . import hands

FRAME = 33


def engine(**overrides) -> GestureEngine:
    return GestureEngine(GestureTuning(**{"open_palm_hold_ms": 1000, **overrides}))


def run(e: GestureEngine, observations, start=0):
    events = []
    for i, obs in enumerate(observations):
        events.extend(e.update(obs, start + i * FRAME))
    return events


def swipes(events, phase=None):
    return [ev for ev in events if ev["type"] == "swipe" and (phase is None or ev["phase"] == phase)]


def backs(events):
    return [ev for ev in events if ev["type"] == "gesture" and ev["gesture"] == "open_palm"]


def test_palm_moving_sideways_swipes_and_never_goes_back():
    frames = [hands.open_palm(offset=(0.012 * i, 0)) for i in range(45)]  # ~1.5 s moving right
    events = run(engine(), frames)
    assert len(swipes(events, "start")) == 1
    assert sum(ev["dx"] for ev in swipes(events, "move")) > 0.3
    assert backs(events) == []


def test_swipe_to_the_left_reports_negative_movement():
    events = run(engine(), [hands.open_palm(offset=(-0.012 * i, 0)) for i in range(20)])
    assert sum(ev["dx"] for ev in swipes(events, "move")) < -0.1


def test_still_palm_still_goes_back():
    events = run(engine(), [hands.open_palm()] * 45)
    assert len(backs(events)) == 1
    assert swipes(events) == []


def test_small_wobble_is_neither_a_swipe_nor_blocks_back():
    rng = random.Random(1)
    frames = [hands.open_palm(offset=(rng.uniform(-0.008, 0.008), rng.uniform(-0.008, 0.008))) for _ in range(45)]
    events = run(engine(), frames)
    assert swipes(events) == []
    assert len(backs(events)) == 1


def test_swipe_ends_when_the_hand_closes_but_survives_brief_dropouts():
    e = engine()
    moving = [hands.open_palm(offset=(0.012 * i, 0)) for i in range(15)]
    events = run(e, moving)
    assert len(swipes(events, "start")) == 1
    # two misclassified frames mid-swipe (motion blur) → swipe continues
    events = run(e, [hands.fist(offset=(0.18, 0))] * 2 + [hands.open_palm(offset=(0.012 * i, 0)) for i in range(15, 20)], start=500)
    assert swipes(events, "end") == []
    events = run(e, [hands.fist(offset=(0.24, 0))] * 7, start=900)  # closed ~0.2 s → ends
    assert len(swipes(events, "end")) == 1


def test_swipe_ends_when_the_hand_leaves():
    e = engine()
    run(e, [hands.open_palm(offset=(0.012 * i, 0)) for i in range(15)])
    assert len(swipes(e.update(None, 600), "end")) == 1


def test_vertical_palm_movement_is_not_a_swipe():
    events = run(engine(), [hands.open_palm(offset=(0, -0.01 * i)) for i in range(20)])
    assert swipes(events) == []


def test_cursor_reports_swiping_and_no_clicks_while_swiping():
    events = run(engine(), [hands.open_palm(offset=(0.012 * i, 0)) for i in range(20)])
    cursors = [ev for ev in events if ev["type"] == "cursor"]
    assert cursors[-1]["swiping"] is True
    assert [ev for ev in events if ev.get("gesture") == "pinch"] == []


def test_swipe_stream_is_smooth_despite_landmark_jitter():
    rng = random.Random(5)
    frames = [hands.open_palm(offset=(0.01 * i + rng.uniform(-0.004, 0.004), rng.uniform(-0.004, 0.004))) for i in range(60)]
    moves = swipes(run(engine(), frames), "move")[3:]
    dxs = [m["dx"] for m in moves]
    assert len(dxs) >= 40  # continuous, no stop-start
    assert all(dx > 0 for dx in dxs)  # never jerks backwards
    assert statistics.pstdev(dxs) < statistics.mean(dxs) * 0.6


def test_raising_the_hand_first_then_swiping_still_works():
    """Real use: the hand comes up into view (vertical), pauses, then moves sideways."""
    frames = [hands.open_palm(offset=(0, 0.25 - 0.025 * i)) for i in range(11)]
    frames += [hands.open_palm()] * 5
    frames += [hands.open_palm(offset=(-0.015 * i, 0)) for i in range(1, 16)]
    events = run(engine(), frames)
    assert len(swipes(events, "start")) == 1
    assert sum(ev["dx"] for ev in swipes(events, "move")) < -0.1
    assert backs(events) == []


def test_diagonal_raise_and_swipe_in_one_motion():
    frames = [hands.open_palm(offset=(0.012 * i, 0.2 - 0.012 * i)) for i in range(10)]
    frames += [hands.open_palm(offset=(0.12 + 0.015 * i, 0.08)) for i in range(1, 15)]
    events = run(engine(), frames)
    assert len(swipes(events, "start")) == 1


def test_wiping_back_and_forth_moves_once_and_the_return_stroke_is_ignored():
    """Recorded real behaviour: sweep left, then bring the hand back to the start."""
    out = [hands.open_palm(offset=(-0.018 * i, 0)) for i in range(12)]  # sweep left
    back = [hands.open_palm(offset=(-0.2 + 0.018 * i, 0)) for i in range(1, 12)]  # return right
    events = run(engine(), out + back)
    assert len(swipes(events, "start")) == 1
    assert len(swipes(events, "end")) == 1
    total = sum(ev["dx"] for ev in swipes(events, "move"))
    assert total < -0.15  # net movement stays to the left — the return didn't undo it
    assert backs(events) == []


def test_a_deliberate_swipe_the_other_way_after_a_pause_works():
    e = engine()
    left = [hands.open_palm(offset=(-0.018 * i, 0)) for i in range(12)]
    turn = [hands.open_palm(offset=(-0.2 + 0.01 * i, 0)) for i in range(1, 6)]  # turn around a little
    pause = [hands.open_palm(offset=(-0.15, 0))] * 25  # ~0.8 s still
    right = [hands.open_palm(offset=(-0.15 + 0.018 * i, 0)) for i in range(1, 12)]
    events = run(e, left + turn + pause + right)
    assert len(swipes(events, "start")) == 2
    starts = swipes(events, "start")
    moves_after_second = [ev for ev in events[events.index(starts[1]):] if ev["type"] == "swipe" and ev["phase"] == "move"]
    assert sum(ev["dx"] for ev in moves_after_second) > 0.1
