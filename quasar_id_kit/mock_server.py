#!/usr/bin/env python3
"""
Quasar ID & Messenger Mock Server for Meowave
Standalone local server running on Python standard library without external dependencies.
Provides auth, user profile, profile music pinning, and messenger sync endpoints.
"""

import http.server
import socketserver
import json
import uuid
import time
import hashlib
from urllib.parse import urlparse

PORT = 8088

# In-memory storage for demonstration & testing
DB = {
    "users": {
        "test@quasar.id": {
            "id": "usr_quasar_001",
            "username": "kotyar",
            "email": "test@quasar.id",
            "password_hash": hashlib.sha256("password123".encode()).hexdigest(),
            "display_name": "Kotyar",
            "avatar_url": "https://avatars.githubusercontent.com/u/1000001",
            "created_at": time.time(),
            "profile_music": {
                "id": "ytm_mock_01",
                "service": "ytm",
                "title": "Соль личностей",
                "artist": "ВШБ feat. cosmoboy",
                "artwork_url": "",
                "duration": 162,
                "pinned_at": time.time()
            },
            "status_text": "Слушает ВШБ в Meowave 🎧"
        }
    },
    "tokens": {},
    "messages": [
        {
            "id": "msg_001",
            "sender_id": "usr_quasar_001",
            "sender_name": "kotyar",
            "content": "Привет из Quasar Messenger!",
            "room_id": "global",
            "timestamp": int(time.time() * 1000)
        }
    ]
}

def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

class QuasarHandler(http.server.BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Quasar-Client")

    def _json_response(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def _read_json_body(self):
        content_len = int(self.headers.get("Content-Length", 0))
        if content_len == 0:
            return {}
        raw = self.rfile.read(content_len).decode("utf-8")
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def _get_auth_user(self):
        auth_header = self.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return None
        token = auth_header[len("Bearer "):].strip()
        user_email = DB["tokens"].get(token)
        if user_email and user_email in DB["users"]:
            return DB["users"][user_email]
        # Allow default mock token for convenience
        if token == "mock_quasar_jwt_token":
            return DB["users"]["test@quasar.id"]
        return None

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "/health":
            return self._json_response(200, {
                "status": "ok",
                "service": "Quasar ID & Messenger Mock API",
                "version": "1.0.0"
            })

        if path == "/api/v1/user/profile":
            user = self._get_auth_user()
            if not user:
                return self._json_response(401, {"error": "Unauthorized", "message": "Invalid or missing Bearer token"})
            return self._json_response(200, {
                "id": user["id"],
                "username": user["username"],
                "email": user["email"],
                "displayName": user["display_name"],
                "avatarUrl": user["avatar_url"],
                "profileMusic": user.get("profile_music"),
                "statusText": user.get("status_text")
            })

        if path == "/api/v1/messenger/chats":
            user = self._get_auth_user()
            if not user:
                return self._json_response(401, {"error": "Unauthorized"})
            return self._json_response(200, {
                "chats": [
                    {
                        "id": "chat_global",
                        "title": "Meowave Global Lounge",
                        "type": "room",
                        "lastMessage": DB["messages"][-1] if DB["messages"] else None,
                        "unreadCount": 0
                    }
                ]
            })

        self._json_response(404, {"error": "Not Found", "path": path})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_json_body()

        if path == "/api/v1/auth/register":
            email = body.get("email", "").strip().lower()
            username = body.get("username", "").strip()
            password = body.get("password", "")

            if not email or not password or not username:
                return self._json_response(400, {"error": "ValidationError", "message": "Email, username and password are required"})

            if email in DB["users"]:
                return self._json_response(409, {"error": "Conflict", "message": "User with this email already exists"})

            user_id = f"usr_{uuid.uuid4().hex[:12]}"
            new_user = {
                "id": user_id,
                "username": username,
                "email": email,
                "password_hash": hash_pw(password),
                "display_name": username,
                "avatar_url": "",
                "created_at": time.time(),
                "profile_music": None,
                "status_text": "Just joined Quasar ID"
            }
            DB["users"][email] = new_user

            token = f"qid_tok_{uuid.uuid4().hex}"
            DB["tokens"][token] = email

            return self._json_response(201, {
                "token": token,
                "refreshToken": f"qid_ref_{uuid.uuid4().hex}",
                "user": {
                    "id": user_id,
                    "username": username,
                    "email": email
                }
            })

        if path == "/api/v1/auth/login":
            identifier = body.get("identifier", "").strip().lower()
            password = body.get("password", "")

            # Look up by email or username
            user = DB["users"].get(identifier)
            if not user:
                for u in DB["users"].values():
                    if u["username"].lower() == identifier:
                        user = u
                        break

            if not user or user["password_hash"] != hash_pw(password):
                return self._json_response(401, {"error": "InvalidCredentials", "message": "Invalid Quasar ID/email or password"})

            token = f"qid_tok_{uuid.uuid4().hex}"
            DB["tokens"][token] = user["email"]

            return self._json_response(200, {
                "token": token,
                "refreshToken": f"qid_ref_{uuid.uuid4().hex}",
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "displayName": user["display_name"],
                    "avatarUrl": user["avatar_url"],
                    "profileMusic": user.get("profile_music")
                }
            })

        if path == "/api/v1/auth/refresh":
            refresh_token = body.get("refreshToken", "")
            if not refresh_token:
                return self._json_response(400, {"error": "MissingRefreshToken"})
            new_token = f"qid_tok_{uuid.uuid4().hex}"
            DB["tokens"][new_token] = "test@quasar.id"
            return self._json_response(200, {"token": new_token})

        if path == "/api/v1/messenger/sync":
            user = self._get_auth_user()
            if not user:
                return self._json_response(401, {"error": "Unauthorized"})

            incoming_messages = body.get("messages", [])
            for msg in incoming_messages:
                DB["messages"].append({
                    "id": f"msg_{uuid.uuid4().hex[:8]}",
                    "sender_id": user["id"],
                    "sender_name": user["username"],
                    "content": msg.get("content", ""),
                    "room_id": msg.get("room_id", "global"),
                    "timestamp": msg.get("timestamp", int(time.time() * 1000))
                })

            return self._json_response(200, {
                "syncedCount": len(incoming_messages),
                "totalMessages": len(DB["messages"])
            })

        self._json_response(404, {"error": "Not Found", "path": path})

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_json_body()

        if path == "/api/v1/user/profile/music":
            user = self._get_auth_user()
            if not user:
                return self._json_response(401, {"error": "Unauthorized"})

            track = body.get("track")
            broadcast = body.get("broadcast_status", True)

            user["profile_music"] = track
            if broadcast and track:
                user["status_text"] = f"Слушает {track.get('artist', '')} - {track.get('title', '')} 🎵"
            elif not track:
                user["status_text"] = ""

            return self._json_response(200, {
                "success": True,
                "profileMusic": user["profile_music"],
                "statusText": user["status_text"]
            })

        self._json_response(404, {"error": "Not Found", "path": path})

def run():
    print(f"[*] Starting Quasar ID Mock Server on http://localhost:{PORT}")
    print(f"[*] Test Account:")
    print(f"    Email: test@quasar.id")
    print(f"    Username: kotyar")
    print(f"    Password: password123")
    print(f"[*] Health Check: http://localhost:{PORT}/health")
    server = socketserver.TCPServer(("", PORT), QuasarHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[!] Shutting down server...")
        server.server_close()

if __name__ == "__main__":
    run()
