"""Fan-out of gesture events to WebSocket clients.

The camera loop runs in a worker thread; events are handed to the asyncio loop
with call_soon_threadsafe. Each client has a bounded queue: if a slow client
falls behind, stale *cursor* events are dropped (only the newest position
matters), but gesture/hand/status events are never dropped.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable

from fastapi import WebSocket, WebSocketDisconnect

log = logging.getLogger("vision.ws")


class _Client:
    def __init__(self, websocket: WebSocket, maxsize: int = 64) -> None:
        self.websocket = websocket
        self.queue: asyncio.Queue[str] = asyncio.Queue(maxsize=maxsize)
        self.dropped = 0

    def offer(self, message: str, droppable: bool) -> None:
        if self.queue.full():
            if droppable:
                self.dropped += 1
                return
            try:  # make room for an important event
                self.queue.get_nowait()
                self.dropped += 1
            except asyncio.QueueEmpty:  # pragma: no cover
                pass
        self.queue.put_nowait(message)


class Broadcaster:
    def __init__(self) -> None:
        self._clients: set[_Client] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    @property
    def client_count(self) -> int:
        return len(self._clients)

    def publish_threadsafe(self, event: dict[str, Any]) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            loop.call_soon_threadsafe(self.publish, event)
        except RuntimeError:  # loop shutting down
            pass

    def publish(self, event: dict[str, Any]) -> None:
        if not self._clients:
            return
        message = json.dumps(event, separators=(",", ":"))
        droppable = event.get("type") == "cursor"
        for client in list(self._clients):
            client.offer(message, droppable)

    async def serve(self, websocket: WebSocket, initial: Callable[[], list[dict[str, Any]]] | None = None) -> None:
        await websocket.accept()
        client = _Client(websocket)
        self._clients.add(client)
        log.info("gesture client connected (%d total)", len(self._clients))
        try:
            for event in initial() if initial else []:
                client.offer(json.dumps(event, separators=(",", ":")), droppable=False)

            async def sender() -> None:
                while True:
                    message = await client.queue.get()
                    await websocket.send_text(message)

            async def receiver() -> None:
                # We don't expect client messages; reading detects disconnects promptly.
                while True:
                    await websocket.receive_text()

            tasks = [asyncio.create_task(sender()), asyncio.create_task(receiver())]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in done:
                exc = task.exception()
                if exc and not isinstance(exc, (WebSocketDisconnect, RuntimeError)):
                    log.debug("websocket task ended: %r", exc)
        except WebSocketDisconnect:
            pass
        finally:
            self._clients.discard(client)
            log.info("gesture client disconnected (%d total)", len(self._clients))
