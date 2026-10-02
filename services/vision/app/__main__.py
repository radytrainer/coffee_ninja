"""Run the vision service:  python -m app"""

import logging

import uvicorn

from config.settings import get_settings


def main() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )
    uvicorn.run(
        "app.main:app",
        host=settings.vision_host,
        port=settings.vision_port,
        log_level=settings.log_level.lower(),
        ws_ping_interval=20,
        ws_ping_timeout=20,
    )


if __name__ == "__main__":
    main()
