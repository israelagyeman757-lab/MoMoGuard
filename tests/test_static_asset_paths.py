from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

APPS = (
    ("phone-page", "styles.css", "app.js"),
    ("community-console", "styles.css", "app.js"),
    ("training-app", "styles.css", "app.js"),
)


def test_static_apps_use_absolute_asset_paths():
    """Relative ./styles.css breaks when the page is served without a trailing slash."""
    for folder, css, js in APPS:
        html = (REPO / folder / "index.html").read_text(encoding="utf-8")
        assert f'href="/{folder}/{css}"' in html, f"{folder} index must link {css} with absolute path"
        assert f'src="/{folder}/{js}"' in html, f"{folder} index must load {js} with absolute path"
        assert "./styles.css" not in html, f"{folder} must not use relative ./styles.css"


def test_vercel_static_app_redirects():
    import json

    config = json.loads((REPO / "vercel.json").read_text(encoding="utf-8"))
    assert "trailingSlash" not in config
    redirects = {r["source"] for r in config.get("redirects", [])}
    assert "/phone-page" in redirects
    assert "/community-console" in redirects
    assert "/training-app" in redirects