from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

from .config import API_PORT
from .db import ensure_schema, list_projects, save_project

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = BASE_DIR / "dist"
ASSETS_DIR = DIST_DIR / "assets"


def create_app() -> Flask:
    ensure_schema()

    app = Flask(__name__, static_folder=None)

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True})

    @app.get("/api/projects")
    def get_projects():
        published_only = request.args.get("published") in {"true", "1"}
        return jsonify(list_projects(published_only=published_only))

    @app.get("/favicon.ico")
    def favicon():
        return "", 204

    @app.get("/.well-known/appspecific/com.chrome.devtools.json")
    def chrome_devtools_metadata():
        return jsonify({})

    @app.post("/api/projects")
    def post_project():
        payload = request.get_json(silent=True) or {}
        return jsonify(save_project(payload))

    @app.get("/assets/<path:filename>")
    def frontend_assets(filename: str):
        return send_from_directory(ASSETS_DIR, filename)

    @app.get("/")
    @app.get("/user")
    @app.get("/user/<path:_path>")
    def frontend(_path: str | None = None):
        return send_from_directory(DIST_DIR, "index.html")

    @app.errorhandler(Exception)
    def handle_error(error: Exception):
        if isinstance(error, HTTPException):
            return error

        app.logger.exception(error)
        return jsonify({"message": "Unexpected server error."}), 500

    return app


if __name__ == "__main__":
    api = create_app()
    print(f"Ayuda app listening on http://127.0.0.1:{API_PORT}")
    api.run(host="127.0.0.1", port=API_PORT, debug=False, threaded=True)
