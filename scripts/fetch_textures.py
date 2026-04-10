#!/usr/bin/env python3
"""Download Earth textures into public/textures/ (self-hosted, no CDN at runtime)."""

from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "textures"
BASE = "https://threejs.org/examples/textures/planets/"

FILES = [
    "earth_atmos_2048.jpg",
    "earth_normal_2048.jpg",
    "earth_specular_2048.jpg",
    "earth_clouds_1024.png",
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        url = BASE + name
        dest = OUT / name
        print(f"Fetching {url} -> {dest.relative_to(ROOT)}")
        urllib.request.urlretrieve(url, dest)
    print("Done.")


if __name__ == "__main__":
    main()
