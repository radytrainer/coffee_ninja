import numpy as np

from camera.camera_manager import CameraManager, CameraStatus


class FakeCapture:
    def __init__(self, opened=True, frames=None):
        self._opened = opened
        self.frames = list(frames or [])
        self.released = False

    def isOpened(self):
        return self._opened

    def set(self, *_):
        return True

    def read(self):
        if not self.frames:
            return False, None
        return True, self.frames.pop(0)

    def release(self):
        self.released = True


def frame(value=0):
    img = np.zeros((4, 6, 3), dtype=np.uint8)
    img[:, 0] = value  # left column marked so mirroring is visible
    return img


def test_unavailable_camera_does_not_raise():
    cam = CameraManager(capture_factory=lambda i, b: FakeCapture(opened=False))
    assert cam.start() is False
    assert cam.status == CameraStatus.UNAVAILABLE
    assert "could not be opened" in cam.last_error
    assert cam.read() is None


def test_start_read_and_mirror():
    cam = CameraManager(mirror=True, capture_factory=lambda i, b: FakeCapture(frames=[frame(9), frame(9)]))
    assert cam.start() is True
    assert cam.status == CameraStatus.RUNNING
    img = cam.read()
    assert img is not None
    assert img[0, -1, 0] == 9 and img[0, 0, 0] == 0  # flipped horizontally


def test_disconnect_is_detected_after_repeated_failures():
    cam = CameraManager(capture_factory=lambda i, b: FakeCapture(frames=[frame()]))
    assert cam.start()
    for _ in range(CameraManager.MAX_CONSECUTIVE_FAILURES):
        assert cam.read() is None
    assert cam.status == CameraStatus.UNAVAILABLE


def test_restart_and_select_device():
    calls = []

    def factory(index, backend):
        calls.append(index)
        return FakeCapture(frames=[frame()] * 3)

    cam = CameraManager(index=0, capture_factory=factory)
    assert cam.start()
    assert cam.restart()
    assert cam.select(2)
    assert cam.index == 2 and calls[-1] == 2
    cam.stop()
    assert cam.status == CameraStatus.STOPPED
