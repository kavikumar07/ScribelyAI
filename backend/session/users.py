
from typing import Dict, Optional
import time
import random

# In-memory storage for Demo purposes
# Format: { email: { "password": "...", "name": "..." } }
users = {
    "test@example.com": {"password": "password123", "name": "Test User"}
}

# Format: { email: { "otp": "123456", "expires": timestamp } }
otp_store: Dict[str, dict] = {}

def get_user(email: str) -> Optional[dict]:
    return users.get(email.lower())

def create_user(email: str, password: str, name: str):
    users[email.lower()] = {"password": password, "name": name}

def save_otp(email: str, otp: str):
    otp_store[email.lower()] = {
        "otp": otp,
        "expires": time.time() + 600 # 10 minutes expiry
    }

def verify_otp_code(email: str, code: str) -> bool:
    data = otp_store.get(email.lower())
    if not data:
        return False
    
    if time.time() > data["expires"]:
        del otp_store[email.lower()]
        return False
        
    return data["otp"] == code

def reset_user_password(email: str, new_password: str):
    email_lower = email.lower()
    if email_lower in users:
        users[email_lower]["password"] = new_password
        if email_lower in otp_store:
            del otp_store[email_lower]
        return True
    return False
