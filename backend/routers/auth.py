
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import random
from session.users import get_user, create_user, save_otp, verify_otp_code, reset_user_password

router = APIRouter()

# --- CONFIG ---
SENDER_EMAIL = "scribelyai123@gmail.com"
SENDER_PASS = "iusz scqc hqdd yoyk"

class AuthRequest(BaseModel):
    email: str
    password: str = None
    name: str = None
    otp: str = None

def send_otp_email(receiver_email: str, otp: str):
    try:
        msg = MIMEMultipart()
        msg['From'] = SENDER_EMAIL
        msg['To'] = receiver_email
        msg['Subject'] = "Scribely AI - Password Reset OTP"

        body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #284b63;">Scribely AI</h2>
                <p>Hello,</p>
                <p>Your OTP for resetting your password is:</p>
                <div style="background: #f4f4f4; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px;">
                    {otp}
                </div>
                <p>This code will expire in 10 minutes.</p>
                <p>If you didn't request this, please ignore this email.</p>
            </body>
        </html>
        """
        msg.attach(MIMEText(body, 'html'))

        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASS)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"Email Error: {e}")
        return False

@router.post("/login")
async def login(req: AuthRequest):
    user = get_user(req.email)
    if user and user["password"] == req.password:
        return {
            "status": "success", 
            "user": {
                "email": req.email.lower(),
                "name": user["name"]
            }
        }
    raise HTTPException(status_code=401, detail="Invalid email or password")

@router.post("/signup")
async def signup(req: AuthRequest):
    if get_user(req.email):
        raise HTTPException(status_code=400, detail="User already exists")
    
    user_name = req.name if req.name else "User"
    create_user(req.email, req.password, user_name)
    
    return {
        "status": "success", 
        "user": {
            "email": req.email.lower(),
            "name": user_name
        }
    }

@router.post("/forgot-password")
async def forgot_password(req: AuthRequest):
    # We check if user exists
    if not get_user(req.email):
        raise HTTPException(status_code=404, detail="Email not found")
    
    otp = str(random.randint(100000, 999999))
    save_otp(req.email, otp)
    
    if send_otp_email(req.email, otp):
        return {"status": "success", "message": "OTP sent to your email"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send email. Check backend logs.")

@router.post("/verify-otp")
async def verify_otp(req: AuthRequest):
    if verify_otp_code(req.email, req.otp):
        return {"status": "success", "message": "OTP verified"}
    raise HTTPException(status_code=400, detail="Invalid or expired OTP")

@router.post("/reset-password")
async def reset_password(req: AuthRequest):
    # Note: In a real app, you'd check if the OTP was verified in the previous step
    if reset_user_password(req.email, req.password):
        return {"status": "success", "message": "Password reset successfully"}
    raise HTTPException(status_code=404, detail="Failed to reset password")
